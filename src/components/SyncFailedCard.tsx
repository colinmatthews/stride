import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { AlertTriangle, Bike, PencilLine, RefreshCw, Watch, WifiOff } from "lucide-react";
import type { SyncFailure } from "@/lib/mock-data";
import { fmtTimeAgo } from "@/lib/mock-data";
import { usePostHog } from "@posthog/react";

const DEVICE_ICONS: Record<SyncFailure["deviceType"], typeof Watch> = {
  watch: Watch,
  bike: Bike,
  strap: RefreshCw,
  phone: WifiOff,
};

interface Props {
  failure: SyncFailure;
}

export function SyncFailedCard({ failure }: Props) {
  const posthog = usePostHog();
  const Icon = DEVICE_ICONS[failure.deviceType];

  useEffect(() => {
    // STR-27: this card only renders because a sync_failed event fired for this device.
    posthog.capture("sync_failed", {
      device_name: failure.deviceName,
      device_type: failure.deviceType,
      sport_guess: failure.sportGuess,
      gps_points_captured: failure.gpsPointsCaptured,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failure.id]);

  return (
    <article className="overflow-hidden border border-border bg-muted/30">
      <header className="flex items-start gap-3 px-5 pb-4 pt-5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground ring-1 ring-border">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-muted-foreground">
              {failure.deviceName}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
              <AlertTriangle className="h-3 w-3" /> Sync failed
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <span>Attempted {fmtTimeAgo(failure.attemptedAt)}</span>
            <span className="text-border">·</span>
            <span>Guessed {failure.sportGuess}</span>
          </div>
        </div>
      </header>

      <div className="px-5">
        <h3 className="font-display text-xl font-bold leading-tight tracking-[-0.015em] text-muted-foreground">
          Activity not in your log yet
        </h3>
        <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-muted-foreground">
          {failure.reason}
        </p>
      </div>

      <div className="mx-5 mt-4 grid grid-cols-3 gap-0 border-y border-border/70">
        <PlaceholderStat label="Distance" />
        <PlaceholderStat label="Pace" border />
        <PlaceholderStat label="Elev" border />
      </div>

      <div className="mt-5 px-5">
        <div className="flex h-32 items-center justify-center gap-2 border border-dashed border-border bg-background/40 px-4 text-center text-xs text-muted-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {failure.gpsPointsCaptured > 0
            ? `${failure.gpsPointsCaptured} GPS points recovered before the connection dropped`
            : "No GPS data came through before the connection dropped"}
        </div>
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:inline">
          Sync retried automatically · gave up
        </span>
        <Link
          to="/record"
          search={{ failureId: failure.id }}
          onClick={() =>
            posthog.capture("sync_failed_recovery_started", { device_name: failure.deviceName })
          }
          className="ml-auto inline-flex items-center gap-2 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <PencilLine className="h-4 w-4" /> Fill in manually
        </Link>
      </footer>
    </article>
  );
}

function PlaceholderStat({ label, border }: { label: string; border?: boolean }) {
  return (
    <div className={`py-3 ${border ? "border-l border-border/70 pl-4" : "pr-4"}`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
      <div className="stat-num mt-1 text-xl font-bold tracking-tight text-muted-foreground/50">
        —
      </div>
    </div>
  );
}
