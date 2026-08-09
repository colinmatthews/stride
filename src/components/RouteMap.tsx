import { routePath, type RouteConfidenceSegment } from "@/lib/mock-data";
import { computeConfidenceIndexRange } from "@/lib/route-map-confidence";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  seed: number;
  width?: number;
  height?: number;
  className?: string;
  variant?: "light" | "dark";
  showScale?: boolean;
  distanceKm?: number;
  distanceRangeKm?: [number, number];
  /** Stretches of the route the app isn't confident about (0-1 fractions along the path). */
  confidence?: RouteConfidenceSegment[];
}

function rnd(seed: number) {
  let current = seed || 1;
  return () => {
    current = (current * 9301 + 49297) % 233280;
    return current / 233280;
  };
}

// A cartographic-looking route preview. Deterministic from seed — same seed
// renders the same "neighborhood" (street grid, water, park) every time.
export function RouteMap({
  seed,
  width = 600,
  height = 300,
  className = "",
  variant = "light",
  showScale = true,
  distanceKm,
  distanceRangeKm,
  confidence,
}: Props) {
  const path = routePath(seed, width, height);

  const colors =
    variant === "dark"
      ? {
          base: "#1e1a17",
          street: "rgba(255,255,255,0.08)",
          streetMajor: "rgba(255,255,255,0.14)",
          park: "rgba(122,160,98,0.18)",
          water: "rgba(110,160,196,0.35)",
          waterEdge: "rgba(110,160,196,0.6)",
          label: "rgba(255,255,255,0.6)",
          markerRing: "#1e1a17",
        }
      : {
          base: "#f2ece3",
          street: "rgba(40,30,20,0.08)",
          streetMajor: "rgba(40,30,20,0.18)",
          park: "rgba(138,174,112,0.28)",
          water: "rgba(140,182,210,0.55)",
          waterEdge: "rgba(100,148,182,0.75)",
          label: "rgba(40,30,20,0.55)",
          markerRing: "#f2ece3",
        };

  const random = rnd(seed * 19 + 11);
  const features = buildFeatures(random, width, height);
  const points = parsePoints(path);
  const smoothedPath = smoothPoints(points);
  const startEnd = getStartEnd(points);
  const uncertainSegments = (confidence ?? []).map((segment) => {
    const { startIdx, endIdx } = computeConfidenceIndexRange(
      segment.startT,
      segment.endT,
      points.length,
    );
    const segPoints = points.slice(startIdx, endIdx + 1);
    return {
      path: smoothPoints(segPoints),
      box: boundingBox(segPoints),
      startTick: perpTick(points, startIdx),
      endTick: perpTick(points, endIdx),
      km: distanceKm !== undefined ? (segment.endT - segment.startT) * distanceKm : undefined,
    };
  });

  const gridId = `grid-${seed}`;
  const clipId = `clip-${seed}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Route map"
    >
      <defs>
        <clipPath id={clipId}>
          <rect width={width} height={height} />
        </clipPath>
        <pattern id={gridId} x="0" y="0" width="56" height="56" patternUnits="userSpaceOnUse">
          <path d={`M 56 0 L 0 0 0 56`} fill="none" stroke={colors.street} strokeWidth="0.6" />
        </pattern>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        {/* base */}
        <rect width={width} height={height} fill={colors.base} />

        {/* park (optional) */}
        {features.park && (
          <path d={features.park} fill={colors.park} stroke={colors.park} strokeWidth="1" />
        )}

        {/* water (optional) */}
        {features.water && (
          <path
            d={features.water}
            fill={colors.water}
            stroke={colors.waterEdge}
            strokeWidth="0.8"
          />
        )}

        {/* fine street grid */}
        <rect width={width} height={height} fill={`url(#${gridId})`} />

        {/* diagonal arterial streets */}
        {features.arterials.map((d, i) => (
          <path
            key={`a-${i}`}
            d={d}
            fill="none"
            stroke={colors.streetMajor}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        ))}

        {/* uncertain-zone highlight — soft wash + hover target, sits under the route */}
        {uncertainSegments.map((segment, i) => (
          <TooltipProvider key={`zone-${i}`} delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <rect
                  x={segment.box.x}
                  y={segment.box.y}
                  width={segment.box.width}
                  height={segment.box.height}
                  rx={10}
                  fill="var(--accent)"
                  opacity={0.16}
                  className="cursor-help transition-opacity hover:opacity-[0.28]"
                  tabIndex={0}
                  aria-label="Weak GPS signal zone"
                />
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="max-w-[220px] border border-border/40 bg-foreground text-background shadow-lg"
              >
                <p className="text-xs font-semibold">Weak signal here</p>
                <p className="mt-1 text-[11px] leading-relaxed text-background/75">
                  {segment.km !== undefined
                    ? `About ${segment.km.toFixed(1)} km of this route lost a clean GPS fix.`
                    : "This stretch lost a clean GPS fix."}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}

        {/* route halo */}
        <path
          d={smoothedPath}
          fill="none"
          stroke="var(--primary)"
          strokeOpacity="0.25"
          strokeWidth={10}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* route */}
        <path
          d={smoothedPath}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* uncertain stretches — dashed overlay, cartographic "unconfirmed" convention */}
        {uncertainSegments.map((segment, i) => (
          <g key={`unc-${i}`} className="pointer-events-none">
            <path
              d={segment.path}
              fill="none"
              stroke="var(--accent)"
              strokeOpacity="0.35"
              strokeWidth={9}
              strokeLinecap="round"
            />
            <path
              d={segment.path}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeDasharray="3 5"
            />
            {/* boundary ticks — bracket exactly where the weak stretch starts/ends */}
            {segment.startTick && (
              <line
                x1={segment.startTick[0][0]}
                y1={segment.startTick[0][1]}
                x2={segment.startTick[1][0]}
                y2={segment.startTick[1][1]}
                stroke="var(--accent)"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            )}
            {segment.endTick && (
              <line
                x1={segment.endTick[0][0]}
                y1={segment.endTick[0][1]}
                x2={segment.endTick[1][0]}
                y2={segment.endTick[1][1]}
                stroke="var(--accent)"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            )}
          </g>
        ))}

        {/* start / end markers */}
        {startEnd && (
          <g>
            <circle
              cx={startEnd.start[0]}
              cy={startEnd.start[1]}
              r={7}
              fill={colors.markerRing}
              stroke="var(--primary)"
              strokeWidth={3}
            />
            <circle
              cx={startEnd.end[0]}
              cy={startEnd.end[1]}
              r={7}
              fill="var(--primary)"
              stroke={colors.markerRing}
              strokeWidth={3}
            />
          </g>
        )}

        {/* GPS confidence chip */}
        {uncertainSegments.length > 0 && (
          <g>
            <rect x={16} y={16} width={130} height={20} fill={colors.markerRing} opacity={0.92} />
            <text
              x={26}
              y={30}
              fontSize="9"
              fontFamily="'JetBrains Mono', ui-monospace, monospace"
              fontWeight="600"
              letterSpacing="0.1em"
              fill="var(--accent)"
            >
              ⚠ GPS SIGNAL WEAK
            </text>
          </g>
        )}

        {/* scale bar + distance label */}
        {showScale && (
          <g>
            <rect
              x={width - 96}
              y={height - 28}
              width={72}
              height={18}
              fill={colors.markerRing}
              opacity={0.9}
            />
            <line
              x1={width - 88}
              y1={height - 16}
              x2={width - 32}
              y2={height - 16}
              stroke={colors.label}
              strokeWidth={1.2}
            />
            <line
              x1={width - 88}
              y1={height - 19}
              x2={width - 88}
              y2={height - 13}
              stroke={colors.label}
              strokeWidth={1.2}
            />
            <line
              x1={width - 32}
              y1={height - 19}
              x2={width - 32}
              y2={height - 13}
              stroke={colors.label}
              strokeWidth={1.2}
            />
            <text
              x={width - 60}
              y={height - 11}
              textAnchor="middle"
              fontSize="9"
              fontFamily="'JetBrains Mono', ui-monospace, monospace"
              fontWeight="600"
              letterSpacing="0.1em"
              fill={colors.label}
            >
              1 KM
            </text>
            {distanceKm !== undefined && (
              <text
                x={16}
                y={height - 14}
                fontSize="10"
                fontFamily="'JetBrains Mono', ui-monospace, monospace"
                fontWeight="600"
                letterSpacing="0.18em"
                fill={distanceRangeKm ? "var(--accent)" : colors.label}
              >
                {distanceRangeKm
                  ? `~${distanceRangeKm[0].toFixed(1)}–${distanceRangeKm[1].toFixed(1)} KM · EST`
                  : `${distanceKm.toFixed(2)} KM · ROUTE`}
              </text>
            )}
          </g>
        )}
      </g>
    </svg>
  );
}

