import { Trophy } from "lucide-react";
import { Meter } from "@/components/Meter";
import type { ChallengeMeta, ChallengeProgress } from "./metric";

/**
 * Headline figure: confirmed total against the goal, with pending activity
 * surfaced separately so the athlete can see what confirming would add.
 */
export function ProgressHero({
  meta,
  progress,
}: {
  meta: ChallengeMeta;
  progress: ChallengeProgress;
}) {
  return (
    <section className="relative overflow-hidden bg-secondary p-8 text-secondary-foreground">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="relative">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/60">
          <Trophy className="h-3.5 w-3.5 text-primary" /> Your progress
        </div>
        <div className="mt-4 flex items-baseline gap-3">
          <span className="stat-num font-display text-[5rem] font-bold leading-none tracking-[-0.04em] text-primary">
            {progress.countedTotal.toFixed(1)}
          </span>
          <span className="stat-num text-2xl font-semibold text-secondary-foreground/70">
            / {meta.goal} {meta.unit}
          </span>
        </div>

        <Meter
          value={progress.percentComplete}
          className="mt-6 h-2"
          trackClassName="bg-secondary-foreground/15"
          barClassName="bg-primary duration-500"
        />

        <div className="mt-3 flex flex-wrap justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/60">
          <span>{Math.round(progress.percentComplete)}% complete</span>
          <span>
            {progress.remaining} {meta.unit} remaining
          </span>
        </div>
        {progress.pendingTotal > 0 && (
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
            +{progress.pendingTotal} {meta.unit} pending confirmation
          </div>
        )}
      </div>
    </section>
  );
}
