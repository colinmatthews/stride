import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { usePostHog } from "@posthog/react";
import { ATHLETES, type Activity, fmtDate, fmtDuration } from "@/lib/mock-data";
import { AppShell } from "@/components/AppShell";
import { ActivityCard } from "@/components/ActivityCard";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { MapPin, Trophy, UserPlus, Check, ChevronDown, Lock } from "lucide-react";
import { SportBadge } from "@/components/SportBadge";
import { fetchActivities, toggleAthleteFollow } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { getTierProgress, TIERS } from "@/lib/tiers";

export const Route = createFileRoute("/athlete/$id")({
  loader: async ({ params }) => {
    const athlete = ATHLETES.find((a) => a.id === params.id);
    if (!athlete) throw notFound();
    const activityPage = await fetchActivities({ athleteId: params.id, limit: 50 });
    // totalCount is only computed server-side on the first (no-cursor) page,
    // so it's always present here. Falling back to the loaded page length
    // just guards against a malformed response rather than crashing the page.
    const totalCount = activityPage.totalCount ?? activityPage.activities.length;
    return {
      athlete,
      activities: activityPage.activities,
      nextCursor: activityPage.nextCursor,
      totalActivityCount: totalCount,
    };
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
  const {
    athlete,
    activities: initialActivities,
    nextCursor: initialNextCursor,
    totalActivityCount,
  } = Route.useLoaderData() as {
    athlete: import("@/lib/mock-data").Athlete;
    activities: Activity[];
    nextCursor?: string;
    totalActivityCount: number;
  };
  const posthog = usePostHog();
  const [following, setFollowing] = useState(Boolean(athlete.isFollowing));
  const [followers, setFollowers] = useState(athlete.followers);
  const [activities, setActivities] = useState(initialActivities);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const acts = activities;
  const weeks = weeklyStatsForActivities(activities);
  const totalKm = acts.reduce((s, a) => s + a.distanceKm, 0);
  const totalTime = acts.reduce((s, a) => s + a.movingSeconds, 0);
  const totalElev = acts.reduce((s, a) => s + a.elevationM, 0);

  // totalActivityCount is the athlete's real total from the DB, not
  // acts.length (the loaded/paginated subset) — using acts.length here would
  // under-report the tier for anyone with more activities than one page, and
  // make it jump every time "Load more" is clicked.
  const {
    current: currentTier,
    next: nextTier,
    progressPct: tierProgressPct,
    currentIdx: tierIdx,
  } = getTierProgress(totalActivityCount);

  const trackedTierRef = useRef<string | null>(null);
  useEffect(() => {
    if (trackedTierRef.current === currentTier.name) return;
    trackedTierRef.current = currentTier.name;
    posthog.capture("tier_viewed", {
      athlete_id: athlete.id,
      tier_name: currentTier.name,
      activity_count: totalActivityCount,
    });
  }, [athlete.id, currentTier.name, posthog, totalActivityCount]);

  const isMe = athlete.id === "me";
  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchActivities({ athleteId: athlete.id, cursor: nextCursor, limit: 50 });
      setActivities((current) => [...current, ...page.activities]);
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

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
                  posthog.capture(result.following ? "athlete_followed" : "athlete_unfollowed", {
                    athlete_id: athlete.id,
                    athlete_name: athlete.name,
                  });
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
        <BigStat label="Activities" value={totalActivityCount} />
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
            {nextCursor && (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              </div>
            )}
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
            <h3 className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <Trophy className="h-3.5 w-3.5 text-primary" /> Training tier
            </h3>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-2xl">{currentTier.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{currentTier.name}</div>
                {nextTier && (
                  <div className="text-xs text-muted-foreground">
                    {Math.max(0, nextTier.min - totalActivityCount)} to {nextTier.name}
                  </div>
                )}
              </div>
            </div>
            {nextTier && <ProgressBar pct={tierProgressPct} />}
            <div className="mt-4">
              <TierLadder
                currentIdx={tierIdx}
                count={totalActivityCount}
                onExpand={(tierName) =>
                  posthog.capture("tier_row_expanded", {
                    athlete_id: athlete.id,
                    tier_name: tierName,
                    activity_count: totalActivityCount,
                  })
                }
              />
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

function weeklyStatsForActivities(activities: Activity[]) {
  const weeks: { label: string; km: number; time: number; elev: number }[] = [];
  const now = new Date();

  for (let index = 7; index >= 0; index -= 1) {
    const start = new Date(now);
    start.setDate(now.getDate() - index * 7 - 6);
    const end = new Date(now);
    end.setDate(now.getDate() - index * 7);

    const weekActivities = activities.filter((activity) => {
      const date = new Date(activity.date);
      return date >= start && date <= end;
    });

    weeks.push({
      label: `W${8 - index}`,
      km:
        Math.round(weekActivities.reduce((sum, activity) => sum + activity.distanceKm, 0) * 10) /
        10,
      time: weekActivities.reduce((sum, activity) => sum + activity.movingSeconds, 0),
      elev: weekActivities.reduce((sum, activity) => sum + activity.elevationM, 0),
    });
  }

  return weeks;
}

function TierLadder({
  currentIdx,
  count,
  onExpand,
}: {
  currentIdx: number;
  count: number;
  onExpand?: (tierName: string) => void;
}) {
  const [openIdx, setOpenIdx] = useState<number>(currentIdx);

  return (
    <ul className="space-y-2">
      {TIERS.map((tier, i) => {
        const unlocked = i <= currentIdx;
        const isOpen = openIdx === i;
        const next = TIERS[i + 1];
        return (
          <li key={tier.name}>
            <button
              onClick={() => {
                const opening = !isOpen;
                setOpenIdx(opening ? i : -1);
                if (opening) onExpand?.(tier.name);
              }}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                unlocked
                  ? "border-[color:var(--pr)]/30 bg-[color:var(--pr)]/6"
                  : "border-border bg-surface-2 opacity-70"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {unlocked ? tier.icon : <Lock className="h-4 w-4 text-muted-foreground" />}
                </span>
                <span className="flex-1 truncate text-sm font-semibold">{tier.name}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </div>
              {i === currentIdx && (
                <Badge className="mt-2 bg-[color:var(--pr)]/15 text-[color:var(--pr)] hover:bg-[color:var(--pr)]/15">
                  Current
                </Badge>
              )}
              {isOpen && (
                <div className="mt-2 text-xs text-muted-foreground">
                  <p>{tier.blurb}</p>
                  {unlocked ? (
                    i === currentIdx && next ? (
                      <p className="mt-1.5 font-medium text-foreground">
                        {count}/{next.min} activities logged · {Math.max(0, next.min - count)} more
                        to reach {next.name}
                      </p>
                    ) : (
                      <p className="mt-1.5 font-medium text-[color:var(--pr)]">Unlocked</p>
                    )
                  ) : (
                    <p className="mt-1.5 font-medium text-foreground">
                      Requires {tier.min}+ logged activities
                    </p>
                  )}
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div className="h-full bg-[color:var(--pr)]" style={{ width: `${pct}%` }} />
    </div>
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
