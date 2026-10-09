import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fmtDuration, fmtPace, type Sport } from "@/lib/mock-data";
import { AppShell } from "@/components/AppShell";
import { usePostHog } from "@posthog/react";
import { PencilLine, Timer as TimerIcon, ArrowRight, LoaderCircle } from "lucide-react";
import { fetchCurrentRecording, saveActivity } from "@/lib/api";
import { SpotlightRecorder } from "@/components/SpotlightRecorder";

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
  const [hasRecording, setHasRecording] = useState(false);

  useEffect(() => {
    let mounted = true;
    void fetchCurrentRecording()
      .then((current) => {
        if (mounted && current) {
          setSport(current.sport);
          setHasRecording(true);
          setMode("timer");
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

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
            disabled={hasRecording}
            icon={PencilLine}
            label="Manual entry"
            hint="Log what you already did"
          />
          <ModeTab
            active={mode === "timer"}
            onClick={() => setMode("timer")}
            icon={TimerIcon}
            label="Live timer"
            hint="Track as you go"
          />
        </div>

        <SportPicker sport={sport} setSport={setSport} disabled={hasRecording} />

        {mode === "manual" ? (
          <ManualForm sport={sport} />
        ) : (
          <SpotlightRecorder sport={sport} onSessionChange={setHasRecording} />
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
  disabled,
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
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-2 p-3 text-left transition-colors sm:gap-4 sm:p-5 ${
        active
          ? "bg-secondary text-secondary-foreground"
          : "bg-surface text-foreground hover:bg-muted"
      }`}
    >
      <div
        className={`grid h-8 w-8 shrink-0 place-items-center sm:h-10 sm:w-10 ${
          active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="font-display text-sm font-semibold tracking-tight sm:text-base">
          {label}
        </div>
        <div
          className={`mt-0.5 hidden font-mono text-[10px] uppercase tracking-[0.22em] sm:block ${
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
  disabled?: boolean;
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
            type="button"
            disabled={disabled}
            onClick={() => setSport(s)}
            className={`h-11 px-3 text-sm font-medium transition-colors ${
              sport === s
                ? "bg-secondary text-secondary-foreground"
                : "border border-border bg-surface text-foreground hover:border-foreground/50"
            }`}
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
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [elevation, setElevation] = useState("");
  const [avgHr, setAvgHr] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const distanceKm = Number(distance) || 0;
  const totalSeconds =
    (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60 + (Number(seconds) || 0);
  const isValid = distanceKm > 0 && totalSeconds > 0;

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
      const paceSecPerKm = sport === "Ride" ? undefined : Math.round(totalSeconds / distanceKm);
      const speedKmh =
        sport === "Ride" ? Math.round((distanceKm / (totalSeconds / 3600)) * 10) / 10 : undefined;
      const activity = await saveActivity({
        sport,
        title: title.trim() || defaultTitle(sport, new Date()),
        description: description.trim() || undefined,
        distanceKm: Math.round(distanceKm * 100) / 100,
        movingSeconds: totalSeconds,
        elevationM: Number(elevation) || 0,
        avgHr: avgHr ? Number(avgHr) : undefined,
        avgPaceSecPerKm: paceSecPerKm,
        avgSpeedKmh: speedKmh,
        routeSeed: Math.floor(Math.random() * 1000),
      });
      posthog.capture("activity_saved", {
        sport,
        distance_km: Math.round(distanceKm * 100) / 100,
        moving_seconds: totalSeconds,
        elevation_m: Number(elevation) || 0,
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
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <NumberField
            label={sport === "Swim" ? "Distance (km)" : "Distance"}
            unit="km"
            value={distance}
            onChange={setDistance}
            placeholder="10.0"
            step="0.01"
          />
          <DurationField
            hours={hours}
            minutes={minutes}
            seconds={seconds}
            setHours={setHours}
            setMinutes={setMinutes}
            setSeconds={setSeconds}
          />
        </div>

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
          <NumberField
            label="Elevation gain"
            unit="m"
            value={elevation}
            onChange={setElevation}
            placeholder="120"
            step="1"
          />
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
          {isValid ? "Ready to log" : "Fill distance and time"}
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
