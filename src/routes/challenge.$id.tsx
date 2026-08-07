import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  CHALLENGES,
  fmtDate,
  getAthlete,
  type ChallengeTracker,
  type ContributionStatus,
} from "@/lib/mock-data";
import { AppShell } from "@/components/AppShell";
import { SportBadge } from "@/components/SportBadge";
import { Stat } from "@/components/Stat";
import { Meter } from "@/components/Meter";
import { ApiError, fetchChallengeTracker, setChallengeActivityStatus } from "@/lib/api";
import { usePostHog } from "@posthog/react";
import {
  ArrowUpRight,
  Calendar,
  Check,
  Clock,
  Gauge,
  Minus,
  Radio,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  X,
} from "lucide-react";

export const Route = createFileRoute("/challenge/$id")({
  loader: ({ params }) => {
    const challenge = CHALLENGES.find((entry) => entry.id === params.id);
    if (!challenge) throw notFound();
    return { challenge };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.challenge.name} — Stride Challenge` },
          {
            name: "description",
            content: `Track your progress toward ${loaderData.challenge.name} and confirm which activities count.`,
          },
        ]
      : [],
  }),
  component: ChallengeTrackerPage,
});

type Board = "overall" | "weekly";

function ChallengeTrackerPage() {
  const { id } = Route.useParams();
  const { challenge } = Route.useLoaderData();
  const posthog = usePostHog();

  const [tracker, setTracker] = useState<ChallengeTracker | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [board, setBoard] = useState<Board>("overall");

  const load = useCallback(async () => {
    try {
      setTracker(await fetchChallengeTracker(id));
      setError("");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not load this challenge");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!tracker) return;

    posthog.capture("challenge_tracker_viewed", {
      challenge_id: tracker.challenge.id,
      challenge_name: tracker.challenge.name,
      pending_count: tracker.progress.pendingActivityCount,
      counted_total: tracker.progress.countedTotal,
    });
    // Fires once per challenge, not on every progress change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracker?.challenge.id]);

  async function decide(activityId: string, status: ContributionStatus | null) {
    setBusyId(activityId);

    try {
      const next = await setChallengeActivityStatus(id, activityId, status);
      setTracker(next);
      setError("");
      posthog.capture(
        status === "counted"
          ? "challenge_activity_counted"
          : status === "dismissed"
            ? "challenge_activity_dismissed"
            : "challenge_activity_restored",
        {
          challenge_id: id,
          activity_id: activityId,
          counted_total: next.progress.countedTotal,
          pending_count: next.progress.pendingActivityCount,
        },
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not update that activity");
    } finally {
      setBusyId(null);
    }
  }

  if (error && !tracker) {
    return (
      <AppShell>
        <div className="border border-border bg-surface p-8 text-sm text-muted-foreground">
          {error}
        </div>
      </AppShell>
    );
  }

  if (!tracker) {
    return (
      <AppShell>
        <div className="space-y-4">
          <div className="h-32 animate-pulse bg-muted" />
          <div className="h-48 animate-pulse bg-muted" />
        </div>
      </AppShell>
    );
  }

  const { challenge: meta, progress, pace, pending, counted, leaderboard } = tracker;
  const unit = meta.unit;
  const ranked =
    board === "overall"
      ? leaderboard
      : [...leaderboard].sort((a, b) => a.weeklyRank - b.weeklyRank);
  const topTotal = Math.max(...leaderboard.map((row) => row.total), 1);
  const myRow = leaderboard.find((row) => row.athleteId === "me");

  return (
    <AppShell>
      <div className="mb-8 border-b border-border pb-8">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          {meta.closed ? "Challenge closed" : "Live challenge"}
        </div>
        <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-[-0.02em]">
          {meta.name}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {meta.closed
              ? "Ended"
              : `${meta.daysLeft} ${meta.daysLeft === 1 ? "day" : "days"} left`}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {meta.participants.toLocaleString()} athletes
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {fmtDate(meta.startsAt)} – {fmtDate(meta.endsAt)}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-6 border border-primary/40 bg-primary/5 p-4 text-sm text-foreground">
          {error}
        </div>
      )}

      {/* Progress hero */}
      <section className="relative overflow-hidden bg-secondary p-8 text-secondary-foreground">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/60">
            <Trophy className="h-3.5 w-3.5 text-primary" /> Your progress
          </div>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="stat-num font-display text-[5rem] font-bold leading-none tracking-[-0.04em] text-primary">
              {progress.countedTotal.toFixed(1)}
            </span>
            <span className="stat-num text-2xl font-semibold text-secondary-foreground/70">
              / {meta.goal} {unit}
            </span>
          </div>

          <Meter
            value={progress.percentComplete}
            className="mt-6 h-2"
            trackClassName="bg-secondary-foreground/15"
            barClassName="bg-primary duration-500"
          />

          <div className="mt-3 flex flex-wrap justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/60">
            <span>{Math.round(progress.percentComplete)}% complete</span>
            <span>
              {progress.remaining} {unit} remaining
            </span>
          </div>
          {progress.pendingTotal > 0 && (
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
              +{progress.pendingTotal} {unit} pending confirmation
            </div>
          )}
        </div>
      </section>

      {/* Stat tiles */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="border border-border bg-surface p-5">
          <Stat
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Days left"
            value={meta.daysLeft}
            caption={meta.closed ? "challenge ended" : `ends ${fmtDate(meta.endsAt)}`}
          />
        </div>
        <div className="border border-border bg-surface p-5">
          <Stat
            icon={<Gauge className="h-3.5 w-3.5" />}
            label="Daily target"
            value={pace.dailyTarget}
            unit={unit}
            caption={meta.closed ? "no time remaining" : "to finish on time"}
          />
        </div>
        <div className="border border-border bg-surface p-5">
          <Stat
            icon={<Trophy className="h-3.5 w-3.5" />}
            label="To confirm"
            value={progress.pendingActivityCount}
            caption={`${progress.pendingTotal} ${unit} waiting`}
            emphasis={progress.pendingActivityCount > 0}
          />
        </div>
      </div>

      {/* Pending confirmation */}
      <section className="mt-6 border border-border bg-surface">
        <div className="border-b border-border p-6">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Needs your confirmation
            </h2>
            {pending.length > 0 && (
              <span className="stat-num inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground">
                {pending.length}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {meta.sport} activities inside the challenge window. Count the ones that belong.
          </p>
        </div>

        {pending.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            Nothing waiting. Every qualifying activity has a decision.
          </p>
        ) : (
          <ul>
            {pending.map((activity) => (
              <li
                key={activity.id}
                className="flex items-center gap-4 border-b border-border p-4 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{activity.title}</span>
                    <SportBadge sport={activity.sport} />
                  </div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {fmtDate(activity.date)}
                  </div>
                </div>
                <div className="stat-num shrink-0 text-xl font-semibold">
                  {metricOf(activity, meta.metricType)}
                  <span className="ml-1 text-xs text-muted-foreground">{unit}</span>
                </div>
                <button
                  onClick={() => decide(activity.id, "counted")}
                  disabled={busyId === activity.id || meta.closed}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" /> Count it
                </button>
                <button
                  onClick={() => decide(activity.id, "dismissed")}
                  disabled={busyId === activity.id || meta.closed}
                  aria-label={`Dismiss ${activity.title}`}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Counted */}
      <section className="mt-6 border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border p-6">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Counted toward challenge
          </h2>
          <span className="stat-num text-sm font-semibold text-primary">
            {progress.countedTotal} {unit} · {counted.length}{" "}
            {counted.length === 1 ? "activity" : "activities"}
          </span>
        </div>

        {counted.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            Nothing counted yet. Confirm an activity above to start your total.
          </p>
        ) : (
          <ul>
            {counted.map((activity) => (
              <li
                key={activity.id}
                className="flex items-center gap-4 border-b border-border p-4 last:border-b-0"
              >
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{activity.title}</div>
                  <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {fmtDate(activity.date)}
                  </div>
                </div>
                <div className="stat-num shrink-0 text-sm font-semibold">
                  {metricOf(activity, meta.metricType)} {unit}
                </div>
                <button
                  onClick={() => decide(activity.id, null)}
                  disabled={busyId === activity.id || meta.closed}
                  className="shrink-0 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Leaderboard */}
      <section className="mt-6 border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="inline-flex items-center gap-2 font-display text-xl font-semibold tracking-tight">
            <Trophy className="h-4 w-4 text-primary" /> Leaderboard
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex border border-border">
              {(["overall", "weekly"] as Board[]).map((option) => (
                <button
                  key={option}
                  onClick={() => setBoard(option)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    board === option
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option === "overall" ? "Overall" : "Last 7 days"}
                </button>
              ))}
            </div>
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
              <Radio className="h-3 w-3" /> Live
            </span>
          </div>
        </div>

        {myRow && (
          <div className="mt-5 border border-border bg-muted/40 p-4">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              <RankTrend delta={myRow.rankDelta} />
              {myRow.rankDelta > 0
                ? "Gaining ground"
                : myRow.rankDelta < 0
                  ? "Losing ground"
                  : "Holding position"}
            </div>
            <p className="mt-1.5 text-sm">
              #{myRow.rank} overall · #{myRow.weeklyRank} in the last 7 days ({myRow.weeklyTotal}{" "}
              {unit})
            </p>
          </div>
        )}

        <ul className="mt-5 space-y-1">
          {ranked.map((row) => {
            const isMe = row.athleteId === "me";
            const athlete = getAthlete(row.athleteId);
            const value = board === "overall" ? row.total : row.weeklyTotal;

            return (
              <li
                key={row.athleteId}
                className={`flex items-center gap-4 p-3 ${isMe ? "bg-primary/5 ring-1 ring-primary/30" : ""}`}
              >
                <span className="stat-num w-6 shrink-0 text-sm text-muted-foreground">
                  {board === "overall" ? row.rank : row.weeklyRank}
                </span>
                {athlete.avatar ? (
                  <img
                    src={athlete.avatar}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {(athlete.name || "You").charAt(0)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{isMe ? "You" : athlete.name}</div>
                  <Meter
                    value={(value / topTotal) * 100}
                    className="mt-1.5 h-1"
                    barClassName={isMe ? "bg-primary" : "bg-muted-foreground/40"}
                  />
                </div>
                <span className="inline-flex shrink-0 items-center gap-1">
                  <RankTrend delta={row.rankDelta} />
                </span>
                <span className="stat-num shrink-0 text-lg font-semibold">
                  {value}
                  <span className="ml-1 text-xs text-muted-foreground">{unit}</span>
                </span>
              </li>
            );
          })}
        </ul>

        <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
          Total {unit} since the challenge opened on {fmtDate(meta.startsAt)}. Arrows show each
          athlete&rsquo;s 7-day rank against their overall rank. Your total counts only the
          activities you have confirmed.
        </p>
      </section>

      {/* Pace */}
      <section
        className={`mt-6 border p-6 ${pace.onPace ? "border-primary/40 bg-primary/5" : "border-border bg-surface"}`}
      >
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
          <ArrowUpRight className="h-3.5 w-3.5" />
          {meta.closed ? "Final" : pace.onPace ? "On pace" : "Behind pace"}
        </div>
        <p className="mt-2 text-sm leading-relaxed">
          Averaging{" "}
          <span className="font-semibold text-primary">
            {pace.averagePerDay} {unit}/day
          </span>{" "}
          over {pace.daysElapsed} {pace.daysElapsed === 1 ? "day" : "days"}
          {meta.closed ? (
            <>. This challenge has closed.</>
          ) : (
            <>
              {" "}
              — you need{" "}
              <span className="font-semibold">
                {pace.dailyTarget} {unit}/day
              </span>{" "}
              to reach {meta.goal} {unit}
            </>
          )}
          {progress.pendingActivityCount > 0 && (
            <>
              , with{" "}
              <span className="font-semibold text-primary">
                {progress.pendingActivityCount}{" "}
                {progress.pendingActivityCount === 1 ? "activity" : "activities"}
              </span>{" "}
              still waiting to be counted
            </>
          )}
          .
        </p>
      </section>

      <div className="mt-8">
        <Link
          to="/challenges"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← All challenges
        </Link>
      </div>
    </AppShell>
  );
}

function metricOf(
  activity: { distanceKm: number; elevationM: number },
  metricType: "distance_km" | "elevation_m",
) {
  return metricType === "elevation_m" ? activity.elevationM : activity.distanceKm;
}

function RankTrend({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-600">
        <TrendingUp className="h-3 w-3" />
        {delta}
      </span>
    );
  }

  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-primary">
        <TrendingDown className="h-3 w-3" />
        {Math.abs(delta)}
      </span>
    );
  }

  return <Minus className="h-3 w-3 text-muted-foreground" />;
}
