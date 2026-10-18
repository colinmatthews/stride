import { useEffect, useMemo, useRef, useState } from "react";
import { useFeatureFlagEnabled, usePostHog } from "@posthog/react";
import { AlertTriangle, ArrowRight, Loader2, Mountain, Sparkles, Watch, X } from "lucide-react";
import { toast } from "sonner";
import {
  ApiError,
  fetchActivityElevation,
  previewElevationCorrection,
  saveElevationCorrection,
  type ActivityElevation,
  type ElevationFixTrigger,
  type ElevationPreview,
  type KeptElevationVersion,
} from "@/lib/api";
import {
  ELEVATION_EVENTS,
  elevationEventBase,
  previewedEventProperties,
  previewOutcome,
} from "@/lib/elevation-analytics";
import type { Activity } from "@/lib/mock-data";
import { ChartLabel, ElevationChart } from "@/components/ElevationChart";
import { CorrectionExplainer, NoFixNotice } from "@/components/ElevationExplainer";
import { formatKm } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// PostHog flag: show the proactive "Elevation looks off" prompt (otherwise button only).
const PROMPT_FLAG = "elevation-fix-prompt";

type Phase = "loading" | "idle" | "processing" | "compare" | "nothing-to-fix" | "unavailable";

export type ElevationCorrectionState = {
  elevationM: number;
  correctedWith: "terrain" | "cleanup" | null;
};

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Something went wrong. Try again.";
}

function dismissKey(activityId: string) {
  return `stride.elevationPromptDismissed.${activityId}`;
}

function readDismissed(activityId: string) {
  try {
    return window.localStorage.getItem(dismissKey(activityId)) === "1";
  } catch {
    return false;
  }
}

function correctionState(data: ActivityElevation): ElevationCorrectionState {
  return {
    elevationM: data.elevationM,
    correctedWith: data.correction?.keptVersion === "corrected" ? data.correction.method : null,
  };
}

