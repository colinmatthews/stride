import { routePath } from "@/lib/mock-data";

interface Props {
  seed: number;
  width?: number;
  height?: number;
  className?: string;
  variant?: "light" | "dark";
}

// Faux map: gridded canvas with a vivid stroke "route" and start/end markers.
export function RouteMap({ seed, width = 600, height = 300, className = "", variant = "light" }: Props) {
  const path = routePath(seed, width, height);
  const bg = variant === "dark" ? "var(--secondary)" : "var(--surface-2)";
  const grid = variant === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  const startEnd = "var(--primary)";

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} preserveAspectRatio="xMidYMid slice" role="img" aria-label="Route map">
      <rect width={width} height={height} fill={bg} />
      {/* Grid */}
      <g stroke={grid} strokeWidth="1">
        {Array.from({ length: Math.ceil(width / 30) }).map((_, i) => (
          <line key={`v${i}`} x1={i * 30} y1={0} x2={i * 30} y2={height} />
        ))}
        {Array.from({ length: Math.ceil(height / 30) }).map((_, i) => (
          <line key={`h${i}`} x1={0} y1={i * 30} x2={width} y2={i * 30} />
        ))}
      </g>
      {/* Route halo */}
      <path d={path} fill="none" stroke="var(--primary)" strokeOpacity="0.25" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <path d={path} fill="none" stroke="var(--primary)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Start / end */}
      {(() => {
        const m = path.match(/M([\d.]+),([\d.]+)/);
        const last = [...path.matchAll(/L([\d.]+),([\d.]+)/g)].pop();
        if (!m || !last) return null;
        return (
          <g>
            <circle cx={+m[1]} cy={+m[2]} r="7" fill="var(--background)" stroke={startEnd} strokeWidth="3" />
            <circle cx={+last[1]} cy={+last[2]} r="7" fill={startEnd} stroke="var(--background)" strokeWidth="3" />
          </g>
        );
      })()}
    </svg>
  );
}
