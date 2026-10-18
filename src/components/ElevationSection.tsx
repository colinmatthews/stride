import { useEffect, useMemo, useRef, useState } from "react";
import { useFeatureFlagEnabled, usePostHog } from "@posthog/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  Crosshair,
  Loader2,
  Mountain,
  Sparkles,
  Watch,
  Waves,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  ApiError,
  fetchActivityElevation,
  previewElevationCorrection,
  saveElevationCorrection,
  type ActivityElevation,
  type ElevationFixTrigger,
  type ElevationPoint,
  type ElevationPreview,
  type FlatRegion,
  type KeptElevationVersion,
} from "@/lib/api";
import type { Activity } from "@/lib/mock-data";
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

// "km 0.5" near the start, "km 12" further on.
function formatKm(km: number) {
  return km < 10 ? km.toFixed(1).replace(/\.0$/, "") : String(Math.round(km));
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

  const eventBase = {
    activity_id: activity.id,
    sport: activity.sport,
    device: elevation?.device?.name ?? null,
    device_model: elevation?.device?.model ?? null,
    elevation_source: elevation?.elevationSource ?? null,
    has_gps: elevation?.hasGps ?? false,
    suspected_error: elevation?.issue?.errorType ?? null,
  };

  const openFix = async (source: ElevationFixTrigger) => {
    setTrigger(source);
    posthog.capture("elevation_fix_opened", {
      ...eventBase,
      trigger: source,
      reopened: elevation?.correction != null,
    });
    setPhase("processing");
    try {
      const result = await previewElevationCorrection(activity.id);
      setPreview(result);
      setPhase(result.changed ? "compare" : "nothing-to-fix");
    } catch (error) {
      toast.error(errorMessage(error));
      setPhase("idle");
    }
  };

  const dismissPrompt = () => {
    posthog.capture("elevation_prompt_dismissed", eventBase);
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

  const correction = elevation?.correction ?? null;
  const issue = elevation?.issue ?? null;
  const deviceName = preview?.device?.name ?? elevation?.device?.name;
  const showPrompt =
    promptEnabled && phase === "idle" && !!issue && !correction && !promptDismissed;
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
          <Button size="sm" variant="ghost" onClick={() => setPhase("idle")} disabled={!!saving}>
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

function NoFixNotice({ preview }: { preview: ElevationPreview }) {
  if (preview.blockedReason) {
    const fromKm = preview.flatRegion ? formatKm(preview.flatRegion.fromKm) : null;
    return (
      <div className="bg-surface rounded-xl border border-border p-5 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
        <div>
          <div className="text-sm font-semibold">Some climbing looks missing</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Your altimeter seems to have stopped updating
            {fromKm !== null ? ` at km ${fromKm}` : ""}.{" "}
            {preview.blockedReason === "needs_gps"
              ? "This activity has no GPS track, so we can't look up the terrain to fill in the climbing."
              : "Terrain correction isn't available right now, so we can't fill in the climbing yet."}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="bg-surface rounded-xl border border-border p-5 flex items-start gap-3">
      <CheckCircle2 className="h-5 w-5 shrink-0 text-pr" />
      <div>
        <div className="text-sm font-semibold">Your elevation looks accurate</div>
        <p className="mt-1 text-sm text-muted-foreground">
          {preview.method === "terrain"
            ? `Terrain data along your route matches your recording (${preview.elevationBeforeM} m vs. ${preview.elevationAfterM} m). Nothing to fix.`
            : `We found no spikes or sensor noise worth removing. Your ${preview.elevationBeforeM} m stays as it is.`}
        </p>
      </div>
    </div>
  );
}

function ElevationChart({
  id,
  data,
  color,
  domain,
  heightClass,
  syncId,
  markers = [],
  flatRegion,
}: {
  id: string;
  data: ElevationPoint[];
  color: string;
  domain: number[];
  heightClass: string;
  syncId?: string;
  markers?: ElevationPoint[];
  flatRegion?: FlatRegion | null;
}) {
  const gradientId = `elevGrad-${id}`;
  return (
    <div className={heightClass}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} syncId={syncId}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="km"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(value) => `${Math.round(value)} km`}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={domain}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(value) => `${Number(value).toFixed(2)} km`}
            formatter={(value) => [`${Math.round(Number(value))} m`, "Elevation"]}
          />
          {flatRegion && (
            <ReferenceArea
              x1={flatRegion.fromKm}
              x2={flatRegion.toKm}
              fill="var(--destructive)"
              fillOpacity={0.08}
              stroke="var(--destructive)"
              strokeOpacity={0.3}
              strokeDasharray="3 3"
              label={{
                value: "Altimeter stopped",
                position: "insideTopLeft",
                fill: "var(--destructive)",
                fontSize: 10,
              }}
            />
          )}
          <Area
            dataKey="elev"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
          {markers.map((marker) => (
            <ReferenceDot
              key={marker.km}
              x={marker.km}
              y={marker.elev}
              r={3.5}
              fill="var(--destructive)"
              stroke="var(--surface)"
              strokeWidth={1.5}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartLabel({
  tone,
  title,
  detail,
}: {
  tone: "muted" | "primary";
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span
        className={`h-2 w-2 rounded-full ${tone === "primary" ? "bg-primary" : "bg-muted-foreground"}`}
      />
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
        {title}
      </span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </div>
  );
}

// Sits between Original and Corrected: what went wrong, what changes, what doesn't.
function CorrectionExplainer({
  preview,
  deviceName,
}: {
  preview: ElevationPreview;
  deviceName?: string;
}) {
  const recorder = deviceName ?? "Your device";
  const fromKm = preview.flatRegion ? formatKm(preview.flatRegion.fromKm) : null;
  const terrain = preview.method === "terrain";

  let wentWrong: React.ReactNode;
  if (preview.errorType === "flatline") {
    wentWrong = (
      <>
        {recorder}'s altimeter{" "}
        <b className="font-medium text-foreground">stopped updating at km {fromKm}</b> (shaded),
        often a sensor port blocked by sweat or rain. The climbing after that wasn't recorded.
      </>
    );
  } else if (preview.errorType === "spikes") {
    wentWrong = (
      <>
        {recorder} logged <b className="font-medium text-foreground">{preview.spikeCount} spikes</b>{" "}
        (red dots), adding climbing you didn't do.
      </>
    );
  } else {
    wentWrong = `${recorder} recorded ${preview.direction === "up" ? "less" : "more"} climbing than the ${terrain ? "terrain along your route shows" : "recording supports once sensor noise is removed"}.`;
  }

  const items = [
    {
      icon:
        preview.errorType === "flatline" ? (
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm border border-dashed border-destructive/60 bg-destructive/10" />
        ) : (
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-destructive" />
        ),
      title: "What went wrong",
      body: wentWrong,
    },
    {
      icon: terrain ? (
        <Crosshair className="h-3.5 w-3.5 shrink-0 text-primary" />
      ) : (
        <Waves className="h-3.5 w-3.5 shrink-0 text-primary" />
      ),
      title: "What we'll correct",
      body: terrain
        ? "We keep your exact GPS track and take the altitude at every point from terrain elevation data."
        : "We remove the spikes and smooth out sensor noise in your recorded elevation.",
    },
    {
      icon: <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-pr" />,
      title: "What stays the same",
      body: `Route, distance, pace, splits and segment times. The activity shows a ${terrain ? "Terrain-corrected" : "Corrected"} tag.`,
    },
  ];
  return (
    <div className="mx-5 my-3 rounded-lg border border-border bg-surface-2">
      <div className="flex items-center gap-2 px-4 pt-3">
        <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          What's changing
        </span>
      </div>
      <div className="grid gap-5 px-4 pt-2 pb-3 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.title} className="flex gap-2">
            {item.icon}
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground">{item.title}</div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
