import { describe, expect, it } from "vitest";
import { GpxParseError, parseGpx } from "./gpx.js";

type Pt = { lat: number; lon?: number; ele?: number | null; time?: string };

// Straight north-going track: 0.001 deg of latitude is about 0.1112 km.
function northTrack(count: number, stepDeg = 0.001, withEle = true): Pt[] {
  return Array.from({ length: count }, (_, i) => ({
    lat: 45 + i * stepDeg,
    lon: 7,
    ele: withEle ? 100 + i : null,
  }));
}

function trkpt(p: Pt): string {
  const ele = p.ele === null || p.ele === undefined ? "" : `<ele>${p.ele}</ele>`;
  const time = p.time ? `<time>${p.time}</time>` : "";
  return `<trkpt lat="${p.lat}" lon="${p.lon ?? 7}">${ele}${time}</trkpt>`;
}

function gpx(points: Pt[], opts: { creator?: string; trkName?: string; meta?: string } = {}) {
  const creator = opts.creator === undefined ? "" : ` creator="${opts.creator}"`;
  const meta = opts.meta ? `<metadata><name>${opts.meta}</name></metadata>` : "";
  const name = opts.trkName ? `<name>${opts.trkName}</name>` : "";
  return (
    `<?xml version="1.0"?><gpx version="1.1"${creator}>${meta}` +
    `<trk>${name}<trkseg>${points.map(trkpt).join("")}</trkseg></trk></gpx>`
  );
}

describe("parseGpx metadata", () => {
  it("extracts creator and track name with entity decoding", () => {
    const xml = gpx(northTrack(3), {
      creator: "A &amp; B &quot;GPS&quot;",
      trkName: "Rock &lt;&amp;&gt; Roll",
    });
    const r = parseGpx(xml);
    expect(r.creator).toBe('A & B "GPS"');
    expect(r.name).toBe("Rock <&> Roll");
  });

  it("falls back to metadata name, then null", () => {
    expect(parseGpx(gpx(northTrack(3), { meta: "Meta  " })).name).toBe("Meta");
    const none = parseGpx(gpx(northTrack(3)));
    expect(none.name).toBeNull();
    expect(none.creator).toBeNull();
  });

  it("prefers trk name over metadata name and caps at 200 chars", () => {
    const r = parseGpx(gpx(northTrack(3), { trkName: "x".repeat(300), meta: "Meta" }));
    expect(r.name).toBe("x".repeat(200));
  });
});

describe("parseGpx points", () => {
  it("accepts either attribute order and quote style", () => {
    const xml =
      `<gpx creator='single'><trk><trkseg>` +
      `<trkpt lon='7' lat='45'><ele>1</ele></trkpt>` +
      `<trkpt lat="45.01" lon="7"><ele>2</ele></trkpt>` +
      `<trkpt lon = "7.0" lat = '45.02'/>` +
      `</trkseg></trk></gpx>`;
    const r = parseGpx(xml);
    expect(r.creator).toBe("single");
    expect(r.stream?.latitude).toEqual([45, 45.01, 45.02]);
    expect(r.stream?.longitude).toEqual([7, 7, 7]);
  });

  it("computes distance within 1%", () => {
    const r = parseGpx(gpx(northTrack(101)));
    expect(r.distanceKm).toBeGreaterThan(11.12 * 0.99);
    expect(r.distanceKm).toBeLessThan(11.12 * 1.01);
    const d = r.stream!.distanceKm;
    expect(d[0]).toBe(0);
    expect(d[d.length - 1]).toBeCloseTo(11.12, 1);
  });

  it("thins points closer than 5 m but keeps first and last", () => {
    // 0.00001 deg is about 1.1 m.
    const pts = northTrack(200, 0.00001);
    const r = parseGpx(gpx(pts));
    const lat = r.stream!.latitude;
    expect(lat.length).toBeLessThan(60);
    expect(lat.length).toBeGreaterThan(30);
    expect(lat[0]).toBe(45);
    expect(lat[lat.length - 1]).toBe(Number((45 + 199 * 0.00001).toFixed(6)));
    const d = r.stream!.distanceKm;
    for (let i = 1; i < d.length - 1; i++) expect(d[i] - d[i - 1]).toBeGreaterThanOrEqual(0.0045);
  });

  it("downsamples to 20,000 points keeping first and last", () => {
    const n = 25_000;
    const r = parseGpx(gpx(northTrack(n, 0.0001)));
    const s = r.stream!;
    expect(s.latitude).toHaveLength(20_000);
    expect(s.distanceKm).toHaveLength(20_000);
    expect(s.elevationM).toHaveLength(20_000);
    expect(s.longitude).toHaveLength(20_000);
    expect(s.latitude[0]).toBe(45);
    expect(s.latitude[19_999]).toBe(Number((45 + (n - 1) * 0.0001).toFixed(6)));
    expect(s.elevationM[0]).toBe(100);
    expect(s.elevationM[19_999]).toBe(100 + n - 1);
  });

  it("rounds stream values", () => {
    const r = parseGpx(
      gpx([
        { lat: 45.123456789, lon: 7.123456789, ele: 100.123 },
        { lat: 45.2, lon: 7.2, ele: 200.06 },
      ]),
    );
    expect(r.stream!.latitude[0]).toBe(45.123457);
    expect(r.stream!.longitude[0]).toBe(7.123457);
    expect(r.stream!.elevationM).toEqual([100.1, 200.1]);
    expect(r.stream!.distanceKm[1]).toBe(Math.round(r.stream!.distanceKm[1] * 1000) / 1000);
  });

  it("uses rtept only when there are no trkpt", () => {
    const rte = `<rte><rtept lat="45" lon="7"><ele>1</ele></rtept><rtept lat="45.01" lon="7"><ele>2</ele></rtept></rte>`;
    expect(parseGpx(`<gpx>${rte}</gpx>`).stream?.latitude).toEqual([45, 45.01]);
    const mixed = `<gpx>${rte}<trk><trkseg>${northTrack(3).map(trkpt).join("")}</trkseg></trk></gpx>`;
    expect(parseGpx(mixed).stream?.latitude).toEqual([45, 45.001, 45.002]);
  });
});

