import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ACTIVITIES, ATHLETES, CHALLENGES, ME, fmtDuration, getAthlete } from "@/lib/mock-data";
import { AppShell } from "@/components/AppShell";
import { ActivityCard } from "@/components/ActivityCard";
import { Trophy, TrendingUp, Users, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Feed — Stride" },
      { name: "description", content: "Your personalized feed of athlete activities, kudos, and achievements." },
    ],
  }),
  component: Index,
});

const FILTERS = ["Following", "Clubs", "You"] as const;
type Filter = (typeof FILTERS)[number];

function Index() {
  const [filter, setFilter] = useState<Filter>("Following");
  const visible = useMemo(() => {
    if (filter === "You") return ACTIVITIES.filter((a) => a.athleteId === "me");
    if (filter === "Clubs") return ACTIVITIES.filter((a) => a.athleteId !== "me").slice(0, 8);
    return ACTIVITIES.filter((a) => a.athleteId !== "me" || Math.random() > 0.5).slice(0, 20);
  }, [filter]);

  const myWeekKm = ACTIVITIES.filter((a) => a.athleteId === "me").slice(0, 5).reduce((s, a) => s + a.distanceKm, 0);
  const myWeekTime = ACTIVITIES.filter((a) => a.athleteId === "me").slice(0, 5).reduce((s, a) => s + a.movingSeconds, 0);
  const myWeekElev = ACTIVITIES.filter((a) => a.athleteId === "me").slice(0, 5).reduce((s, a) => s + a.elevationM, 0);

  const suggested = ATHLETES.filter((a) => a.id !== "me").slice(0, 4);
  const myChallenges = CHALLENGES.filter((c) => c.joined);

  return (
    <AppShell>
      <div className="grid grid-cols-[1fr_320px] gap-8">
        {/* Main column */}
        <div className="min-w-0">
          <div className="flex items-end justify-between mb-6">
            <div>
              <p className="text-sm text-muted-foreground">Welcome back, {ME.name.split(" ")[0]}</p>
              <h1 className="text-3xl font-display font-bold tracking-tight mt-1">Your feed</h1>
            </div>
            <div className="flex gap-1 bg-surface-2 rounded-md p-1">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-sm rounded transition-colors ${
                    filter === f ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            {visible.map((a) => (
              <ActivityCard key={a.id} activity={a} />
            ))}
          </div>
        </div>

        {/* Right column */}
        <aside className="space-y-6">
          <section className="bg-secondary text-secondary-foreground rounded-xl p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] opacity-70">
              <TrendingUp className="h-3.5 w-3.5" /> Your week
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div>
                <div className="stat-num text-2xl text-primary">{myWeekKm.toFixed(0)}</div>
                <div className="text-[11px] opacity-70 uppercase tracking-wider">km</div>
              </div>
              <div>
                <div className="stat-num text-2xl">{fmtDuration(myWeekTime).split(":")[0]}h</div>
                <div className="text-[11px] opacity-70 uppercase tracking-wider">time</div>
              </div>
              <div>
                <div className="stat-num text-2xl">{myWeekElev.toLocaleString()}</div>
                <div className="text-[11px] opacity-70 uppercase tracking-wider">m elev</div>
              </div>
            </div>
            <Link to="/training" className="mt-4 inline-flex items-center gap-1 text-xs opacity-80 hover:opacity-100">
              See training log <ChevronRight className="h-3 w-3" />
            </Link>
          </section>

          <section className="bg-surface rounded-xl border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" /> Your challenges
              </h3>
              <Link to="/challenges" className="text-xs text-muted-foreground hover:text-foreground">View all</Link>
            </div>
            <ul className="space-y-3">
              {myChallenges.map((c) => {
                const pct = Math.min(100, (c.myProgressKm / c.goalKm) * 100);
                return (
                  <li key={c.id}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium truncate">{c.badge} {c.name}</span>
                      <span className="text-xs text-muted-foreground num">{Math.round(pct)}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="bg-surface rounded-xl border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Suggested athletes
              </h3>
            </div>
            <ul className="space-y-3">
              {suggested.map((a) => (
                <li key={a.id} className="flex items-center gap-3">
                  <Link to="/athlete/$id" params={{ id: a.id }} className="shrink-0">
                    <img src={a.avatar} alt={a.name} className="h-9 w-9 rounded-full object-cover" />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link to="/athlete/$id" params={{ id: a.id }} className="text-sm font-medium hover:underline truncate block">
                      {a.name}
                    </Link>
                    <div className="text-xs text-muted-foreground truncate">{a.city} · {a.followers} followers</div>
                  </div>
                  <FollowButton id={a.id} />
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}

function FollowButton({ id }: { id: string }) {
  const [following, setFollowing] = useState(false);
  void getAthlete(id);
  return (
    <button
      onClick={() => setFollowing((f) => !f)}
      className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
        following ? "bg-secondary text-secondary-foreground border-secondary" : "border-border hover:bg-muted"
      }`}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
