import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { usePostHog } from "@posthog/react";
import {
  Activity as ActivityIcon,
  ArrowRight,
  LoaderCircle,
  MapPin,
  Pause,
  Play,
  Square,
} from "lucide-react";
import type { Sport } from "@/lib/mock-data";
import { fmtDuration, fmtPace } from "@/lib/mock-data";
import {
  discardRecording,
  fetchCurrentRecording,
  finishRecording,
  startRecording,
  updateRecording,
  type RecordingSession,
  type RecordingSnapshot,
} from "@/lib/api";
import { addGpsPoint, toGpsPoint, type GpsAccumulator } from "@/lib/recording-measurements";

type Measurements = Pick<RecordingSnapshot, "distanceMeters" | "elevationGainM" | "poolLengths">;

function defaultTitle(sport: Sport) {
  return `${new Date().toLocaleDateString("en-US", { weekday: "long" })} ${sport.toLowerCase()}`;
}

function getFirstPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

export function SpotlightRecorder({
  sport,
  onSessionChange,
}: {
  sport: Sport;
  onSessionChange: (active: boolean) => void;
}) {
  const router = useRouter();
  const posthog = usePostHog();
  const [session, setSession] = useState<RecordingSession | null>(null);
  const sessionRef = useRef<RecordingSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [locationStatus, setLocationStatus] = useState("Waiting for GPS");
  const [poolLengthM, setPoolLengthM] = useState<25 | 50>(25);
  const [measurements, setMeasurements] = useState<Measurements>({
    distanceMeters: 0,
    elevationGainM: null,
    poolLengths: null,
  });
  const measurementsRef = useRef<Measurements>({
    distanceMeters: 0,
    elevationGainM: null,
    poolLengths: null,
  });
  const gpsRef = useRef<GpsAccumulator>({
    previous: null,
    distanceMeters: 0,
    elevationGainM: null,
  });
  const resumeAt = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const requestSequence = useRef(0);
  const [now, setNow] = useState(Date.now());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const applySession = useCallback(
    (next: RecordingSession | null) => {
      sessionRef.current = next;
      setSession(next);
      onSessionChange(!!next);
    },
    [onSessionChange],
  );

  const applyMeasurements = useCallback((next: Measurements) => {
    measurementsRef.current = next;
    setMeasurements(next);
  }, []);

  const liveSeconds = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return 0;
    return (
      current.movingSeconds +
      (current.status === "recording"
        ? Math.max(0, Math.floor((Date.now() - resumeAt.current) / 1000))
        : 0)
    );
  }, []);

  useEffect(() => {
    let mounted = true;
    fetchCurrentRecording()
      .then(async (current) => {
        if (!mounted) return;
        if (current?.status === "recording") {
          // A reloaded or interrupted tab cannot reconstruct measurements after its last checkpoint.
          current = await updateRecording(current.id, {
            status: "paused",
            movingSeconds: current.movingSeconds,
            distanceMeters: current.distanceMeters,
            elevationGainM: current.elevationGainM,
            poolLengths: current.poolLengths,
          });
          setNotice("Recording recovered through its last checkpoint. Resume when ready.");
        }
        if (current) {
          applyMeasurements({
            distanceMeters: current.distanceMeters,
            elevationGainM: current.elevationGainM,
            poolLengths: current.poolLengths,
          });
          gpsRef.current = {
            previous: null,
            distanceMeters: current.distanceMeters,
            elevationGainM: current.elevationGainM,
          };
          if (current.poolLengthM === 25 || current.poolLengthM === 50)
            setPoolLengthM(current.poolLengthM);
        }
        applySession(current);
      })
      .catch(() => setError("Could not load your recording. Try reloading the page."))
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
      onSessionChange(false);
    };
  }, [applyMeasurements, applySession, onSessionChange]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const persist = useCallback(
    async (status: RecordingSession["status"], override?: Measurements) => {
      const current = sessionRef.current;
      if (!current) return;
      const value = override ?? measurementsRef.current;
      const seconds = liveSeconds();
      const snapshot: RecordingSnapshot = {
        status,
        movingSeconds: seconds,
        distanceMeters: Math.round(value.distanceMeters * 100) / 100,
        elevationGainM:
          value.elevationGainM === null ? null : Math.round(value.elevationGainM * 100) / 100,
        poolLengths: value.poolLengths,
      };
      const sequence = ++requestSequence.current;
      const local = { ...current, ...snapshot, updatedAt: new Date().toISOString() };
      resumeAt.current = Date.now();
      applySession(local);
      const task = queue.current
        .catch(() => undefined)
        .then(() => updateRecording(current.id, snapshot));
      queue.current = task;
      try {
        const updated = await task;
        if (sequence === requestSequence.current) applySession(updated);
        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save recording progress");
        throw cause;
      }
    },
    [applySession, liveSeconds],
  );

  const sessionId = session?.id;
  const sessionStatus = session?.status;
  const sessionSport = session?.sport;

  useEffect(() => {
    if (!sessionId || sessionStatus !== "recording") return;
    const timer = window.setInterval(() => {
      void persist("recording").catch(() => undefined);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [sessionId, sessionStatus, persist]);

  useEffect(() => {
    if (!sessionId || sessionStatus !== "recording" || sessionSport === "Swim") return;
    const watcher = navigator.geolocation.watchPosition(
      (position) => {
        gpsRef.current = addGpsPoint(gpsRef.current, toGpsPoint(position));
        applyMeasurements({
          distanceMeters: gpsRef.current.distanceMeters,
          elevationGainM: gpsRef.current.elevationGainM,
          poolLengths: null,
        });
        setLocationStatus(
          position.coords.accuracy > 50
            ? "Low GPS accuracy · waiting for a better fix"
            : "GPS measuring distance",
        );
      },
      () => {
        setLocationStatus("GPS unavailable · recording paused");
        void persist("paused").catch(() => undefined);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
    return () => {
      navigator.geolocation.clearWatch(watcher);
      gpsRef.current = { ...gpsRef.current, previous: null };
    };
  }, [sessionId, sessionStatus, sessionSport, applyMeasurements, persist]);

  useEffect(() => {
    if (sessionStatus !== "recording") return;
    const onHidden = () => {
      if (document.visibilityState === "hidden") void persist("paused").catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onHidden);
    let lock: WakeLockSentinel | undefined;
    void navigator.wakeLock
      ?.request("screen")
      .then((value) => {
        lock = value;
      })
      .catch(() => undefined);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      void lock?.release();
    };
  }, [sessionId, sessionStatus, persist]);

  async function start() {
    setBusy(true);
    setError("");
    try {
      let first: GeolocationPosition | undefined;
      if (sport !== "Swim") {
        if (!navigator.geolocation)
          throw new Error("Location access is required for outdoor recording.");
        first = await getFirstPosition();
        if (first.coords.accuracy > 50)
          throw new Error("GPS accuracy is too low. Move outdoors and try again.");
      }
      const current = await startRecording(sport, sport === "Swim" ? poolLengthM : undefined);
      if (first) gpsRef.current = addGpsPoint(gpsRef.current, toGpsPoint(first));
      applyMeasurements({
        distanceMeters: 0,
        elevationGainM: null,
        poolLengths: sport === "Swim" ? 0 : null,
      });
      resumeAt.current = Date.now();
      applySession(current);
      setNotice("");
      posthog.capture("recording_started", {
        sport,
        measurement_source: sport === "Swim" ? "manual-laps" : "gps",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start recording");
    } finally {
      setBusy(false);
    }
  }

  async function resume() {
    setBusy(true);
    try {
      if (session?.sport !== "Swim") {
        const first = await getFirstPosition();
        if (first.coords.accuracy > 50)
          throw new Error("GPS accuracy is too low. Move outdoors and try again.");
        gpsRef.current = { ...gpsRef.current, previous: toGpsPoint(first) };
      }
      resumeAt.current = Date.now();
      await persist("recording");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resume recording");
    } finally {
      setBusy(false);
    }
  }

  async function changeLengths(delta: number) {
    if (!session || session.status !== "recording") return;
    const nextLengths = Math.max(0, (measurementsRef.current.poolLengths ?? 0) + delta);
    const next = {
      distanceMeters: nextLengths * poolLengthM,
      elevationGainM: null,
      poolLengths: nextLengths,
    };
    applyMeasurements(next);
    try {
      await persist("recording", next);
    } catch {
      /* error is displayed by persist */
    }
  }

  async function discard() {
    if (!session || !window.confirm("Discard this recording?")) return;
    setBusy(true);
    try {
      await queue.current.catch(() => undefined);
      await discardRecording(session.id);
      applySession(null);
      applyMeasurements({ distanceMeters: 0, elevationGainM: null, poolLengths: null });
      gpsRef.current = { previous: null, distanceMeters: 0, elevationGainM: null };
      setTitle("");
      setDescription("");
      setError("");
      setNotice("");
    } catch {
      setError("Could not discard recording. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!session) return;
    setBusy(true);
    try {
      await queue.current;
      const activity = await finishRecording(
        session.id,
        title.trim() || defaultTitle(session.sport),
        description.trim() || undefined,
      );
      posthog.capture("activity_saved", {
        sport: session.sport,
        distance_km: activity.distanceKm,
        moving_seconds: activity.movingSeconds,
        elevation_m: activity.elevationM,
        entry_mode: "timer",
        measurement_source: activity.measurementSource,
      });
      applySession(null);
      await router.navigate({ to: "/activity/$id", params: { id: activity.id } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save activity");
    } finally {
      setBusy(false);
    }
  }

  const activeSport = session?.sport ?? sport;
  const isSwim = activeSport === "Swim";
  const status = session?.status ?? "ready";
  const elapsed = session
    ? session.movingSeconds +
      (status === "recording" ? Math.max(0, Math.floor((now - resumeAt.current) / 1000)) : 0)
    : 0;
  const distanceKm = measurements.distanceMeters / 1000;
  const pace =
    distanceKm > 0 && elapsed > 0
      ? activeSport === "Ride"
        ? `${(distanceKm / (elapsed / 3600)).toFixed(1)} km/h`
        : isSwim
          ? fmtPace(elapsed / distanceKm / 10).replace("/km", "/100m")
          : fmtPace(elapsed / distanceKm)
      : "—";
  const metricValue = isSwim
    ? (measurements.poolLengths ?? 0)
    : measurements.elevationGainM === null
      ? "—"
      : Math.round(measurements.elevationGainM);
  const progress = isSwim
    ? 0
    : measurements.elevationGainM === null
      ? 0
      : (measurements.elevationGainM % 10) / 10;

  if (loading)
    return <div className="mt-8 border border-border bg-surface p-8">Loading recording…</div>;

  return (
    <div className="mt-8">
      {!session && isSwim && (
        <label className="mb-4 flex items-center gap-3 text-sm">
          Pool length
          <select
            value={poolLengthM}
            onChange={(event) => setPoolLengthM(Number(event.target.value) as 25 | 50)}
            className="border border-border bg-surface px-3 py-2"
          >
            <option value={25}>25 m</option>
            <option value={50}>50 m</option>
          </select>
        </label>
      )}
      <section
        className="grid border border-border md:grid-cols-2"
        aria-label="Spotlight live timer"
      >
        <div className="flex flex-col bg-secondary p-7 text-secondary-foreground sm:p-10">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/70">
            <ActivityIcon className="h-3 w-3" /> {activeSport} · Live session
            {status === "recording" && (
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            )}
          </div>
          <div className="mt-8 font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/70">
            Elapsed time
          </div>
          <div className="stat-num mt-2 text-5xl text-primary sm:text-6xl" aria-live="off">
            {fmtDuration(elapsed)}
          </div>
          <div className="mt-8 grid grid-cols-2 gap-4 border-t border-secondary-foreground/20 pt-5">
            <TimerStat
              label="Distance"
              value={
                isSwim
                  ? `${Math.round(measurements.distanceMeters)} m`
                  : `${distanceKm.toFixed(2)} km`
              }
            />
            <TimerStat label={activeSport === "Ride" ? "Speed" : "Pace"} value={pace} />
          </div>
          <div className="mt-10 flex items-center gap-4 md:mt-auto md:pt-10">
            {status === "ready" && (
              <Control label="Start recording" onClick={() => void start()} disabled={busy} primary>
                <Play className="h-7 w-7 fill-current" />
              </Control>
            )}
            {status === "recording" && (
              <>
                <Control
                  label="Pause recording"
                  onClick={() => void persist("paused").catch(() => undefined)}
                >
                  <Pause className="h-6 w-6" />
                </Control>
                <Control
                  label="Stop recording"
                  onClick={() => void persist("stopped").catch(() => undefined)}
                  destructive
                >
                  <Square className="h-5 w-5 fill-current" />
                </Control>
              </>
            )}
            {status === "paused" && (
              <>
                <Control
                  label="Resume recording"
                  onClick={() => void resume()}
                  disabled={busy}
                  primary
                >
                  <Play className="h-7 w-7 fill-current" />
                </Control>
                <Control
                  label="Stop recording"
                  onClick={() => void persist("stopped").catch(() => undefined)}
                  destructive
                >
                  <Square className="h-5 w-5 fill-current" />
                </Control>
              </>
            )}
            {status !== "ready" && (
              <button
                type="button"
                onClick={() => void discard()}
                disabled={busy}
                className="text-sm underline disabled:opacity-50"
              >
                Discard
              </button>
            )}
          </div>
          <div className="mt-5 flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-secondary-foreground/70">
            {isSwim ? <ActivityIcon className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
            {isSwim
              ? "Lengths entered by you"
              : status === "ready"
                ? "GPS required · location not stored"
                : locationStatus}
          </div>
        </div>
        <div className="flex min-h-72 flex-col justify-between bg-primary p-7 text-primary-foreground sm:p-10">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] opacity-80">
              {isSwim ? "Pool lengths" : "Elevation gain"}
            </div>
            <div className="mt-5 flex items-baseline gap-2">
              <span className="stat-num text-7xl font-bold sm:text-8xl">{metricValue}</span>
              {!isSwim && metricValue !== "—" && <span className="stat-num text-3xl">m</span>}
            </div>
            <div className="mt-2 text-sm opacity-85">
              {isSwim
                ? `${session?.poolLengthM ?? poolLengthM} m pool`
                : measurements.elevationGainM === null
                  ? "Awaiting accurate altitude"
                  : "Measured from GPS altitude"}
            </div>
          </div>
          {isSwim ? (
            <div className="mt-12 flex gap-3">
              <button
                type="button"
                onClick={() => void changeLengths(1)}
                disabled={status !== "recording"}
                className="rounded-full bg-primary-foreground px-5 py-3 font-medium text-primary disabled:opacity-40"
              >
                + Length
              </button>
              <button
                type="button"
                onClick={() => void changeLengths(-1)}
                disabled={status !== "recording" || !measurements.poolLengths}
                className="rounded-full border border-primary-foreground/60 px-4 py-3 text-sm disabled:opacity-40"
              >
                Undo
              </button>
            </div>
          ) : (
            <div className="mt-14">
              <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
                <span>Next 10 m of gain</span>
                <span>{Math.floor(progress * 100)}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-primary-foreground/25">
                <div
                  className="h-full rounded-full bg-primary-foreground transition-[width] duration-500"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </section>
      {error && (
        <p
          role="alert"
          className="mt-3 border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 border border-border bg-surface p-3 text-sm">
          {notice}
        </p>
      )}
      {error && session && status !== "recording" && (
        <button
          type="button"
          onClick={() => void persist(session.status).catch(() => undefined)}
          className="mt-2 text-sm underline"
        >
          Retry syncing progress
        </button>
      )}
      {status === "stopped" && (
        <div className="border border-t-0 border-border bg-surface p-6">
          <h2 className="font-display text-lg font-semibold">Finish up</h2>
          <button
            type="button"
            onClick={() => void resume()}
            disabled={busy}
            className="mt-3 text-sm underline disabled:opacity-50"
          >
            Resume recording
          </button>
          <label className="mt-4 block text-sm">
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              placeholder={defaultTitle(activeSport)}
              className="mt-2 h-11 w-full border border-border bg-background px-3"
            />
          </label>
          <label className="mt-4 block text-sm">
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
              rows={3}
              className="mt-2 w-full border border-border bg-background p-3"
            />
          </label>
          {distanceKm <= 0 && (
            <p className="mt-3 text-sm text-destructive">
              Record some distance before saving this activity.
            </p>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || distanceKm <= 0 || elapsed <= 0}
            className="mt-5 inline-flex h-11 items-center gap-2 bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Save activity <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Keep this page open while recording. It pauses when the tab goes into the background and
        saves progress every 10 seconds.
      </p>
    </div>
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

function Control({
  label,
  onClick,
  disabled,
  primary,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid h-14 w-14 place-items-center rounded-full disabled:opacity-40 ${primary ? "bg-primary text-primary-foreground" : destructive ? "bg-destructive text-destructive-foreground" : "bg-surface text-foreground"}`}
    >
      {children}
    </button>
  );
}
