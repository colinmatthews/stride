/**
 * Flat progress bar used for challenge goals and leaderboard standings.
 *
 * Deliberately not `ui/progress` (Radix): that primitive is unused in this
 * codebase and carries rounded, animated styling that does not match the
 * squared-off editorial look the rest of the app uses.
 */
interface Props {
  /** Completion from 0 to 100. Values outside the range are clamped. */
  value: number;
  className?: string;
  trackClassName?: string;
  barClassName?: string;
}

export function Meter({ value, className = "h-1.5", trackClassName, barClassName }: Props) {
  const pct = Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`overflow-hidden ${trackClassName ?? "bg-muted"} ${className}`}
    >
      <div
        className={`h-full transition-all ${barClassName ?? "bg-primary"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
