interface Props {
  label: string;
  value: string | number;
  unit?: string;
  emphasis?: boolean;
}
export function Stat({ label, value, unit, emphasis }: Props) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className={`stat-num ${emphasis ? "text-3xl text-primary" : "text-2xl text-foreground"} mt-1 leading-none`}>
        {value}
        {unit && <span className="text-sm text-muted-foreground font-body font-normal ml-1">{unit}</span>}
      </div>
    </div>
  );
}
