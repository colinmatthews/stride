import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { fmtDuration, fmtPace, type Sport } from "@/lib/mock-data";
import { AppShell } from "@/components/AppShell";
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

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="border-b border-border pb-8">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Log effort · {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
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
          />
          <ModeTab
            active={mode === "timer"}
            onClick={() => setMode("timer")}
            icon={TimerIcon}
            label="Live timer"
            hint="Track as you go"
          />
        </div>

        <SportPicker sport={sport} setSport={setSport} />

        {mode === "manual" ? (
          <ManualForm sport={sport} />
        ) : (
          <TimerMode sport={sport} />
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
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof PencilLine;
  label: string;
  hint: string;
}) {
  return (
    <button
      onClick={onClick}
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

function SportPicker({ sport, setSport }: { sport: Sport; setSport: (s: Sport) => void }) {
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
      const paceSecPerKm =
        sport === "Ride" ? undefined : Math.round(totalSeconds / distanceKm);
      const speedKmh =
        sport === "Ride" ? Math.round((distanceKm / (totalSeconds / 3600)) * 10) / 10 : undefined;
      const activity = await saveActivity({
        sport,
        title:
          title.trim() ||
          defaultTitle(sport, new Date()),
        description: description.trim() || undefined,
        distanceKm: Math.round(distanceKm * 100) / 100,
        movingSeconds: totalSeconds,
        elevationM: Number(elevation) || 0,
        avgHr: avgHr ? Number(avgHr) : undefined,
        avgPaceSecPerKm: paceSecPerKm,
        avgSpeedKmh: speedKmh,
        routeSeed: Math.floor(Math.random() * 1000),
      });
      router.navigate({ to: "/activity/$id", params: { id: activity.id } });
    } catch {
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
    hour < 6 ? "Pre-dawn" : hour < 11 ? "Morning" : hour < 14 ? "Midday" : hour < 18 ? "Afternoon" : "Evening";
  const noun =
    sport === "Ride" ? "ride" : sport === "Swim" ? "swim" : sport === "Hike" ? "hike" : sport === "Walk" ? "walk" : "run";
  return `${window} ${noun}`;
}

/* -----------------------------------------------------------------------
 *   Timer mode — existing live-tracking flow, restyled to match aesthetic
 * ---------------------------------------------------------------------*/
function TimerMode({ sport }: { sport: Sport }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    if (running && !paused) {
      ref.current = window.setInterval(() => {
        setElapsed((e) => e + 1);
        setDistance((d) => d + (sport === "Ride" ? 0.0083 : sport === "Swim" ? 0.0007 : 0.0042));
      }, 1000);
    }
    return () => {
      if (ref.current) window.clearInterval(ref.current);
    };
  }, [running, paused, sport]);

  const start = () => {
    setRunning(true);
    setPaused(false);
  };
  const pause = () => setPaused((p) => !p);
  const stop = () => {
    if (ref.current) window.clearInterval(ref.current);
    setRunning(false);
    setPaused(false);
  };
  const reset = () => {
    setElapsed(0);
    setDistance(0);
    setTitle("");
    setDescription("");
  };
  const save = async () => {
    setSaving(true);
    try {
      const pace =
        sport === "Ride"
          ? undefined
          : Math.max(180, Math.floor(elapsed / Math.max(0.1, distance)));
      const speed =
        sport === "Ride" ? Math.round((distance / (elapsed / 3600)) * 10) / 10 : undefined;
      const activity = await saveActivity({
        sport,
        title: title || defaultTitle(sport, new Date()),
        description: description || undefined,
        distanceKm: Math.round(distance * 100) / 100,
        movingSeconds: elapsed,
        elevationM: Math.floor(distance * 12),
        avgHr: 150,
        avgPaceSecPerKm: pace,
        avgSpeedKmh: speed,
        routeSeed: Math.floor(Math.random() * 1000),
      });
      router.navigate({ to: "/activity/$id", params: { id: activity.id } });
    } catch {
      setSaving(false);
    }
  };

  const pace =
    sport === "Ride"
      ? distance > 0
        ? `${(distance / (elapsed / 3600 || 1)).toFixed(1)} km/h`
        : "0.0 km/h"
      : distance > 0
        ? fmtPace(elapsed / distance)
        : "—";

  const finished = !running && elapsed > 0;

  return (
    <section className="mt-8 border border-border">
      <div className="bg-secondary p-10 text-center text-secondary-foreground">
        <div className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/70">
          <ActivityIcon className="h-3 w-3" /> {sport}
          {running && !paused && (
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          )}
        </div>
        <div className="stat-num mt-4 text-7xl text-primary">{fmtDuration(elapsed)}</div>
        <div className="mt-8 grid grid-cols-3 gap-6">
          <TimerStat label="Distance" value={`${distance.toFixed(2)} km`} />
          <TimerStat label={sport === "Ride" ? "Speed" : "Pace"} value={pace} />
          <TimerStat label="Calories" value={`${Math.round((elapsed / 60) * 10)}`} />
        </div>

        <div className="mt-8 flex items-center justify-center gap-4">
          {!running ? (
            <button
              onClick={start}
              disabled={finished}
              className="grid h-16 w-16 place-items-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play className="h-7 w-7 fill-current" />
            </button>
          ) : (
            <>
              <button
                onClick={pause}
                className="grid h-14 w-14 place-items-center rounded-full bg-surface text-foreground"
              >
                {paused ? (
                  <Play className="h-6 w-6 fill-current" />
                ) : (
                  <Pause className="h-6 w-6 fill-current" />
                )}
              </button>
              <button
                onClick={stop}
                className="grid h-14 w-14 place-items-center rounded-full bg-destructive text-destructive-foreground"
              >
                <Square className="h-5 w-5 fill-current" />
              </button>
            </>
          )}
        </div>
        <div className="mt-4 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/70">
          <MapPin className="h-3 w-3" /> GPS simulated
        </div>
      </div>

      {finished && (
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
          </div>
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              onClick={reset}
              className="h-10 border border-border bg-surface px-4 text-sm text-foreground transition-colors hover:bg-muted"
            >
              Discard
            </button>
            <button
              onClick={save}
              disabled={saving}
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
      <div className="stat-num mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