export function ElevationSection({
  activity,
  onCorrectionChange,
}: {
  activity: Activity;
  onCorrectionChange: (state: ElevationCorrectionState) => void;
}) {
  const posthog = usePostHog();
  const promptEnabled = useFeatureFlagEnabled(PROMPT_FLAG) === true;
  const [elevation, setElevation] = useState<ActivityElevation | null>(null);
  const [preview, setPreview] = useState<ElevationPreview | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [trigger, setTrigger] = useState<ElevationFixTrigger>("self");
  const [saving, setSaving] = useState<KeptElevationVersion | null>(null);
  const [promptDismissed, setPromptDismissed] = useState(() => readDismissed(activity.id));
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setPreview(null);
    setPromptDismissed(readDismissed(activity.id));
    fetchActivityElevation(activity.id)
      .then((data) => {
        if (cancelled) return;
        setElevation(data);
        onCorrectionChange(correctionState(data));
        setPhase("idle");
      })
      .catch(() => {
        if (!cancelled) setPhase("unavailable");
      });
    return () => {
      cancelled = true;
    };
    // onCorrectionChange is a state setter from the parent; reload only per activity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity.id]);

  // Keep the whole comparison in one viewport once it opens.
  useEffect(() => {
    if (phase !== "compare" && phase !== "processing") return;
    const frame = requestAnimationFrame(() =>
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  const eventBase = elevationEventBase(activity, elevation);
  const correction = elevation?.correction ?? null;
  const issue = elevation?.issue ?? null;
  const showPrompt =
    promptEnabled && phase === "idle" && !!issue && !correction && !promptDismissed;

  // Once per activity view: the denominator for the prompt's click-through rate.
  const promptReportedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!showPrompt || promptReportedFor.current === activity.id) return;
    promptReportedFor.current = activity.id;
    posthog.capture(ELEVATION_EVENTS.promptShown, eventBase);
    // eventBase is derived from the state that drives showPrompt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPrompt, activity.id]);

  const openFix = async (source: ElevationFixTrigger) => {
    setTrigger(source);
    posthog.capture(ELEVATION_EVENTS.fixOpened, {
      ...eventBase,
      trigger: source,
      reopened: correction != null,
    });
    setPhase("processing");
    try {
      const result = await previewElevationCorrection(activity.id);
      posthog.capture(ELEVATION_EVENTS.fixPreviewed, {
        ...eventBase,
        ...previewedEventProperties(source, { preview: result }),
      });
      setPreview(result);
      setPhase(result.changed ? "compare" : "nothing-to-fix");
    } catch (error) {
      posthog.capture(ELEVATION_EVENTS.fixPreviewed, {
        ...eventBase,
        ...previewedEventProperties(source, {
          errorCode: error instanceof ApiError ? error.code : null,
        }),
      });
      toast.error(errorMessage(error));
      setPhase("idle");
    }
  };

  // Leaving the comparison without choosing a version.
  const closeFix = () => {
    posthog.capture(ELEVATION_EVENTS.fixClosed, {
      ...eventBase,
      trigger,
      outcome: preview ? previewOutcome(preview) : null,
      method: preview?.method ?? null,
      error_type: preview?.errorType ?? null,
    });
    setPhase("idle");
  };

  const dismissPrompt = () => {
    posthog.capture(ELEVATION_EVENTS.promptDismissed, eventBase);
    setPromptDismissed(true);
    try {
      window.localStorage.setItem(dismissKey(activity.id), "1");
    } catch {
      // Private mode: the prompt just comes back next visit.
    }
  };

  const choose = async (keptVersion: KeptElevationVersion) => {
    if (!preview) return;
    setSaving(keptVersion);
    try {
      const result = await saveElevationCorrection(activity.id, keptVersion, trigger);
      const data = await fetchActivityElevation(activity.id);
      setElevation(data);
      onCorrectionChange(correctionState(data));
      setPhase("idle");
      toast(
        keptVersion === "corrected"
          ? `Elevation updated to ${result.elevationM} m`
          : `Kept your original ${result.elevationM} m`,
        {
          description:
            keptVersion === "original"
              ? "Thanks, this helps us improve elevation correction."
              : preview.direction === "up"
                ? "Added the climbing your device missed. Distance, pace and segments are unchanged."
                : "Removed climbing your device added. Distance, pace and segments are unchanged.",
        },
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(null);
    }
  };

  const yDomain = useMemo(() => {
    const points = preview
      ? [...preview.original, ...preview.corrected]
      : (elevation?.samples ?? []);
    if (points.length === 0) return [0, 100];
    const values = points.map((point) => point.elev);
    return [
      Math.floor((Math.min(...values) - 20) / 50) * 50,
      Math.ceil((Math.max(...values) + 20) / 50) * 50,
    ];
  }, [preview, elevation]);

  if (phase === "unavailable") return null;
  // Swims have no elevation; manual entries have no recording to chart.
  if (phase !== "loading" && elevation && elevation.samples.length === 0) {
    if (activity.sport === "Swim") return null;
    return (
      <section className="mt-8">
        <SectionTitle />
        <div className="bg-surface rounded-xl border border-border p-4 text-sm text-muted-foreground">
          No elevation recording for this activity.
        </div>
      </section>
    );
  }

  const deviceName = preview?.device?.name ?? elevation?.device?.name;
  const gapM = preview ? Math.abs(preview.elevationAfterM - preview.elevationBeforeM) : 0;
  const correctedTag = correction?.method === "terrain" ? "Terrain-corrected" : "Corrected";

  return (
    <section ref={sectionRef} className="mt-8 scroll-mt-20">
      <div className="flex items-center justify-between mb-3">
        <SectionTitle />
        {elevation?.canCorrect && phase === "idle" && !correction && (
          <Button size="sm" variant="outline" onClick={() => openFix("self")}>
            <Sparkles className="h-3.5 w-3.5" /> Fix my elevation
          </Button>
        )}
        {elevation?.canCorrect && phase === "idle" && correction && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.18em]">
              {correction.keptVersion === "corrected" ? correctedTag : "Original kept"}
            </Badge>
            <Button size="sm" variant="ghost" onClick={() => openFix("self")}>
              Compare again
            </Button>
          </div>
        )}
        {(phase === "compare" || phase === "nothing-to-fix") && (
          <Button size="sm" variant="ghost" onClick={closeFix} disabled={!!saving}>
            <X className="h-3.5 w-3.5" /> {phase === "compare" ? "Cancel" : "Close"}
          </Button>
        )}
      </div>

      {showPrompt && issue && (
        <div className="mb-3 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/8 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-semibold">Elevation looks off on this activity</div>
            <p className="mt-0.5 text-muted-foreground">
              {issue.errorType === "flatline" && issue.flatRegion
                ? `Your altimeter seems to have stopped updating at km ${formatKm(issue.flatRegion.fromKm)}, so some climbing may be missing.`
                : `${issue.spikeCount} altitude spikes may have added climbing you didn't do.`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" onClick={() => openFix("prompted")}>
              Review fix
            </Button>
            <Button size="sm" variant="ghost" onClick={dismissPrompt} aria-label="Dismiss">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {phase === "loading" && <Skeleton className="h-[240px] w-full rounded-xl" />}

      {phase === "idle" && elevation && (
        <div className="bg-surface rounded-xl border border-border p-4">
          <ElevationChart
            id="current"
            data={elevation.samples}
            color="var(--primary)"
            domain={yDomain}
            heightClass="h-52"
          />
          {elevation.device && (
            <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
              <Watch className="h-3.5 w-3.5" />
              <span>
                Recorded with{" "}
                <span className="font-medium text-foreground">{elevation.device.name}</span>
                {elevation.elevationSource && (
                  <>
                    {" · "}
                    {elevation.elevationSource === "gps" ? "GPS altitude" : "barometric altimeter"}
                  </>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {phase === "processing" && (
        <div className="bg-surface rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            {elevation?.hasGps
              ? "Matching your track to terrain data…"
              : "Checking your elevation recording…"}
          </div>
          <Skeleton className="h-32 w-full mb-3" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {phase === "nothing-to-fix" && preview && <NoFixNotice preview={preview} />}

      {phase === "compare" && preview && (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 border-b border-border bg-surface-2">
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                Elevation gain
              </div>
              <div className="mt-1 flex items-baseline gap-2 stat-num text-2xl leading-none">
                <span className="text-muted-foreground line-through decoration-1">
                  {preview.elevationBeforeM}
                </span>
                <ArrowRight className="h-4 w-4 self-center text-muted-foreground" />
                <span className="text-primary">{preview.elevationAfterM}</span>
                <span className="text-sm font-body font-normal text-muted-foreground">m</span>
              </div>
            </div>
            <Badge variant="secondary" className="font-mono">
              {preview.deltaPct > 0 ? "+" : ""}
              {preview.deltaPct}%
            </Badge>
            <span className="text-sm text-muted-foreground">
              {preview.direction === "up"
                ? `${gapM} m of climbing missing`
                : `${gapM} m of climbing you didn't do`}
            </span>
          </div>

          <div className="px-5 pt-4">
            <ChartLabel
              tone="muted"
              title="Original"
              detail={`${deviceName ? `Recorded by ${deviceName}` : "As recorded"} · ${preview.elevationBeforeM} m`}
            />
            <ElevationChart
              id="original"
              data={preview.original}
              color="var(--muted-foreground)"
              domain={yDomain}
              heightClass="h-32"
              syncId="elev-compare"
              markers={preview.spikes}
              flatRegion={preview.flatRegion}
            />
          </div>

          <CorrectionExplainer preview={preview} deviceName={deviceName} />

          <div className="px-5 pt-1 pb-4">
            <ChartLabel
              tone="primary"
              title="Corrected"
              detail={`${preview.method === "terrain" ? "Terrain data" : "Spikes and noise removed"} · ${preview.elevationAfterM} m`}
            />
            <ElevationChart
              id="corrected"
              data={preview.corrected}
              color="var(--primary)"
              domain={yDomain}
              heightClass="h-32"
              syncId="elev-compare"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-t border-border">
            <Button onClick={() => choose("corrected")} disabled={!!saving}>
              {saving === "corrected" && <Loader2 className="h-4 w-4 animate-spin" />}
              Keep corrected
            </Button>
            <Button variant="outline" onClick={() => choose("original")} disabled={!!saving}>
              {saving === "original" && <Loader2 className="h-4 w-4 animate-spin" />}
              Keep original
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              You can switch back any time.
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function SectionTitle() {
  return (
    <h2 className="text-lg font-display font-semibold flex items-center gap-2">
      <Mountain className="h-4 w-4 text-primary" /> Elevation
    </h2>
  );
}
