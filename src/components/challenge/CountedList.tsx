import { Check } from "lucide-react";
import { fmtDate, type ChallengeContribution, type ContributionStatus } from "@/lib/mock-data";
import { metricOf, type ChallengeMeta, type ChallengeProgress } from "./metric";

/**
 * Confirmed activities. "Remove" clears the decision rather than dismissing, so
 * the activity returns to the pending queue and a mis-tap stays recoverable.
 */
export function CountedList({
  meta,
  progress,
  counted,
  busyId,
  onDecide,
}: {
  meta: ChallengeMeta;
  progress: ChallengeProgress;
  counted: ChallengeContribution[];
  busyId: string | null;
  onDecide: (activityId: string, status: ContributionStatus | null) => void;
}) {
  return (
    <section className="mt-6 border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border p-6">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Counted toward challenge
        </h2>
        <span className="stat-num text-sm font-semibold text-primary">
          {progress.countedTotal} {meta.unit} · {counted.length}{" "}
          {counted.length === 1 ? "activity" : "activities"}
        </span>
      </div>

      {counted.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">
          Nothing counted yet. Confirm an activity above to start your total.
        </p>
      ) : (
        <ul>
          {counted.map((activity) => (
            <li
              key={activity.id}
              className="flex items-center gap-4 border-b border-border p-4 last:border-b-0"
            >
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Check className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{activity.title}</div>
                <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {fmtDate(activity.date)}
                </div>
              </div>
              <div className="stat-num shrink-0 text-sm font-semibold">
                {metricOf(activity, meta.metricType)} {meta.unit}
              </div>
              <button
                onClick={() => onDecide(activity.id, null)}
                disabled={busyId === activity.id || meta.closed}
                className="shrink-0 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
