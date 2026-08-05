import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { usePostHog } from "@posthog/react";
import {
  CircleCheck,
  CloudOff,
  CloudUpload,
  Info,
  LoaderCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  SYNC_RESCUE,
  fmtDuration,
  fmtPace,
  fmtTimeAgo,
  type Activity,
  type PendingUpload,
} from "@/lib/mock-data";
import { dismissSyncFailure, recoverSyncFailure } from "@/lib/api";
import { RouteMap } from "@/components/RouteMap";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

type Status = "failed" | "uploading" | "recovered";

// Trust banner + rescue card for a device upload that died mid-sync. Driven by
// the pending upload the server captured — nothing here is fabricated
// client-side, and recovery re-posts the cached payload through the real
// activity pipeline.
export function SyncRescueSection({ onRecovered }: { onRecovered?: () => void }) {
  const posthog = usePostHog();
  const [pendingUpload, setLocalPendingUpload] = useState<PendingUpload | null>(
    SYNC_RESCUE.pendingUpload?.status === "pending" ? SYNC_RESCUE.pendingUpload : null,
  );
  const [status, setStatus] = useState<Status>("failed");
  const [progress, setProgress] = useState(0);
  const [recovered, setRecovered] = useState<Activity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);
  const progressTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (progressTimer.current !== null) {
        window.clearInterval(progressTimer.current);
      }
    };
  }, []);

  if (!pendingUpload || !visible) {
    return null;
  }

  const daysIntoFirst90 = SYNC_RESCUE.daysIntoFirst90;

  async function handleRecover() {
    if (!pendingUpload) return;
    posthog.capture("sync_rescue_recover_tapped", {
      device: pendingUpload.device,
      pending_upload_id: pendingUpload.id,
    });
    setError(null);
    setStatus("uploading");
    setProgress(0);

    // Creep toward 90% while the request is in flight so slow networks still
    // show motion; the jump to 100 happens on the real response.
    const start = Date.now();
    progressTimer.current = window.setInterval(() => {
      const pct = Math.min(90, Math.round(((Date.now() - start) / 1400) * 100));
      setProgress(pct);
    }, 60);

    try {
      const result = await recoverSyncFailure(pendingUpload.id);

      if (progressTimer.current !== null) {
        window.clearInterval(progressTimer.current);
        progressTimer.current = null;
      }

      setProgress(100);
      setRecovered(result.activity);
      setStatus("recovered");
      posthog.capture("sync_rescue_recovered", {
        device: pendingUpload.device,
        pending_upload_id: pendingUpload.id,
        distance_km: result.activity.distanceKm,
      });
      onRecovered?.();
    } catch (recoverError) {
      if (progressTimer.current !== null) {
        window.clearInterval(progressTimer.current);
        progressTimer.current = null;
      }

      const message =
        recoverError instanceof Error ? recoverError.message : "Recovery failed. Try again.";
      setStatus("failed");
      setProgress(0);
      setError(message);
      posthog.capture("sync_rescue_recover_failed", {
        device: pendingUpload.device,
        pending_upload_id: pendingUpload.id,
        error: message,
      });
    }
  }

  function handleDismiss() {
    if (!pendingUpload) return;
    posthog.capture("sync_rescue_dismissed", {
      device: pendingUpload.device,
      pending_upload_id: pendingUpload.id,
      status_at_dismiss: status,
    });
    setVisible(false);

    if (status !== "recovered") {
      // Persist so the card doesn't come back on the next bootstrap. Recovered
      // uploads already stop being surfaced server-side.
      void dismissSyncFailure(pendingUpload.id).catch(() => {
        // Dismissal is best-effort; worst case the card reappears next visit.
      });
    } else {
      setLocalPendingUpload(null);
    }
  }

  return (
    <>
      {daysIntoFirst90 !== null && (
        <Alert className="mb-6 border-primary/30 bg-primary/5">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <AlertTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
            Trust · Day {daysIntoFirst90} of your first 90
          </AlertTitle>
          <AlertDescription className="text-muted-foreground">
            We know your first 90 days are when trusting Stride with your training matters most —
            here's what happened while you were out of signal.
          </AlertDescription>
        </Alert>
      )}

      <SyncRescueCard
        pendingUpload={pendingUpload}
        status={status}
        progress={progress}
        recovered={recovered}
        error={error}
        onRecover={handleRecover}
        onDismiss={handleDismiss}
      />
    </>
  );
}

