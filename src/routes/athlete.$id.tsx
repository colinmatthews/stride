import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ACTIVITIES, ATHLETES, fmtDate, fmtDuration, getAthlete, weeklyStats } from "@/lib/mock-data";
import { AppShell } from "@/components/AppShell";
import { ActivityCard } from "@/components/ActivityCard";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { MapPin, Trophy, UserPlus, Check } from "lucide-react";
import { SportBadge } from "@/components/SportBadge";

export const Route = createFileRoute("/athlete/$id")({
  loader: ({ params }) => {
    const athlete = ATHLETES.find((a) => a.id === params.id);
    if (!athlete) throw notFound();
    return { athlete };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.athlete.name} — Stride` },
          { name: "description", content: loaderData.athlete.bio },
        ]
      : [],
  }),
  component: AthletePage,
});

function AthletePage() {
  const { athlete } = Route.useLoaderData();
  const [following, setFollowing] = useState(athlete.id !== "me");
  const acts = ACTIVITIES.filter((a) => a.athleteId === athlete.id);
  const weeks = weeklyStats(athlete.id);
  const totalKm = acts.reduce((s, a) => s + a.distanceKm, 0);
  const totalTime = acts.reduce((s, a) => s + a.movingSeconds, 0);
  const totalElev = acts.reduce((s, a) => s + a.elevationM, 0);

  const isMe = athlete.id === "me";

  return (
    <AppShell>
      {/* Cover */}
      <div className="rounded-xl overflow-hidden bg-secondary text-secondary-foreground -mx-2">
        <div className="relative h-48 gradient-orange" />
        <div className="px-8 pb-8 -mt-16 flex items-end gap-6">
          <img
            src={athlete.avatar}
            alt={athlete.name}
            className="h-32 w-32 rounded-full object-cover border-4 border-secondary"
          />
          <div className="flex-1 pb-2">
            <h1 className="text-3xl font-display font-bold tracking-tight">{athlete.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm opacity-80">
              <span>@{athlete.handle}</span>
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {athlete.city}, {athlete.country}</span>
            </div>
          </div>
          {!isMe ? (
            <button
              onClick={() => setFollowing((f) => !f)}
              className={`h-10 px-4 rounded-md text-sm font-medium inline-flex items-center gap-2 ${
                following ? "bg-surface text-foreground" : "bg-primary text-primary-foreground"
              }`}
            >
              {following ? <><Check className="h-4 w-4" /> Following</> : <><UserPlus className="h-4 w-4" /> Follow</>}
            </button>
          ) : (
            <Link to="/record" className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-2">
              Record activity
            </Link>
          )}
        </div>
      </div>

      <p className="text-muted-foreground mt-6 max-w-2xl">{athlete.bio}</p>

      {/* Quick stats */}
      <div className="grid grid-cols-5 gap-4 mt-8">
        <BigStat label="Followers" value={athlete.followers.toLocaleString()} />
        <BigStat label="Following" value={athlete.following.toLocaleString()} />
        <BigStat label="Activities" value={acts.length} />
        <BigStat label="Distance" value={`${totalKm.toFixed(0)} km`} />
        <BigStat label="Elevation" value={`${totalElev.toLocaleString()} m`} />
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-8 mt-10">
        <div className="min-w-0">
          {/* Weekly chart */}
          <section className="bg-surface rounded-xl border border-border p-5 mb-8">
            <h2 className="text-base font-display font-semibold mb-4">Last 8 weeks</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeks}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="km" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <h2 className="text-lg font-display font-semibold mb-4">Recent activities</h2>
          <div className="space-y-5">
            {acts.length === 0 && (
              <div className="text-muted-foreground bg-surface border border-border rounded-xl p-8 text-center">
                No activities yet.
              </div>
            )}
            {acts.map((a) => (
              <ActivityCard key={a.id} activity={a} />
            ))}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="bg-surface rounded-xl border border-border p-5">
            <h3 className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-3">All-time totals</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between"><span className="text-muted-foreground">Time</span><span className="font-mono">{fmtDuration(totalTime)}</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Distance</span><span className="font-mono">{totalKm.toFixed(1)} km</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Elevation</span><span className="font-mono">{totalElev.toLocaleString()} m</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Activities</span><span className="font-mono">{acts.length}</span></li>
            </ul>
          </div>
          <div className="bg-surface rounded-xl border border-border p-5">
            <h3 className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-3 flex items-center gap-2">
              <Trophy className="h-3.5 w-3.5 text-primary" /> Trophy case
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {["🥇", "🏔️", "🏃", "💯", "🔥", "⚡"].map((e, i) => (
                <div key={i} className="aspect-square rounded-lg bg-surface-2 grid place-items-center text-2xl">{e}</div>
              ))}
            </div>
          </div>
          <div className="bg-surface rounded-xl border border-border p-5">
            <h3 className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-3">Latest sport</h3>
            <div className="flex items-center gap-2 text-sm">
              {acts[0] ? (
                <>
                  <SportBadge sport={acts[0].sport} />
                  <span className="text-muted-foreground">on {fmtDate(acts[0].date)}</span>
                </>
              ) : (
                <span className="text-muted-foreground">No activities yet</span>
              )}
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function BigStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="stat-num text-2xl mt-1">{value}</div>
    </div>
  );
}
