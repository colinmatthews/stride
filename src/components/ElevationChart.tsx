import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ElevationPoint, FlatRegion } from "@/lib/api";

export function ElevationChart({
  id,
  data,
  color,
  domain,
  heightClass,
  syncId,
  markers = [],
  flatRegion,
}: {
  id: string;
  data: ElevationPoint[];
  color: string;
  domain: number[];
  heightClass: string;
  syncId?: string;
  markers?: ElevationPoint[];
  flatRegion?: FlatRegion | null;
}) {
  const gradientId = `elevGrad-${id}`;
  return (
    <div className={heightClass}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} syncId={syncId}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="km"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(value) => `${Math.round(value)} km`}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={domain}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(value) => `${Number(value).toFixed(2)} km`}
            formatter={(value) => [`${Math.round(Number(value))} m`, "Elevation"]}
          />
          {flatRegion && (
            <ReferenceArea
              x1={flatRegion.fromKm}
              x2={flatRegion.toKm}
              fill="var(--destructive)"
              fillOpacity={0.08}
              stroke="var(--destructive)"
              strokeOpacity={0.3}
              strokeDasharray="3 3"
              label={{
                value: "Altimeter stopped",
                position: "insideTopLeft",
                fill: "var(--destructive)",
                fontSize: 10,
              }}
            />
          )}
          <Area
            dataKey="elev"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
          {markers.map((marker) => (
            <ReferenceDot
              key={marker.km}
              x={marker.km}
              y={marker.elev}
              r={3.5}
              fill="var(--destructive)"
              stroke="var(--surface)"
              strokeWidth={1.5}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartLabel({
  tone,
  title,
  detail,
}: {
  tone: "muted" | "primary";
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span
        className={`h-2 w-2 rounded-full ${tone === "primary" ? "bg-primary" : "bg-muted-foreground"}`}
      />
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
        {title}
      </span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </div>
  );
}
