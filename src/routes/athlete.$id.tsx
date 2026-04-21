import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import {
  ACTIVITIES,
  ATHLETES,
  fmtDate,
  fmtDuration,
  getAthlete,
  weeklyStats,
} from "@/lib/mock-data";
import { AppShell } from "@/components/AppShell";
import { ActivityCard } from "@/components/ActivityCard";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { MapPin, Trophy, UserPlus, Check } from "lucide-react";
import { SportBadge } from "@/components/SportBadge";
import { toggleAthleteFollow } from "@/lib/api";

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
  const { athlete } = Route.useLoaderData() as { athlete: import("@/lib/mock-data").Athlete };
  const [following, setFollowing] = useState(Boolean(athlete.isFollowing));
  const [followers, setFollowers] = useState(athlete.followers);
  const acts = ACTIVITIES.filter((a) => a.athleteId === athlete.id);
  const weeks = weeklyStats(athlete.id);
  const totalKm = acts.reduce((s, a) => s + a.distanceKm, 0);
  const totalTime = acts.reduce((s, a) => s + a.movingSeconds, 0);
  const totalElev = acts.reduce((s, a) => s + a.elevationM, 0);

  const isMe = athlete.id === "me";

  return (
    <AppShell>
      {/* Header */}
      <div className="border-b border-border pb-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Athlete profile
        </div>
        <div className="mt-4 flex items-start gap-6">
          <img
            src={athlete.avatar}
            alt={athlete.name}
            className="h-24 w-24 shrink-0 rounded-full object-cover ring-1 ring-border"
          />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-4xl font-bold leading-tight tracking-[-0.02em]">
              {athlete.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>@{athlete.handle}</span>
              <span className="text-border">·</span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> {athlete.city}, {athlete.country}
              </span>
            </div>
            {athlete.bio && (
              <p className="mt-4 max-w-2xl text-sm leading-6 text-foreground/80">{athlete.bio}</p>
            )}
          </div>
          <div className="shrink-0">
            {!isMe ? (
              <button
                onClick={async () => {
                  const result = await toggleAthleteFollow(athlete.id);
                  setFollowing(result.following);
                  setFollowers(result.followers);
                }}
                className={`inline-flex h-10 items-center gap-2 px-4 text-sm font-medium transition-colors ${
                  following
                    ? "border border-border bg-surface text-foreground hover:bg-muted"
                    : "bg-primary text-primary-foreground hover:opacity-95"
                }`}
              >
                {following ? (
                  <>
                    <Check className="h-4 w-4" /> Following
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" /> Follow
                  </>
                )}
              </button>
            ) : (
              <Link
                to="/record"
                className="inline-flex h-10 items-center gap-2 bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-95"
              >
                Record activity
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="mt-8 grid grid-cols-5 border border-border">
        <BigStat label="Followers" value={followers.toLocaleString()} />
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
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
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
            <h3 className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-3">
              All-time totals
            </h3>
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between">
                <span className="text-muted-foreground">Time</span>
                <span className="font-mono">{fmtDuration(totalTime)}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-muted-foreground">Distance</span>
                <span className="font-mono">{totalKm.toFixed(1)} km</span>
              </li>
              <li className="flex justify-between">
                <span className="text-muted-foreground">Elevation</span>
                <span className="font-mono">{totalElev.toLocaleString()} m</span>
              </li>
              <li className="flex justify-between">
                <span className="text-muted-foreground">Activities</span>
                <span className="font-mono">{acts.length}</span>
              </li>
            </ul>
          </div>
          <div className="bg-surface rounded-xl border border-border p-5">
            <h3 className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-3 flex items-center gap-2">
              <Trophy className="h-3.5 w-3.5 text-primary" /> Trophy case
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {["🥇", "🏔️", "🏃", "💯", "🔥", "⚡"].map((e, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-lg bg-surface-2 grid place-items-center text-2xl"
                >
                  {e}
                </div>
              ))}
            </div>
          </div>
          <div className="bg-surface rounded-xl border border-border p-5">
            <h3 className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-3">
              Latest sport
            </h3>
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
    <div className="bg-surface p-4 [&:not(:last-child)]:border-r [&:not(:last-child)]:border-border">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
      <div className="stat-num mt-2 text-2xl font-bold tracking-tight">{value}</div>
    </div>
  );
}
