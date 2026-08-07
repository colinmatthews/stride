import { ArrowUpRight } from "lucide-react";
import type { ChallengeMeta, ChallengePace, ChallengeProgress } from "./metric";

/** Rate achieved so far against the rate still needed, in plain language. */
export function PaceSummary({
  meta,
  progress,
  pace,
}: {
  meta: ChallengeMeta;
  progress: ChallengeProgress;
  pace: ChallengePace;
}) {
  return (
    <section
      className={`mt-6 border p-6 ${pace.onPace ? "border-primary/40 bg-primary/5" : "border-border bg-surface"}`}
    >
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
        <ArrowUpRight className="h-3.5 w-3.5" />
        {meta.closed ? "Final" : pace.onPace ? "On pace" : "Behind pace"}
      </div>
      <p className="mt-2 text-sm leading-relaxed">
        Averaging{" "}
        <span className="font-semibold text-primary">
          {pace.averagePerDay} {meta.unit}/day
        </span>{" "}
        over {pace.daysElapsed} {pace.daysElapsed === 1 ? "day" : "days"}
        {meta.closed ? (
          <>. This challenge has closed.</>
        ) : (
          <>
            {" "}
            — you need{" "}
            <span className="font-semibold">
              {pace.dailyTarget} {meta.unit}/day
            </span>{" "}
            to reach {meta.goal} {meta.unit}
          </>
        )}
        {progress.pendingActivityCount > 0 && (
          <>
            , with{" "}
            <span className="font-semibold text-primary">
              {progress.pendingActivityCount}{" "}
              {progress.pendingActivityCount === 1 ? "activity" : "activities"}
            </span>{" "}
            still waiting to be counted
          </>
        )}
        .
      </p>
    </section>
  );
}
