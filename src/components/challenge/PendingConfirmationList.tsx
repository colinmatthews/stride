import { Check, X } from "lucide-react";
import { SportBadge } from "@/components/SportBadge";
import { fmtDate, type ChallengeContribution, type ContributionStatus } from "@/lib/mock-data";
import { metricOf, type ChallengeMeta } from "./metric";

/**
 * Activities that qualify for the challenge but have no decision yet. This is
 * the queue the whole feature exists for.
 */
export function PendingConfirmationList({
  meta,
  pending,
  busyId,
  onDecide,
}: {
  meta: ChallengeMeta;
  pending: ChallengeContribution[];
  busyId: string | null;
  onDecide: (activityId: string, status: ContributionStatus | null) => void;
}) {
  return (
    <section className="mt-6 border border-border bg-surface">
      <div className="border-b border-border p-6">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Needs your confirmation
          </h2>
          {pending.length > 0 && (
            <span className="stat-num inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground">
              {pending.length}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {meta.sport} activities inside the challenge window. Count the ones that belong.
        </p>
      </div>

      {pending.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">
          Nothing waiting. Every qualifying activity has a decision.
        </p>
      ) : (
        <ul>
          {pending.map((activity) => (
            <li
              key={activity.id}
              className="flex items-center gap-4 border-b border-border p-4 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{activity.title}</span>
                  <SportBadge sport={activity.sport} />
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {fmtDate(activity.date)}
                </div>
              </div>
              <div className="stat-num shrink-0 text-xl font-semibold">
                {metricOf(activity, meta.metricType)}
                <span className="ml-1 text-xs text-muted-foreground">{meta.unit}</span>
              </div>
              <button
                onClick={() => onDecide(activity.id, "counted")}
                disabled={busyId === activity.id || meta.closed}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Check className="h-4 w-4" /> Count it
              </button>
              <button
                onClick={() => onDecide(activity.id, "dismissed")}
                disabled={busyId === activity.id || meta.closed}
                aria-label={`Dismiss ${activity.title}`}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
