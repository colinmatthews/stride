import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, RefreshCw, Watch } from "lucide-react";
import { usePostHog } from "@posthog/react";
import { ActivityCard } from "@/components/ActivityCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchDeviceSync,
  retryDeviceSync,
  startDeviceSync,
  type Activity,
  type DeviceSync,
} from "@/lib/api";

const DEFAULT_DEVICE = "Garmin Forerunner 965";

/** How often a pending sync is re-checked while the athlete waits. */
const POLL_MS = 2000;

type Props = {
  deviceName?: string;
  onSynced?: () => void;
};

export function DeviceSyncStatus({ deviceName = DEFAULT_DEVICE, onSynced }: Props) {
  const posthog = usePostHog();
  const [sync, setSync] = useState<DeviceSync | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against firing onSynced / analytics twice when polling and a
  // direct response land on the same transition.
  const announced = useRef(false);

  const absorb = useCallback(
    (payload: { sync: DeviceSync | null; activity: Activity | null }) => {
      setSync(payload.sync);
      setActivity(payload.activity);

      if (payload.sync?.status === "synced" && !announced.current) {
        announced.current = true;
        posthog.capture("device_sync_succeeded", {
          device_name: payload.sync.deviceName,
          attempt_count: payload.sync.attemptCount,
        });
        onSynced?.();
      }

      if (payload.sync?.status === "failed") {
        posthog.capture("device_sync_failed", {
          device_name: payload.sync.deviceName,
          attempt_count: payload.sync.attemptCount,
          reason: payload.sync.failureReason,
        });
      }
    },
    [onSynced, posthog],
  );

  useEffect(() => {
    let cancelled = false;

    fetchDeviceSync()
      .then((payload) => {
        if (!cancelled) absorb(payload);
      })
      .catch(() => {
        // A failed status read must not block onboarding — the athlete can
        // still connect, and the connect call surfaces its own errors.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [absorb]);

  // While a sync is in flight the server is doing the work, so poll until it
  // reaches a terminal state rather than leaving a spinner up indefinitely.
  useEffect(() => {
    if (sync?.status !== "pending") {
      return;
    }

    const timer = setInterval(() => {
      fetchDeviceSync()
        .then(absorb)
        .catch(() => {});
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [sync?.status, absorb]);

  async function connect() {
    setBusy(true);
    setError(null);
    posthog.capture("device_sync_started", { device_name: deviceName });

    try {
      absorb(await startDeviceSync(deviceName));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start the sync.");
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    setBusy(true);
    setError(null);
    posthog.capture("device_sync_retried", {
      device_name: sync?.deviceName ?? deviceName,
      attempt_count: sync?.attemptCount ?? 0,
    });

    try {
      announced.current = false;
      absorb(await retryDeviceSync());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not retry the sync.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="grid place-items-center border border-border bg-surface p-8 text-muted-foreground">
        <LoaderCircle className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {!sync && <IdleCard deviceName={deviceName} busy={busy} onConnect={connect} />}
      {sync?.status === "pending" && <PendingCard stuck={sync.stuck} />}
      {sync?.status === "failed" && (
        <FailedCard sync={sync} busy={busy} onRetry={sync.canRetry ? retry : undefined} />
      )}
      {sync?.status === "synced" && <SyncedCard sync={sync} activity={activity} />}

      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function IdleCard({
  deviceName,
  busy,
  onConnect,
}: {
  deviceName: string;
  busy: boolean;
  onConnect: () => void;
}) {
  return (
    <div className="border border-dashed border-border bg-surface p-8 text-center">
      <div className="mx-auto grid h-11 w-11 place-items-center bg-muted text-foreground">
        <Watch className="h-5 w-5" />
      </div>
      <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        No device connected yet
      </div>
      <Button onClick={onConnect} size="lg" className="mt-5" disabled={busy}>
        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Watch className="h-4 w-4" />}
        Connect {deviceName}
      </Button>
    </div>
  );
}

function PendingCard({ stuck }: { stuck: boolean }) {
  return (
    <div className="border border-border bg-surface p-8">
      <Badge
        variant="outline"
        className="gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
      >
        <LoaderCircle className="h-3 w-3 animate-spin" />
        Pending · syncing
      </Badge>
      <div className="mt-3 font-display text-xl font-bold tracking-tight">
        Importing your first activity…
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {stuck
          ? "This is taking longer than usual. You can keep going and we'll finish in the background."
          : "This usually takes a few seconds. We'll show it here the moment it lands."}
      </p>
    </div>
  );
}

function FailedCard({
  sync,
  busy,
  onRetry,
}: {
  sync: DeviceSync;
  busy: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className="border border-destructive/40 bg-destructive/8 p-8">
      <div className="flex items-start gap-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <Badge
            variant="destructive"
            className="font-mono text-[10px] uppercase tracking-[0.18em]"
          >
            Sync failed
          </Badge>
          <div className="mt-2 font-display text-xl font-bold tracking-tight">
            We couldn't import your activity
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {sync.failureReason ?? "The import failed for an unknown reason."} Nothing was lost —
            your device still has it.
          </p>
          {onRetry ? (
            <Button onClick={onRetry} className="mt-4" disabled={busy}>
              {busy ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Retry sync
            </Button>
          ) : (
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Too many attempts · contact support
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SyncedCard({ sync, activity }: { sync: DeviceSync; activity: Activity | null }) {
  return (
    <div>
      <div className="border border-[color:var(--pr)]/40 bg-[color:var(--pr)]/8 p-8">
        <div className="flex items-start gap-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color:var(--pr)]/15 text-[color:var(--pr)]">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <Badge
              variant="outline"
              className="border-[color:var(--pr)]/40 bg-[color:var(--pr)]/8 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--pr)]"
            >
              Synced
            </Badge>
            <div className="mt-2 font-display text-xl font-bold tracking-tight">
              Your first activity is in Stride
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {sync.deviceName} · synced just now
            </p>
          </div>
        </div>
      </div>

      {activity && (
        <div className="mt-6">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Preview — this is what lands in your feed
          </div>
          <ActivityCard activity={activity} />
        </div>
      )}
    </div>
  );
}