function buildFeatures(random: () => number, width: number, height: number) {
  const arterials: string[] = [];
  // 2-3 long diagonal arterials across the map
  const count = 2 + Math.floor(random() * 2);
  for (let i = 0; i < count; i += 1) {
    const y1 = random() * height;
    const y2 = random() * height;
    const slope = (y2 - y1) / width;
    arterials.push(`M -10 ${y1 - slope * 10} L ${width + 10} ${y2 + slope * 10}`);
  }
  // 1-2 cross streets
  const crossCount = 1 + Math.floor(random() * 2);
  for (let i = 0; i < crossCount; i += 1) {
    const x1 = random() * width;
    const x2 = random() * width;
    arterials.push(`M ${x1} -10 L ${x2} ${height + 10}`);
  }

  // Water feature — a winding strip along one edge, ~50% of the time
  let water: string | undefined;
  if (random() > 0.45) {
    const side = random() > 0.5 ? "bottom" : "top";
    const amp = 24 + random() * 18;
    const baseY = side === "bottom" ? height - 18 : 18;
    const points: [number, number][] = [];
    const segments = 12;
    for (let i = 0; i <= segments; i += 1) {
      const x = (i / segments) * width;
      const y = baseY + Math.sin(i * 0.9 + random() * 2) * amp;
      points.push([x, y]);
    }
    const edgeY = side === "bottom" ? height + 40 : -40;
    water = [
      `M ${points[0][0]},${points[0][1]}`,
      ...points.slice(1).map(([x, y]) => `L ${x},${y}`),
      `L ${width},${edgeY}`,
      `L 0,${edgeY}`,
      "Z",
    ].join(" ");
  }

  // Park feature — a soft blob somewhere inside, ~60% of the time
  let park: string | undefined;
  if (random() > 0.4) {
    const cx = width * (0.25 + random() * 0.5);
    const cy = height * (0.25 + random() * 0.5);
    const rx = 40 + random() * 50;
    const ry = 30 + random() * 40;
    const steps = 16;
    const pts: [number, number][] = [];
    for (let i = 0; i < steps; i += 1) {
      const t = (i / steps) * Math.PI * 2;
      const jitter = 0.75 + random() * 0.5;
      pts.push([cx + Math.cos(t) * rx * jitter, cy + Math.sin(t) * ry * jitter]);
    }
    park = [
      `M ${pts[0][0]},${pts[0][1]}`,
      ...pts.slice(1).map(([x, y]) => `L ${x},${y}`),
      "Z",
    ].join(" ");
  }

  return { arterials, water, park };
}

