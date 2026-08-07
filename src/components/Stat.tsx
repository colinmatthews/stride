import type { ReactNode } from "react";

interface Props {
  label: string;
  value: string | number;
  unit?: string;
  emphasis?: boolean;
  /** Optional glyph rendered before the label. */
  icon?: ReactNode;
  /** Optional supporting line below the value. */
  caption?: string;
}
export function Stat({ label, value, unit, emphasis, icon, caption }: Props) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={`stat-num ${emphasis ? "text-3xl text-primary" : "text-2xl text-foreground"} mt-1 leading-none`}
      >
        {value}
        {unit && (
          <span className="text-sm text-muted-foreground font-body font-normal ml-1">{unit}</span>
        )}
      </div>
      {caption && <div className="mt-1.5 text-xs text-muted-foreground">{caption}</div>}
    </div>
  );
}
