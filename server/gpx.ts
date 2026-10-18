// GPX import: turns an uploaded GPX track into a recorded activity stream.

export type GpxStream = {
  distanceKm: number[];
  elevationM: number[];
  latitude: number[];
  longitude: number[];
};

export type GpxActivity = {
  /** <trk><name> or <metadata><name>, if present. */
  name: string | null;
  /** The GPX `creator` attribute, e.g. "Garmin Edge 840" or "StravaGPX". */
  creator: string | null;
  distanceKm: number;
  /** Seconds between first and last timestamped point; 0 without timestamps. */
  movingSeconds: number;
  startedAt: Date | null;
  /** Null when the track has no <ele> values. */
  stream: GpxStream | null;
};

export class GpxParseError extends Error {}

const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_STREAM_POINTS = 20_000;
const MIN_SPACING_KM = 0.005;
const EARTH_RADIUS_KM = 6371.0088;

type RawPoint = { lat: number; lon: number; ele: number | null; time: number | null };
type KeptPoint = RawPoint & { dist: number };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos);/g, (_m, name: string) => ENTITIES[name] ?? "");
}

function cleanText(raw: string): string {
  const trimmed = raw.trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(trimmed);
  return cdata ? cdata[1].trim() : decodeEntities(trimmed).trim();
}

function isTagBoundary(ch: string | undefined): boolean {
  return ch === ">" || ch === "/" || ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

type Element = { attrs: string; body: string; end: number };

// Linear scan for the next <tag ...>body</tag> (or self-closing) at or after `from`.
function nextElement(xml: string, tag: string, from: number): Element | null {
  const open = `<${tag}`;
  let start = xml.indexOf(open, from);
  while (start !== -1 && !isTagBoundary(xml[start + open.length])) {
    start = xml.indexOf(open, start + open.length);
  }
  if (start === -1) return null;
  const tagEnd = xml.indexOf(">", start);
  if (tagEnd === -1) return null;
  const attrStart = start + open.length;
  const selfClosing = xml[tagEnd - 1] === "/";
  const attrs = xml.slice(attrStart, selfClosing ? tagEnd - 1 : tagEnd);
  if (selfClosing) return { attrs, body: "", end: tagEnd + 1 };
  const close = xml.indexOf(`</${tag}>`, tagEnd + 1);
  if (close === -1) return { attrs, body: "", end: tagEnd + 1 };
  return { attrs, body: xml.slice(tagEnd + 1, close), end: close + tag.length + 3 };
}

function childText(body: string, tag: string): string | null {
  const el = nextElement(body, tag, 0);
  if (!el) return null;
  const text = cleanText(el.body);
  return text === "" ? null : text;
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs);
  if (!m) return null;
  return decodeEntities(m[1] ?? m[2] ?? "");
}

function toNumber(text: string | null): number | null {
  if (text === null || text.trim() === "") return null;
  const n = Number(text.trim());
  return Number.isFinite(n) ? n : null;
}

function toTime(text: string | null): number | null {
  if (text === null) return null;
  const t = Date.parse(text);
  return Number.isNaN(t) ? null : t;
}

function haversineKm(a: RawPoint, b: RawPoint): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function collectPoints(xml: string, tag: string): { points: RawPoint[]; found: number } {
  const points: RawPoint[] = [];
  let found = 0;
  let pos = 0;
  for (;;) {
    const el = nextElement(xml, tag, pos);
    if (!el) break;
    pos = el.end;
    found++;
    const lat = toNumber(attr(el.attrs, "lat"));
    const lon = toNumber(attr(el.attrs, "lon"));
    if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    points.push({
      lat,
      lon,
      ele: toNumber(childText(el.body, "ele")),
      time: toTime(childText(el.body, "time")),
    });
  }
  return { points, found };
}

function extractName(xml: string): string | null {
  const trk = nextElement(xml, "trk", 0);
  if (trk) {
    const segAt = trk.body.indexOf("<trkseg");
    const name = childText(segAt === -1 ? trk.body : trk.body.slice(0, segAt), "name");
    if (name) return name.slice(0, 200);
  }
  const meta = nextElement(xml, "metadata", 0);
  const name = meta ? childText(meta.body, "name") : null;
  return name ? name.slice(0, 200) : null;
}

function thin(points: RawPoint[]): KeptPoint[] {
  const kept: KeptPoint[] = [{ ...points[0], dist: 0 }];
  const last = points.length - 1;
  for (let i = 1; i <= last; i++) {
    const prev = kept[kept.length - 1];
    const d = haversineKm(prev, points[i]);
    if (i < last && d < MIN_SPACING_KM) continue;
    kept.push({ ...points[i], dist: prev.dist + d });
  }
  return kept;
}

function downsample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.round((i * (items.length - 1)) / (max - 1))]);
  return out;
}

// Linear interpolation by distance; copies the nearest known value at the ends.
function fillElevation(points: KeptPoint[]): number[] | null {
  const known: number[] = [];
  points.forEach((p, i) => {
    if (p.ele !== null) known.push(i);
  });
  if (known.length === 0) return null;
  const out: number[] = new Array(points.length);
  let k = 0;
  for (let i = 0; i < points.length; i++) {
    const ele = points[i].ele;
    if (ele !== null) {
      out[i] = ele;
      continue;
    }
    while (k < known.length && known[k] < i) k++;
    const hi = k < known.length ? known[k] : -1;
    const lo = k > 0 ? known[k - 1] : -1;
    if (lo === -1) out[i] = points[hi].ele as number;
    else if (hi === -1) out[i] = points[lo].ele as number;
    else {
      const a = points[lo];
      const b = points[hi];
      const span = b.dist - a.dist;
      const t = span > 0 ? (points[i].dist - a.dist) / span : 0;
      out[i] = (a.ele as number) + t * ((b.ele as number) - (a.ele as number));
    }
  }
  return out;
}

const round = (n: number, decimals: number): number => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

export function parseGpx(xml: string): GpxActivity {
  if (Buffer.byteLength(xml, "utf8") > MAX_INPUT_BYTES) {
    throw new GpxParseError("GPX file is too large (max 15 MB)");
  }
  const root = nextElement(xml, "gpx", 0);
  if (!root) throw new GpxParseError("Not a GPX file");

  const creatorRaw = attr(root.attrs, "creator");
  const creator = creatorRaw && creatorRaw.trim() !== "" ? creatorRaw.trim() : null;

  const track = collectPoints(xml, "trkpt");
  const points = track.found === 0 ? collectPoints(xml, "rtept").points : track.points;
  if (points.length < 2) throw new GpxParseError("GPX has no track points");

  const times = points.map((p) => p.time).filter((t): t is number => t !== null);
  const startedAt = times.length > 0 ? new Date(times[0]) : null;
  const movingSeconds =
    times.length >= 2 ? Math.max(0, Math.round((times[times.length - 1] - times[0]) / 1000)) : 0;

  const kept = downsample(thin(points), MAX_STREAM_POINTS);
  const elevation = fillElevation(kept);

  const stream: GpxStream | null = elevation && {
    distanceKm: kept.map((p) => round(p.dist, 3)),
    elevationM: elevation.map((e) => round(e, 1)),
    latitude: kept.map((p) => round(p.lat, 6)),
    longitude: kept.map((p) => round(p.lon, 6)),
  };

  return {
    name: extractName(xml),
    creator,
    distanceKm: round(kept[kept.length - 1].dist, 2),
    movingSeconds,
    startedAt,
    stream,
  };
}