function parsePoints(path: string): [number, number][] {
  const moveMatch = path.match(/M([\d.]+),([\d.]+)/);
  if (!moveMatch) return [];
  const lineMatches = [...path.matchAll(/L([\d.]+),([\d.]+)/g)];
  return [
    [Number(moveMatch[1]), Number(moveMatch[2])],
    ...lineMatches.map((match) => [Number(match[1]), Number(match[2])] as [number, number]),
  ];
}

function smoothPoints(points: [number, number][]): string {
  if (points.length < 2) return "";
  if (points.length < 3) {
    return `M ${points[0][0]},${points[0][1]} L ${points[1][0]},${points[1][1]}`;
  }

  const parts: string[] = [`M ${points[0][0]},${points[0][1]}`];
  for (let i = 1; i < points.length - 1; i += 1) {
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    const midX = (cx + nx) / 2;
    const midY = (cy + ny) / 2;
    parts.push(`Q ${cx},${cy} ${midX},${midY}`);
  }
  const last = points[points.length - 1];
  parts.push(`T ${last[0]},${last[1]}`);
  return parts.join(" ");
}

function boundingBox(points: [number, number][], pad = 14) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX - pad,
    y: minY - pad,
    width: Math.max(maxX - minX, 4) + pad * 2,
    height: Math.max(maxY - minY, 4) + pad * 2,
  };
}

// Perpendicular tick at points[idx], oriented to the local path direction —
// used to bracket exactly where an uncertain stretch begins/ends.
function perpTick(
  points: [number, number][],
  idx: number,
  length = 9,
): [[number, number], [number, number]] | null {
  if (points.length < 2) return null;
  const a = points[Math.max(0, idx - 1)];
  const b = points[Math.min(points.length - 1, idx + 1)];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * length;
  const py = (dx / len) * length;
  const [cx, cy] = points[idx];
  return [
    [cx + px, cy + py],
    [cx - px, cy - py],
  ];
}

function getStartEnd(points: [number, number][]) {
  if (points.length < 2) return null;
  return {
    start: points[0],
    end: points[points.length - 1],
  };
}
