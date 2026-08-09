import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  /** Distance range to explain in the bubble, if known. */
  rangeKm?: [number, number];
  /** Icon-only trigger for tight spaces (feed card stat row, table cell). */
  compact?: boolean;
  className?: string;
}

// Reuses the app's existing "degraded" warning tone (var(--accent)) rather
// than the destructive/red token — this isn't an error, it's a known
// low-confidence stretch, so it should read as informational, not alarming.
export function GpsConfidenceBadge({ rangeKm, compact = false, className = "" }: Props) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="GPS signal was weak for part of this route"
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--accent)]/40 bg-[color:var(--accent)]/12 text-[color:var(--accent)] transition-colors hover:bg-[color:var(--accent)]/22 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40 ${
              compact ? "h-5 w-5 justify-center" : "px-2.5 py-1 text-xs font-medium"
            } ${className}`}
          >
            <AlertTriangle className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            {!compact && "GPS uncertain"}
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[240px] border border-border/40 bg-foreground text-background shadow-lg"
        >
          <p className="text-xs font-semibold">Weak GPS signal</p>
          <p className="mt-1 text-[11px] leading-relaxed text-background/75">
            Part of this route lost a clean signal, likely from tall buildings.{" "}
            {rangeKm
              ? `Actual distance may be anywhere from ${rangeKm[0].toFixed(1)}–${rangeKm[1].toFixed(1)} km.`
              : "Treat this section's distance as an estimate, not exact."}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