function SyncRescueCard({
  pendingUpload,
  status,
  progress,
  recovered,
  error,
  onRecover,
  onDismiss,
}: {
  pendingUpload: PendingUpload;
  status: Status;
  progress: number;
  recovered: Activity | null;
  error: string | null;
  onRecover: () => void;
  onDismiss: () => void;
}) {
  const { payload } = pendingUpload;

  if (status === "recovered" && recovered) {
    return (
      <div className="mb-6 overflow-hidden rounded-xl border border-[color:var(--pr)]/40 bg-[color:var(--pr)]/8">
        <div className="flex items-start gap-4 px-5 py-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[color:var(--pr)]/15 text-[color:var(--pr)]">
            <CircleCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--pr)]">
              Recovered
            </div>
            <h3 className="mt-1 font-display text-lg font-bold tracking-tight">
              Thanks for bearing with us — your {payload.sport.toLowerCase()} is back.
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Sorry about that. It's fully recovered from your device cache with the original data —
              nothing was estimated. It's already in your training log below.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              to="/activity/$id"
              params={{ id: recovered.id }}
              className="inline-flex h-9 items-center rounded-md bg-secondary px-3.5 text-sm font-medium text-secondary-foreground hover:opacity-95"
            >
              View activity
            </Link>
            <button
              onClick={onDismiss}
              aria-label="Dismiss"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background/60 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const uploading = status === "uploading";

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-destructive/30 bg-destructive/6">
      <div className="flex items-start gap-4 px-5 pb-4 pt-5">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
          {uploading ? (
            <LoaderCircle className="h-5 w-5 animate-spin" />
          ) : (
            <CloudOff className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-destructive">
              {uploading ? "Recovering" : "Sync interrupted"}
            </span>
            <span className="text-border">·</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {fmtTimeAgo(pendingUpload.failedAt)}
            </span>
          </div>
          <h3 className="mt-1.5 font-display text-lg font-bold tracking-tight">
            {uploading
              ? "Hang tight, recovering your activity…"
              : `Sorry — ${payload.title} didn't make it to Stride`}
          </h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
            {uploading
              ? "Thanks for your patience — we're re-uploading from your device cache. This usually takes a few seconds."
              : `Your ${pendingUpload.device} lost connection mid-upload and we didn't catch it in time. That's on us — the good news is the workout file is still safely cached on your device, so nothing is lost. Recovering it takes one tap.`}
          </p>
        </div>
        {!uploading && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background/60 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mx-5 grid grid-cols-3 gap-0 border-y border-dashed border-destructive/25">
        <PendingStat label="Distance" value={payload.distanceKm.toFixed(2)} unit="km" />
        <PendingStat label="Time" value={fmtDuration(payload.movingSeconds)} border />
        {payload.avgPaceSecPerKm !== undefined && (
          <PendingStat
            label="Pace"
            value={fmtPace(payload.avgPaceSecPerKm).replace("/km", "")}
            unit="/km"
            border
          />
        )}
      </div>

      <div className="relative mx-5 mt-4 overflow-hidden rounded-lg">
        <RouteMap
          seed={payload.routeSeed}
          width={800}
          height={160}
          className="h-40 w-full grayscale opacity-70"
          showScale={false}
        />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-background/90 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground backdrop-blur">
          <CloudOff className="h-3 w-3" /> Cached on device
        </span>
      </div>

      {uploading && (
        <div className="px-5 pt-4">
          <Progress value={progress} className="h-1.5 bg-muted" />
          <div className="mt-1.5 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {progress}%
          </div>
        </div>
      )}

      {error && !uploading && (
        <div className="mx-5 mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Recovery didn't go through: {error} Your workout is still cached on your device — try
          again.
        </div>
      )}

      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <ExplainDialog pendingUpload={pendingUpload} />
        <Button onClick={onRecover} disabled={uploading} className="gap-2">
          {uploading ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" /> Recovering…
            </>
          ) : (
            <>
              <CloudUpload className="h-4 w-4" /> {error ? "Try again" : "Recover activity"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function PendingStat({
  label,
  value,
  unit,
  border,
}: {
  label: string;
  value: string;
  unit?: string;
  border?: boolean;
}) {
  return (
    <div
      className={`py-3 ${border ? "border-l border-dashed border-destructive/25 pl-4" : "pr-4"}`}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
      <div className="stat-num mt-1 text-lg font-bold tracking-tight text-foreground/70">
        {value}
        {unit && (
          <span className="ml-1 font-body text-xs font-normal text-muted-foreground">{unit}</span>
        )}
      </div>
    </div>
  );
}

function ExplainDialog({ pendingUpload }: { pendingUpload: PendingUpload }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <Info className="h-3.5 w-3.5" /> What happened?
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudOff className="h-4 w-4 text-destructive" /> Sorry — here's what happened
          </DialogTitle>
          <DialogDescription>
            This one's on us. Your watch finished recording the workout normally — it was purely an
            upload problem on our end.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            The {pendingUpload.device} recorded the full workout, but the upload to Stride dropped
            before it finished. {pendingUpload.reason}
          </p>
          <p>
            The activity file is still saved on your watch. Tapping{" "}
            <span className="font-medium text-foreground">Recover activity</span> asks it to resend
            the same file — nothing is recalculated or estimated.
          </p>
          <p>
            We know trusting your training data matters most in your first 90 days, and we're sorry
            this slipped through. If it happens again, reach out and we'll personally check your
            device pairing.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
