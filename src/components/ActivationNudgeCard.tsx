import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, Flame, X } from "lucide-react";
import { formatHoursRemaining, useActivationNudge } from "@/lib/nudges";

// Post-join activation nudge: surfaced app-wide for the first 48 hours after
// a member joins a challenge, pointing at one small, specific first activity.
export function ActivationNudgeCard() {
  const { nudge, hoursRemaining, dismiss } = useActivationNudge();

  if (!nudge) return null;

  return (
    <section className="mb-8 flex items-start gap-4 border border-primary/30 bg-primary/5 p-5">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
        <Flame className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
            First 48 hours · {nudge.challengeName}
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss nudge"
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 font-display text-lg font-semibold leading-snug tracking-tight text-balance">
          {nudge.activityLabel}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link
            to="/record"
            search={{
              challengeId: nudge.challengeId,
              challengeName: nudge.challengeName,
              sport: nudge.sport === "Multisport" ? undefined : nudge.sport,
              distanceKm: nudge.suggestedDistanceKm,
              elevationM: nudge.suggestedElevationM,
            }}
            className="group inline-flex h-9 items-center gap-2 bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:gap-3"
          >
            Log it now
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <Clock className="h-3 w-3" /> {formatHoursRemaining(hoursRemaining)} to start strong
          </span>
        </div>
      </div>
    </section>
  );
}
