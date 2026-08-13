import { ChevronRight, Lock, Share, Zap } from "lucide-react";
import { WEEKLY_RECAP_RUN_THRESHOLD, type WeeklyRecap } from "@/lib/weekly-recap";
import { formatStreak } from "@/lib/recap-card";

/**
 * Home-screen right-rail card, matching the prototype's locked (3 / 4) and
 * unlocked (4 / 4) states.
 *
 * This is the feature's primary entry point: it shows progress toward Power
 * Runner every week, not just at the moment the 4th run lands, so the share
 * moment is reachable again after the modal is dismissed.
 */

type Props = {
  recap: WeeklyRecap;
  onSharePowerRunner: () => void;
  onShareStandard: () => void;
};

export function PowerRunnerRail({ recap, onSharePowerRunner, onShareStandard }: Props) {
  const unlocked = recap.tier === "power_runner";

  return (
    <section className="rounded-xl border border-border bg-surface">
      <div
        className={`flex items-center justify-between px-4 py-3 ${
          unlocked ? "bg-accent text-accent-foreground" : "bg-surface-2 text-foreground"
        }`}
      >
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em]">
          <Zap className="h-3 w-3" />
          Power Runner
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em]">
          {unlocked ? "Unlocked" : `${recap.runCount} / ${WEEKLY_RECAP_RUN_THRESHOLD}`}
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="stat-num text-3xl leading-none">{recap.runCount}</span>
            <span className="text-sm text-muted-foreground">
              / {WEEKLY_RECAP_RUN_THRESHOLD} runs
            </span>
          </div>
          <span className="num font-mono text-[11px] text-muted-foreground">
            {recap.progressPct}%
          </span>
        </div>

        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${recap.progressPct}%` }} />
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          {unlocked
            ? "Four runs this week. Your Power Runner recap is ready to share."
            : `${recap.runsToUnlock} more ${
                recap.runsToUnlock === 1 ? "run" : "runs"
              } this week unlocks your Power Runner recap.`}
        </p>

        <div className="mt-4 grid grid-cols-2 border-t border-border pt-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Distance
            </div>
            <div className="stat-num mt-1 text-lg leading-none">
              {recap.distanceKm.toFixed(1)} km
            </div>
          </div>
          <div className="border-l border-border pl-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Streak
            </div>
            <div className="stat-num mt-1 text-lg leading-none">
              {formatStreak(recap.streakWeeks)}
            </div>
          </div>
        </div>

        {unlocked ? (
          <button
            onClick={onSharePowerRunner}
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            <Share className="h-4 w-4" /> Share Power Runner recap
          </button>
        ) : (
          <div className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border text-sm text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Power Runner recap locked
          </div>
        )}

        {/* The standard recap is always shareable, per the tiers spec. */}
        <button
          onClick={onShareStandard}
          className="mt-3 inline-flex w-full items-center justify-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Share standard recap <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}
