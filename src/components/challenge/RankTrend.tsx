import { Minus, TrendingDown, TrendingUp } from "lucide-react";

/**
 * Arrow comparing an athlete's 7-day rank to their overall rank. Positive means
 * they are climbing.
 */
export function RankTrend({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-600">
        <TrendingUp className="h-3 w-3" />
        {delta}
      </span>
    );
  }

  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-primary">
        <TrendingDown className="h-3 w-3" />
        {Math.abs(delta)}
      </span>
    );
  }

  return <Minus className="h-3 w-3 text-muted-foreground" />;
}
