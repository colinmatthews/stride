import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { usePostHog } from "@posthog/react";
import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  PencilLine,
  RefreshCw,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AthleteCardHeader } from "@/components/AthleteCardHeader";
import { useRetrySync, useWorkoutSyncs } from "@/hooks/use-workout-syncs";
import { ME, fmtTimeAgo } from "@/lib/mock-data";
import {
  SYNC_TONE_STYLES,
  describeSyncProblem,
  syncStatusMessage,
  syncTone,
} from "@/lib/sync-copy";
import type { WorkoutSync } from "@/lib/workout-syncs";

// Shown-once-per-page-load guard so re-renders don't inflate the impression count.
const reportedImpressions = new Set<string>();

// A workout that didn't make it into the feed, shaped like an ActivityCard so
// it sits where the athlete expects to find it.
export function SyncIssueCard({ sync }: { sync: WorkoutSync }) {
  const posthog = usePostHog();
  const { pendingIds } = useWorkoutSyncs();
  const tone = SYNC_TONE_STYLES[syncTone(sync, pendingIds.has(sync.id))];

  useEffect(() => {
    if (reportedImpressions.has(sync.id)) return;
    reportedImpressions.add(sync.id);
    posthog.capture("sync_status_shown", {
      status: sync.status,
      source: sync.deviceName,
      provider: sync.provider,
      error_code: sync.errorCode,
      error_ref: sync.ref,
    });
  }, [posthog, sync]);

  return (
    <article className={`overflow-hidden border bg-surface ${tone.border}`}>
      <AthleteCardHeader
        athlete={ME}
        sport={sync.sport}
        linkToProfile={false}
        meta={
          <>
            <span className="shrink-0">{fmtTimeAgo(sync.startedAt)}</span>
            <span className="text-border">·</span>
            <span className="truncate">from {sync.deviceName}</span>
          </>
        }
        aside={
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
            {tone.label}
          </span>
        }
      />

      <h3 className="px-5 font-display text-xl font-bold leading-tight tracking-[-0.015em] text-foreground/60">
        {sync.title}
      </h3>

      <div className={`mt-5 border-t px-5 py-4 ${tone.border} ${tone.bg}`}>
        <SyncStatusPanel sync={sync} />
      </div>
    </article>
  );
}

function SyncStatusPanel({ sync }: { sync: WorkoutSync }) {
  const { pendingIds } = useWorkoutSyncs();
  const posthog = usePostHog();
  const retry = useRetrySync();
  const [stepsOpen, setStepsOpen] = useState(false);
  const [offline, setOffline] = useState(false);

  if (pendingIds.has(sync.id)) {
    return (
      <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        Syncing from your {sync.deviceName}…
      </div>
    );
  }

  const stuck = sync.status === "stuck";
  const { headline, body } = syncStatusMessage(sync);
  const { steps } = describeSyncProblem(sync);

  return (
    <div role="status">
      <div className="flex items-start gap-2.5">
        <CircleAlert
          className={`mt-0.5 h-4 w-4 shrink-0 ${stuck ? "text-destructive" : "text-foreground"}`}
        />
        <p className="text-sm leading-6">
          <span className="font-medium">{headline}</span>{" "}
          <span className="text-muted-foreground">{body}</span>
        </p>
      </div>

      {!stuck && steps.length > 0 && (
        <Collapsible open={stepsOpen} onOpenChange={setStepsOpen} className="mt-3 pl-[26px]">
          <CollapsibleTrigger className="group inline-flex items-center gap-1.5 rounded-sm text-sm font-medium transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            What to check
            <span className="font-normal text-muted-foreground">
              · {steps.length} {steps.length === 1 ? "step" : "steps"}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ol className="mt-2.5 list-decimal space-y-2 pl-5 text-sm leading-5">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </CollapsibleContent>
        </Collapsible>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 pl-[26px]">
        {stuck ? (
          <Button size="sm" asChild>
            <Link
              to="/record"
              onClick={() =>
                posthog.capture("sync_manual_entry_clicked", {
                  source: sync.deviceName,
                  provider: sync.provider,
                  error_code: sync.errorCode,
                  error_ref: sync.ref,
                })
              }
            >
              <PencilLine /> Add it manually
            </Link>
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={async () => {
              const outcome = await retry(sync);
              setOffline(outcome.kind === "error");
            }}
          >
            <RefreshCw /> {sync.attempts > 0 ? "Try again" : "Retry sync"}
          </Button>
        )}
        {offline && (
          <span className="text-xs text-destructive">
            Couldn't reach Stride. Check your connection and try again.
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-1.5 pl-[26px] text-xs text-muted-foreground">
        <Send className="h-3 w-3" />
        <span>We've let the Stride team know.</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/70">
          Ref {sync.ref}
        </span>
      </div>
    </div>
  );
}

export function SyncedFromBanner({ sync }: { sync: WorkoutSync }) {
  return (
    <div className="flex items-center gap-2 border border-b-0 border-border bg-surface-2 px-5 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
      <CircleCheck className="h-3.5 w-3.5 text-pr" />
      Synced from {sync.deviceName} · just now
    </div>
  );
}
