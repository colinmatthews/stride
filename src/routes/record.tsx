import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { fmtDuration, fmtPace, type Sport } from "@/lib/mock-data";
import { AppShell } from "@/components/AppShell";
import { usePostHog } from "@posthog/react";
import {
  Play,
  Pause,
  Square,
  MapPin,
  Activity as ActivityIcon,
  PencilLine,
  Timer as TimerIcon,
  ArrowRight,
  LoaderCircle,
} from "lucide-react";
import { saveActivity } from "@/lib/api";
import {
  addGpsSample,
  emptyGpsTrack,
  resetTrackingBaseline,
  type GpsTrack,
} from "@/lib/live-tracking";

export const Route = createFileRoute("/record")({
  head: () => ({
    meta: [
      { title: "Record — Stride" },
      { name: "description", content: "Log a run, ride or swim — manual or live." },
    ],
  }),
  component: Record,
});

const SPORTS: Sport[] = ["Run", "Ride", "Swim", "Hike", "Walk"];
type Mode = "manual" | "timer";

function Record() {
  const [mode, setMode] = useState<Mode>("manual");
  const [sport, setSport] = useState<Sport>("Run");
  const [timerLocked, setTimerLocked] = useState(false);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="border-b border-border pb-8">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Log effort ·{" "}
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </div>
          <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-[-0.02em]">
            Record activity
          </h1>
        </div>

        <div className="mt-8 grid grid-cols-2 border border-border">
          <ModeTab
            active={mode === "manual"}
            onClick={() => setMode("manual")}
            icon={PencilLine}
            label="Manual entry"
            hint="Log what you already did"
            disabled={timerLocked}
          />
          <ModeTab
            active={mode === "timer"}
            onClick={() => setMode("timer")}
            icon={TimerIcon}
            label="Live timer"
            hint="Track as you go"
          />
        </div>

        <SportPicker sport={sport} setSport={setSport} disabled={timerLocked} />

        {mode === "manual" ? (
          <ManualForm sport={sport} />
        ) : (
          <TimerMode sport={sport} onActiveChange={setTimerLocked} />
        )}
      </div>
    </AppShell>
  );
}

