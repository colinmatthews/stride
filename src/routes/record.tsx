import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ACTIVITIES, fmtDuration, fmtPace, type Sport } from "@/lib/mock-data";
import { AppShell } from "@/components/AppShell";
import { Play, Pause, Square, MapPin, Activity as ActivityIcon } from "lucide-react";

export const Route = createFileRoute("/record")({
  head: () => ({ meta: [{ title: "Record — Stride" }, { name: "description", content: "Start a new run, ride or swim." }] }),
  component: Record,
});

const SPORTS: Sport[] = ["Run", "Ride", "Swim", "Hike", "Walk"];

function Record() {
  const router = useRouter();
  const [sport, setSport] = useState<Sport>("Run");
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saved, setSaved] = useState(false);
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

  const start = () => { setRunning(true); setPaused(false); };
  const pause = () => setPaused((p) => !p);
  const stop = () => {
    if (ref.current) window.clearInterval(ref.current);
    setRunning(false);
    setPaused(false);
  };
  const save = () => {
    const id = `act-new-${Date.now()}`;
    const pace = sport === "Ride" ? undefined : Math.max(180, Math.floor(elapsed / Math.max(0.1, distance)));
    const speed = sport === "Ride" ? Math.round((distance / (elapsed / 3600)) * 10) / 10 : undefined;
    ACTIVITIES.unshift({
      id,
      athleteId: "me",
      sport,
      title: title || `${sport === "Run" ? "Morning run" : sport === "Ride" ? "Bike ride" : sport}`,
      description: description || undefined,
      date: new Date().toISOString(),
      distanceKm: Math.round(distance * 100) / 100,
      movingSeconds: elapsed,
      elevationM: Math.floor(distance * 12),
      avgHr: 150,
      avgPaceSecPerKm: pace,
      avgSpeedKmh: speed,
      kudos: 0,
      comments: [],
      achievements: 0,
      routeSeed: Math.floor(Math.random() * 1000),
    });
    setSaved(true);
    setTimeout(() => router.navigate({ to: "/activity/$id", params: { id } }), 600);
  };

  const pace = sport === "Ride"
    ? distance > 0 ? `${(distance / (elapsed / 3600 || 1)).toFixed(1)} km/h` : "0.0 km/h"
    : distance > 0 ? fmtPace(elapsed / distance) : "—";

  const idle = !running && elapsed === 0;
  const finished = !running && elapsed > 0;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <p className="text-sm text-muted-foreground">Get out there.</p>
          <h1 className="text-4xl font-display font-bold tracking-tight mt-1">Record activity</h1>
        </div>

        {idle && (
          <div className="bg-surface border border-border rounded-xl p-6 mb-6">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-3">Choose sport</h2>
            <div className="grid grid-cols-5 gap-2">
              {SPORTS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSport(s)}
                  className={`px-3 py-3 rounded-lg border text-sm font-medium transition-colors ${
                    sport === s ? "bg-secondary text-secondary-foreground border-secondary" : "border-border hover:bg-muted"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="bg-secondary text-secondary-foreground rounded-xl p-10 text-center">
          <div className="text-xs uppercase tracking-[0.16em] opacity-70 inline-flex items-center gap-2">
            <ActivityIcon className="h-3 w-3" /> {sport} {running && !paused && <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
          </div>
          <div className="stat-num text-7xl text-primary mt-4">{fmtDuration(elapsed)}</div>
          <div className="grid grid-cols-3 gap-6 mt-8">
            <div>
              <div className="text-[11px] opacity-70 uppercase tracking-wider">Distance</div>
              <div className="stat-num text-2xl mt-1">{distance.toFixed(2)} <span className="text-sm opacity-70 font-body">km</span></div>
            </div>
            <div>
              <div className="text-[11px] opacity-70 uppercase tracking-wider">{sport === "Ride" ? "Speed" : "Pace"}</div>
              <div className="stat-num text-2xl mt-1">{pace}</div>
            </div>
            <div>
              <div className="text-[11px] opacity-70 uppercase tracking-wider">Calories</div>
              <div className="stat-num text-2xl mt-1">{Math.round(elapsed / 60 * 10)}</div>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-center gap-4">
            {!running ? (
              <button
                onClick={start}
                disabled={finished}
                className="h-16 w-16 rounded-full bg-primary text-primary-foreground grid place-items-center hover:scale-105 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play className="h-7 w-7 fill-current" />
              </button>
            ) : (
              <>
                <button onClick={pause} className="h-14 w-14 rounded-full bg-surface text-foreground grid place-items-center">
                  {paused ? <Play className="h-6 w-6 fill-current" /> : <Pause className="h-6 w-6 fill-current" />}
                </button>
                <button onClick={stop} className="h-14 w-14 rounded-full bg-destructive text-destructive-foreground grid place-items-center">
                  <Square className="h-5 w-5 fill-current" />
                </button>
              </>
            )}
          </div>
          <div className="mt-4 text-xs opacity-70 inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" /> GPS simulated
          </div>
        </div>

        {finished && (
          <div className="bg-surface border border-border rounded-xl p-6 mt-6">
            <h2 className="text-base font-display font-semibold mb-4">Save your activity</h2>
            <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`${sport} from ${new Date().toLocaleTimeString()}`}
              className="w-full h-10 px-3 rounded-md bg-surface-2 border border-transparent focus:border-border focus:bg-surface text-sm outline-none"
            />
            <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1 mt-4">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="How did it go?"
              className="w-full px-3 py-2 rounded-md bg-surface-2 border border-transparent focus:border-border focus:bg-surface text-sm outline-none resize-none"
            />
            <div className="flex items-center justify-end gap-3 mt-4">
              <button
                onClick={() => { setElapsed(0); setDistance(0); setTitle(""); setDescription(""); }}
                className="h-10 px-4 rounded-md border border-border text-sm hover:bg-muted"
              >
                Discard
              </button>
              <button onClick={save} className="h-10 px-5 rounded-md bg-primary text-primary-foreground text-sm font-medium">
                {saved ? "Saved →" : "Save activity"}
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