describe("parseGpx elevation", () => {
  it("interpolates missing elevation by distance and copies at the ends", () => {
    const pts = northTrack(5, 0.001, false);
    pts[1].ele = 10;
    pts[3].ele = 30;
    const r = parseGpx(gpx(pts));
    expect(r.stream!.elevationM).toEqual([10, 10, 20, 30, 30]);
  });

  it("returns a null stream when no point has elevation", () => {
    const r = parseGpx(gpx(northTrack(5, 0.001, false)));
    expect(r.stream).toBeNull();
    expect(r.distanceKm).toBeGreaterThan(0);
  });
});

describe("parseGpx time", () => {
  it("derives startedAt and movingSeconds", () => {
    const pts = northTrack(3).map((p, i) => ({
      ...p,
      time: new Date(Date.UTC(2026, 0, 1, 8, 0, i * 30)).toISOString(),
    }));
    const r = parseGpx(gpx(pts));
    expect(r.startedAt).toEqual(new Date("2026-01-01T08:00:00.000Z"));
    expect(r.movingSeconds).toBe(60);
  });

  it("ignores unparseable times and handles missing ones", () => {
    const pts = northTrack(3);
    pts[0].time = "garbage";
    pts[1].time = "2026-01-01T08:00:00Z";
    pts[2].time = "2026-01-01T08:00:10Z";
    const r = parseGpx(gpx(pts));
    expect(r.startedAt).toEqual(new Date("2026-01-01T08:00:00Z"));
    expect(r.movingSeconds).toBe(10);
    const none = parseGpx(gpx(northTrack(3)));
    expect(none.startedAt).toBeNull();
    expect(none.movingSeconds).toBe(0);
  });

  it("gives 0 movingSeconds with a single timestamp", () => {
    const pts = northTrack(3);
    pts[1].time = "2026-01-01T08:00:00Z";
    const r = parseGpx(gpx(pts));
    expect(r.movingSeconds).toBe(0);
    expect(r.startedAt).not.toBeNull();
  });
});

describe("parseGpx errors", () => {
  it("rejects non-GPX input", () => {
    expect(() => parseGpx("<html></html>")).toThrow(GpxParseError);
    expect(() => parseGpx("<html></html>")).toThrow("Not a GPX file");
    expect(() => parseGpx("<gpxx></gpxx>")).toThrow("Not a GPX file");
    expect(() => parseGpx("")).toThrow("Not a GPX file");
  });

  it("rejects fewer than 2 valid points", () => {
    expect(() => parseGpx("<gpx></gpx>")).toThrow("GPX has no track points");
    expect(() => parseGpx(gpx(northTrack(1)))).toThrow(GpxParseError);
  });

  it("skips invalid coordinates", () => {
    const pts: Pt[] = [
      { lat: 45, lon: 7 },
      { lat: 91, lon: 7 },
      { lat: 45, lon: 181 },
      { lat: Number.NaN, lon: 7 },
      { lat: 45.001, lon: 7 },
    ];
    const xml = gpx(pts).replace('lon="NaN"', 'lon="7"');
    const r = parseGpx(xml);
    expect(r.distanceKm).toBeCloseTo(0.11, 2);
    expect(() => parseGpx(gpx([{ lat: 45 }, { lat: 95 }, { lat: 45, lon: -200 }]))).toThrow(
      "GPX has no track points",
    );
  });

  it("rejects input over 15 MB", () => {
    const big = "<gpx>" + " ".repeat(15 * 1024 * 1024 + 1) + "</gpx>";
    expect(() => parseGpx(big)).toThrow(GpxParseError);
  });

  it("stays fast on pathological input", () => {
    const evil = "<gpx>" + "<trkpt lat=".repeat(50_000) + "</gpx>";
    const start = Date.now();
    expect(() => parseGpx(evil)).toThrow(GpxParseError);
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