function ModeTab({
  active,
  onClick,
  icon: Icon,
  label,
  hint,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof PencilLine;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-4 p-5 text-left transition-colors ${
        active
          ? "bg-secondary text-secondary-foreground"
          : "bg-surface text-foreground hover:bg-muted"
      }`}
    >
      <div
        className={`grid h-10 w-10 shrink-0 place-items-center ${
          active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="font-display text-base font-semibold tracking-tight">{label}</div>
        <div
          className={`mt-0.5 font-mono text-[10px] uppercase tracking-[0.22em] ${
            active ? "text-secondary-foreground/70" : "text-muted-foreground"
          }`}
        >
          {hint}
        </div>
      </div>
    </button>
  );
}

function SportPicker({
  sport,
  setSport,
  disabled,
}: {
  sport: Sport;
  setSport: (s: Sport) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-8">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        Sport
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2">
        {SPORTS.map((s) => (
          <button
            key={s}
            onClick={() => setSport(s)}
            disabled={disabled}
            className={`h-11 px-3 text-sm font-medium transition-colors ${
              sport === s
                ? "bg-secondary text-secondary-foreground"
                : "border border-border bg-surface text-foreground hover:border-foreground/50"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function ManualForm({ sport }: { sport: Sport }) {
  const posthog = usePostHog();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [distance, setDistance] = useState("");
  const [poolLengthM, setPoolLengthM] = useState<25 | 50>(25);
  const [poolLengths, setPoolLengths] = useState("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [elevation, setElevation] = useState("");
  const [avgHr, setAvgHr] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isSwim = sport === "Swim";
  const lengthCount = Number(poolLengths);
  const distanceKm = isSwim ? (lengthCount * poolLengthM) / 1000 : Number(distance);
  const totalSeconds =
    (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60 + (Number(seconds) || 0);
  const isValid =
    Number.isFinite(distanceKm) &&
    Math.round(distanceKm * 1000) > 0 &&
    distanceKm <= 1000 &&
    (!isSwim || (Number.isInteger(lengthCount) && lengthCount > 0 && lengthCount <= 20000)) &&
    totalSeconds > 0 &&
    Number.isInteger(totalSeconds) &&
    totalSeconds <= 60 * 60 * 24 * 7 &&
    (isSwim ||
      elevation.trim() === "" ||
      (Number.isInteger(Number(elevation)) &&
        Number(elevation) >= 0 &&
        Number(elevation) <= 100000));

  const derivedPace =
    sport === "Ride"
      ? distanceKm > 0 && totalSeconds > 0
        ? `${(distanceKm / (totalSeconds / 3600)).toFixed(1)} km/h`
        : "—"
      : distanceKm > 0 && totalSeconds > 0
        ? fmtPace(totalSeconds / distanceKm)
        : "—";

  async function save() {
    if (!isValid) {
      setError("Enter a distance and duration before saving.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const roundedDistanceKm = Math.round(distanceKm * 1000) / 1000;
      const paceSecPerKm = sport === "Ride" ? undefined : Math.round(totalSeconds / distanceKm);
      const speedKmh =
        sport === "Ride" ? Math.round((distanceKm / (totalSeconds / 3600)) * 10) / 10 : undefined;
      const activity = await saveActivity({
        sport,
        title: title.trim() || defaultTitle(sport, new Date()),
        description: description.trim() || undefined,
        distanceKm: roundedDistanceKm,
        movingSeconds: totalSeconds,
        elevationM: isSwim ? 0 : Number(elevation) || 0,
        poolLengthM: isSwim ? poolLengthM : undefined,
        poolLengths: isSwim ? lengthCount : undefined,
        trackingMode: isSwim ? "pool" : "manual",
        avgHr: avgHr ? Number(avgHr) : undefined,
        avgPaceSecPerKm: paceSecPerKm,
        avgSpeedKmh: speedKmh,
        routeSeed: Math.floor(Math.random() * 1000),
      });
      posthog.capture("activity_saved", {
        sport,
        distance_km: roundedDistanceKm,
        moving_seconds: totalSeconds,
        elevation_m: isSwim ? 0 : Number(elevation) || 0,
        pool_lengths: isSwim ? lengthCount : undefined,
        entry_mode: "manual",
      });
      router.navigate({ to: "/activity/$id", params: { id: activity.id } });
    } catch (err) {
      posthog.captureException(err);
      setError("Couldn't save activity. Try again.");
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 border border-border bg-surface">
      <div className="border-b border-border p-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          The essentials
        </div>
        <div className={`mt-4 grid gap-6 ${isSwim ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {isSwim ? (
            <>
              <label className="block">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Pool length
                </div>
                <select
                  value={poolLengthM}
                  onChange={(event) => setPoolLengthM(Number(event.target.value) as 25 | 50)}
                  className="h-12 w-full border border-border bg-background px-3 text-lg font-semibold outline-none transition-colors focus:border-foreground"
                >
                  <option value={25}>25 m</option>
                  <option value={50}>50 m</option>
                </select>
              </label>
              <NumberField
                label="Completed pool lengths"
                unit="count"
                value={poolLengths}
                onChange={setPoolLengths}
                placeholder="20"
                step="1"
              />
            </>
          ) : (
            <NumberField
              label="Distance"
              unit="km"
              value={distance}
              onChange={setDistance}
              placeholder="10.0"
              step="0.001"
            />
          )}
          <DurationField
            hours={hours}
            minutes={minutes}
            seconds={seconds}
            setHours={setHours}
            setMinutes={setMinutes}
            setSeconds={setSeconds}
          />
        </div>

        {isSwim && (
          <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Distance from lengths
            </div>
            <div className="stat-num text-lg font-semibold">{distanceKm.toFixed(3)} km</div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {sport === "Ride" ? "Avg speed" : "Avg pace"}
          </div>
          <div className="stat-num text-lg font-semibold">{derivedPace}</div>
        </div>
      </div>

      <div className="border-b border-border p-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Details
        </div>
        <div className="mt-4 space-y-4">
          <TextField
            label="Title"
            value={title}
            onChange={setTitle}
            placeholder={defaultTitle(sport, new Date())}
          />
          <label className="block">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Description
            </div>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="How did it feel? Any notes for future-you?"
              className="w-full resize-none border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-foreground"
            />
          </label>
        </div>
      </div>

      <div className="border-b border-border p-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Optional
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {!isSwim && (
            <NumberField
              label="Elevation gain"
              unit="m"
              value={elevation}
              onChange={setElevation}
              placeholder="120"
              step="1"
            />
          )}
          <NumberField
            label="Average heart rate"
            unit="bpm"
            value={avgHr}
            onChange={setAvgHr}
            placeholder="148"
            step="1"
          />
        </div>
      </div>

      {error && (
        <div className="border-b border-destructive/30 bg-destructive/8 px-6 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 p-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {isValid ? "Ready to log" : isSwim ? "Fill lengths and time" : "Fill distance and time"}
        </div>
        <button
          onClick={save}
          disabled={!isValid || busy}
          className="group inline-flex h-11 items-center gap-2 bg-primary px-6 text-sm font-medium text-primary-foreground transition-all hover:gap-3 disabled:opacity-50"
        >
          {busy ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" /> Saving
            </>
          ) : (
            <>
              Save activity{" "}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </div>
    </section>
  );
}

function NumberField({
  label,
  unit,
  value,
  onChange,
  placeholder,
  step,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  step: string;
}) {
  return (
    <label className="block">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="stat-num h-12 w-full border border-border bg-background pl-3 pr-12 text-lg font-semibold outline-none transition-colors focus:border-foreground"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {unit}
        </span>
      </div>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full border border-border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground"
      />
    </label>
  );
}

function DurationField({
  hours,
  minutes,
  seconds,
  setHours,
  setMinutes,
  setSeconds,
}: {
  hours: string;
  minutes: string;
  seconds: string;
  setHours: (v: string) => void;
  setMinutes: (v: string) => void;
  setSeconds: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        Duration
      </div>
      <div className="grid grid-cols-3 gap-0 border border-border">
        <DurationCell label="hh" value={hours} onChange={setHours} max={23} />
        <DurationCell label="mm" value={minutes} onChange={setMinutes} max={59} border />
        <DurationCell label="ss" value={seconds} onChange={setSeconds} max={59} border />
      </div>
    </div>
  );
}

function DurationCell({
  label,
  value,
  onChange,
  max,
  border,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  border?: boolean;
}) {
  return (
    <label className={`relative block bg-background ${border ? "border-l border-border" : ""}`}>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0"
        className="stat-num h-12 w-full bg-transparent px-3 text-center text-lg font-semibold outline-none transition-colors focus:bg-muted"
      />
      <span className="pointer-events-none absolute right-2 top-1 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground/60">
        {label}
      </span>
    </label>
  );
}

function defaultTitle(sport: Sport, date: Date) {
  const hour = date.getHours();
  const window =
    hour < 6
      ? "Pre-dawn"
      : hour < 11
        ? "Morning"
        : hour < 14
          ? "Midday"
          : hour < 18
            ? "Afternoon"
            : "Evening";
  const noun =
    sport === "Ride"
      ? "ride"
      : sport === "Swim"
        ? "swim"
        : sport === "Hike"
          ? "hike"
          : sport === "Walk"
            ? "walk"
            : "run";
  return `${window} ${noun}`;
}

/* -----------------------------------------------------------------------
 *   Timer mode — Spotlight layout with GPS and pool-length tracking
 * ---------------------------------------------------------------------*/
function TimerMode({
  sport,
  onActiveChange,
}: {
  sport: Sport;
  onActiveChange: (active: boolean) => void;
}) {
  const posthog = usePostHog();
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "running" | "paused" | "finished">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [track, setTrack] = useState<GpsTrack>(emptyGpsTrack);
  const [gpsStatus, setGpsStatus] = useState("Waiting to start");
  const [poolLengthM, setPoolLengthM] = useState<25 | 50>(25);
  const [poolLengths, setPoolLengths] = useState(0);
  const [distanceInput, setDistanceInput] = useState("");
  const [elevationInput, setElevationInput] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const startedAt = useRef<number | null>(null);
  const accumulatedMs = useRef(0);

  useEffect(() => {
    if (phase !== "running") return;
    const interval = window.setInterval(() => {
      if (startedAt.current !== null) {
        setElapsed(Math.floor((accumulatedMs.current + Date.now() - startedAt.current) / 1000));
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase !== "running" || sport === "Swim") return;
    if (!navigator.geolocation) {
      setGpsStatus("Location unavailable · enter distance and ascent when finished");
      return;
    }

    let active = true;
    setGpsStatus("Waiting for GPS fix");
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!active) return;
        if (position.coords.accuracy > 50) {
          setGpsStatus("GPS signal too weak · keep moving into open sky");
          return;
        }
        setTrack((current) =>
          addGpsSample(
            current,
            {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              altitude: position.coords.altitude,
              altitudeAccuracy: position.coords.altitudeAccuracy,
              timestamp: position.timestamp,
            },
            sport,
          ),
        );
        setGpsStatus(
          position.coords.altitude === null ||
            (position.coords.altitudeAccuracy !== null && position.coords.altitudeAccuracy > 25)
            ? "GPS distance active · ascent needs manual entry"
            : "GPS distance and ascent active",
        );
      },
      (positionError) => {
        if (!active) return;
        setGpsStatus(
          positionError.code === 1
            ? "Location blocked · enter distance and ascent when finished"
            : "GPS unavailable · enter distance and ascent when finished",
        );
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    );

    return () => {
      active = false;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [phase, sport]);

  function finishClock() {
    if (startedAt.current !== null) {
      accumulatedMs.current += Date.now() - startedAt.current;
      startedAt.current = null;
    }
    setElapsed(Math.floor(accumulatedMs.current / 1000));
  }

  function start() {
    accumulatedMs.current = 0;
    startedAt.current = Date.now();
    setError("");
    setPhase("running");
    onActiveChange(true);
  }

  function togglePause() {
    if (phase === "paused") {
      startedAt.current = Date.now();
      setPhase("running");
    } else {
      finishClock();
      setTrack(resetTrackingBaseline);
      setPhase("paused");
    }
  }

  function stop() {
    finishClock();
    setPhase("finished");
    setDistanceInput(track.distanceM > 0 ? (track.distanceM / 1000).toFixed(3) : "");
    setElevationInput(track.altitudePoints > 0 ? String(Math.round(track.elevationGainM)) : "");
  }

  function reset() {
    setPhase("idle");
    setElapsed(0);
    setTrack(emptyGpsTrack);
    setPoolLengths(0);
    setDistanceInput("");
    setElevationInput("");
    setTitle("");
    setDescription("");
    setError("");
    setGpsStatus("Waiting to start");
    accumulatedMs.current = 0;
    startedAt.current = null;
    onActiveChange(false);
  }

  const isSwim = sport === "Swim";
  const distanceKm = isSwim ? (poolLengths * poolLengthM) / 1000 : track.distanceM / 1000;
  const savedDistanceKm = isSwim ? distanceKm : Number(distanceInput);
  const savedElevationM = isSwim ? 0 : Number(elevationInput);
  const canSave =
    elapsed > 0 &&
    elapsed <= 60 * 60 * 24 * 7 &&
    Number.isFinite(savedDistanceKm) &&
    Math.round(savedDistanceKm * 1000) > 0 &&
    savedDistanceKm <= 1000 &&
    (!isSwim || poolLengths <= 20000) &&
    (isSwim ||
      (elevationInput.trim() !== "" &&
        Number.isInteger(savedElevationM) &&
        savedElevationM >= 0 &&
        savedElevationM <= 100000));
  const pace =
    distanceKm > 0 && elapsed > 0
      ? sport === "Ride"
        ? `${(distanceKm / (elapsed / 3600)).toFixed(1)} km/h`
        : fmtPace(elapsed / distanceKm)
      : "—";

  async function save() {
    if (!canSave) {
      setError(
        isSwim
          ? "Count at least one pool length before saving."
          : "Enter a valid distance and elevation gain before saving.",
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      const roundedDistanceKm = Math.round(savedDistanceKm * 1000) / 1000;
      const activity = await saveActivity({
        sport,
        title: title.trim() || defaultTitle(sport, new Date()),
        description: description.trim() || undefined,
        distanceKm: roundedDistanceKm,
        movingSeconds: elapsed,
        elevationM: savedElevationM,
        poolLengthM: isSwim ? poolLengthM : undefined,
        poolLengths: isSwim ? poolLengths : undefined,
        trackingMode: isSwim ? "pool" : track.points >= 2 ? "gps" : "manual",
        avgPaceSecPerKm: sport === "Ride" ? undefined : Math.round(elapsed / savedDistanceKm),
        avgSpeedKmh:
          sport === "Ride" ? Math.round((savedDistanceKm / (elapsed / 3600)) * 10) / 10 : undefined,
        routeSeed: Math.floor(Math.random() * 1000),
      });
      posthog.capture("activity_saved", {
        sport,
        distance_km: roundedDistanceKm,
        moving_seconds: elapsed,
        elevation_m: savedElevationM,
        pool_lengths: isSwim ? poolLengths : undefined,
        entry_mode: "timer",
      });
      router.navigate({ to: "/activity/$id", params: { id: activity.id } });
    } catch (saveError) {
      posthog.captureException(saveError);
      setError("Couldn't save activity. Try again.");
      setSaving(false);
    }
  }

  const metricLabel = isSwim ? "Pool lengths" : "Elevation gain";
  const metricValue = isSwim
    ? String(poolLengths)
    : track.altitudePoints > 0
      ? String(Math.round(track.elevationGainM))
      : "—";

  return (
    <section className="mt-8 border border-border">
      <div className="grid md:grid-cols-2">
        <div className="flex flex-col bg-secondary p-7 text-secondary-foreground sm:p-10">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/70">
            <ActivityIcon className="h-3 w-3" /> {sport} · Live session
            {phase === "running" && (
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            )}
          </div>
          <div className="mt-8 font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/70">
            Elapsed time
          </div>
          <div className="stat-num mt-2 text-5xl text-primary sm:text-6xl">
            {fmtDuration(elapsed)}
          </div>
          <div className="mt-8 grid grid-cols-2 gap-4 border-t border-secondary-foreground/20 pt-5">
            <TimerStat label="Distance" value={`${distanceKm.toFixed(3)} km`} />
            <TimerStat label={sport === "Ride" ? "Speed" : "Pace"} value={pace} />
          </div>
          <div className="mt-10 flex items-center justify-center gap-4 md:mt-auto md:pt-10">
            {phase === "idle" ? (
              <button
                type="button"
                aria-label="Start timer"
                onClick={start}
                className="grid h-16 w-16 place-items-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105"
              >
                <Play className="h-7 w-7 fill-current" />
              </button>
            ) : phase === "running" || phase === "paused" ? (
              <>
                <button
                  type="button"
                  aria-label={phase === "paused" ? "Resume timer" : "Pause timer"}
                  onClick={togglePause}
                  className="grid h-14 w-14 place-items-center rounded-full bg-surface text-foreground"
                >
                  {phase === "paused" ? (
                    <Play className="h-6 w-6 fill-current" />
                  ) : (
                    <Pause className="h-6 w-6 fill-current" />
                  )}
                </button>
                <button
                  type="button"
                  aria-label="Stop timer"
                  onClick={stop}
                  className="grid h-14 w-14 place-items-center rounded-full bg-destructive text-destructive-foreground"
                >
                  <Square className="h-5 w-5 fill-current" />
                </button>
              </>
            ) : null}
          </div>
          <div className="mt-4 flex items-center justify-center gap-1 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-secondary-foreground/70">
            {isSwim ? <ActivityIcon className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
            {isSwim ? "Count each completed length" : gpsStatus}
          </div>
        </div>
        <div className="flex flex-col justify-between bg-primary p-7 text-primary-foreground sm:p-10">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] opacity-80">
              {metricLabel}
            </div>
            <div className="mt-5 flex items-baseline gap-2">
              <span className="stat-num text-7xl font-bold sm:text-8xl">{metricValue}</span>
              {!isSwim && <span className="stat-num text-3xl">m</span>}
            </div>
            <div className="mt-2 text-sm opacity-85">
              {isSwim ? `${poolLengthM} m pool` : "Measured from GPS altitude when available"}
            </div>
          </div>
          {isSwim ? (
            <div className="mt-14 space-y-4">
              <label className="block text-xs font-medium">
                Pool length
                <select
                  value={poolLengthM}
                  onChange={(event) => setPoolLengthM(Number(event.target.value) as 25 | 50)}
                  disabled={phase !== "idle"}
                  className="mt-2 block w-full border border-primary-foreground/40 bg-transparent p-2 text-sm"
                >
                  <option value={25} className="text-foreground">
                    25 m
                  </option>
                  <option value={50} className="text-foreground">
                    50 m
                  </option>
                </select>
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPoolLengths((count) => Math.max(0, count - 1))}
                  disabled={phase !== "running" || poolLengths === 0}
                  className="h-12 flex-1 border border-primary-foreground/50 text-sm font-medium disabled:opacity-50"
                >
                  Undo length
                </button>
                <button
                  type="button"
                  onClick={() => setPoolLengths((count) => count + 1)}
                  disabled={phase !== "running"}
                  className="h-12 flex-1 bg-primary-foreground text-sm font-semibold text-primary disabled:opacity-50"
                >
                  + Add length
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-14 border-t border-primary-foreground/30 pt-4 text-sm">
              {track.altitudePoints > 0
                ? "Ascent updates as reliable altitude readings arrive."
                : "No reliable altitude yet. You can enter ascent before saving."}
            </div>
          )}
        </div>
      </div>

      {phase === "finished" && (
        <div className="bg-surface p-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Finish up
          </div>
          <div className="mt-4 space-y-4">
            <TextField
              label="Title"
              value={title}
              onChange={setTitle}
              placeholder={defaultTitle(sport, new Date())}
            />
            <label className="block">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Description
              </div>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="How did it go?"
                className="w-full resize-none border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-foreground"
              />
            </label>
            {isSwim ? (
              <NumberField
                label="Completed pool lengths"
                unit="lengths"
                value={String(poolLengths)}
                onChange={(value) => setPoolLengths(Math.max(0, Math.floor(Number(value) || 0)))}
                placeholder="0"
                step="1"
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  label="Distance"
                  unit="km"
                  value={distanceInput}
                  onChange={setDistanceInput}
                  placeholder="0.000"
                  step="0.001"
                />
                <NumberField
                  label="Elevation gain"
                  unit="m"
                  value={elevationInput}
                  onChange={setElevationInput}
                  placeholder="Enter 0 if none"
                  step="1"
                />
              </div>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={reset}
              className="h-10 border border-border bg-surface px-4 text-sm text-foreground transition-colors hover:bg-muted"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !canSave}
              className="inline-flex h-10 items-center gap-2 bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" /> Saving
                </>
              ) : (
                <>
                  Save activity <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function TimerStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/70">
        {label}
      </div>
      <div className="stat-num mt-1 text-lg font-bold sm:text-2xl">{value}</div>
    </div>
  );
}
