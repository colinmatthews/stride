import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { usePostHog } from "@posthog/react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Flag,
  LineChart,
  Plus,
  Repeat2,
  Sparkles,
  TrendingUp,
  UserRoundPlus,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SportBadge } from "@/components/SportBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { fetchHabitPlan, saveHabitPlan } from "@/lib/api";
import {
  HABIT_DAYS,
  goalFallbackDays,
  habitDayLabel,
  type EncouragementFriend,
  type HabitDayId,
  type HabitRecommendation,
  type HabitWeek,
} from "@/lib/habits";
import { fmtDuration, type Activity } from "@/lib/mock-data";

type FlowMode = "first" | "start" | "review";

export const Route = createFileRoute("/first-activity/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode:
      search.mode === "start" || search.mode === "review"
        ? (search.mode as FlowMode)
        : ("first" as FlowMode),
  }),
  loader: async ({ params }) => {
    const state = await fetchHabitPlan(params.id).catch(() => {
      throw notFound();
    });
    if (!state.sourceActivity || !state.recommendation) throw notFound();
    return state;
  },
  head: () => ({ meta: [{ title: "Build your consistency plan — Stride" }] }),
  component: FirstActivityPlan,
  notFoundComponent: () => (
    <AppShell>
      <div className="py-24 text-center">
        <h1 className="font-display text-2xl font-bold">Activity not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with the account that recorded this activity and try again.
        </p>
        <Link to="/record" className="mt-5 inline-block text-primary">
          Record an activity
        </Link>
      </div>
    </AppShell>
  ),
});

const GOALS = [
  { value: 2, label: "Build gently", hint: "A flexible start for busy weeks" },
  { value: 3, label: "Recommended", hint: "Enough repetition to form a rhythm" },
  { value: 4, label: "Build momentum", hint: "For an established routine" },
] as const;

function FirstActivityPlan() {
  const loaded = Route.useLoaderData();
  const { mode } = Route.useSearch();
  const activity = loaded.sourceActivity as Activity;
  const recommendation = loaded.recommendation as HabitRecommendation;
  const savedPlan = loaded.plan;
  const router = useRouter();
  const posthog = usePostHog();
  const [step, setStep] = useState(mode === "review" && savedPlan ? 1 : 0);
  const [weeklyTarget, setWeeklyTarget] = useState(
    savedPlan?.weeklyTarget ?? recommendation.weeklyTarget,
  );
  const [plannedDays, setPlannedDays] = useState<HabitDayId[]>(
    savedPlan?.plannedDays ?? recommendation.plannedDays,
  );
  const [friendId, setFriendId] = useState<string | null>(savedPlan?.encouragementFriendId ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const stepLabels = [
    "Activity complete",
    recommendation.hasHistory ? "Recent rhythm" : "Weekly goal",
    "Plan days",
    "Four weeks",
  ];
  const plannedDayLabels = useMemo(() => plannedDays.map(habitDayLabel), [plannedDays]);

  function chooseGoal(value: number) {
    setWeeklyTarget(value);
    const nextDays = Array.from(
      new Set([...recommendation.plannedDays, ...goalFallbackDays(value)]),
    ).slice(0, value) as HabitDayId[];
    setPlannedDays(nextDays);
    posthog.capture("consistency_goal_selected", {
      source_activity_id: activity.id,
      weekly_target: value,
      recommended_target: recommendation.weeklyTarget,
    });
  }

  function toggleDay(id: HabitDayId) {
    setPlannedDays((current) => {
      if (current.includes(id)) return current.filter((day) => day !== id);
      if (current.length >= weeklyTarget) return current;
      return [...current, id];
    });
  }

  async function completePlan() {
    setSaving(true);
    setError("");
    try {
      await saveHabitPlan({
        sourceActivityId: activity.id,
        weeklyTarget,
        plannedDays,
        encouragementFriendId: friendId,
      });
      posthog.capture(savedPlan ? "consistency_plan_updated" : "consistency_plan_created", {
        source_activity_id: activity.id,
        weekly_target: weeklyTarget,
        planned_days: plannedDays,
        encouragement_friend_added: Boolean(friendId),
        entry_mode: mode,
      });
      router.navigate({ to: "/habits" });
    } catch (caught) {
      posthog.captureException(caught, { feature: "consistency_plan" });
      setError("We couldn't save your plan. Check your connection and try again.");
      setSaving(false);
    }
  }

  const canContinue = step !== 2 || plannedDays.length === weeklyTarget;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 border-b border-border pb-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Activity complete · Build momentum
              </div>
              <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">
                Turn today’s effort into a rhythm.
              </h1>
            </div>
            <Badge variant="outline" className="hidden gap-1.5 py-1.5 sm:inline-flex">
              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--pr)]" /> Activity complete
            </Badge>
          </div>
        </header>

        <div className="grid gap-7 lg:grid-cols-[220px_1fr]">
          <nav aria-label="Setup progress" className="space-y-1">
            {stepLabels.map((label, index) => {
              const done = index < step;
              const active = index === step;
              return (
                <div
                  key={label}
                  className={`flex items-center gap-3 border-l-2 px-4 py-3 ${
                    active
                      ? "border-primary bg-primary/5 text-foreground"
                      : done
                        ? "border-[var(--pr)] text-foreground"
                        : "border-border text-muted-foreground"
                  }`}
                >
                  <span
                    className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold ${
                      done
                        ? "bg-[var(--pr)] text-white"
                        : active
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                    }`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  <span className="text-sm font-medium">{label}</span>
                </div>
              );
            })}
          </nav>

          <div>
            {step === 0 && <SavedStep activity={activity} />}
            {step === 1 && (
              <GoalStep
                activity={activity}
                weeklyTarget={weeklyTarget}
                chooseGoal={chooseGoal}
                recommendation={recommendation}
              />
            )}
            {step === 2 && (
              <DaysStep
                weeklyTarget={weeklyTarget}
                plannedDays={plannedDays}
                toggleDay={toggleDay}
              />
            )}
            {step === 3 && (
              <ProgressStep
                activity={activity}
                weeklyTarget={weeklyTarget}
                plannedDayLabels={plannedDayLabels}
                baselineWeeks={recommendation.baselineWeeks}
                progress={savedPlan?.progress}
                friendCandidates={loaded.friendCandidates}
                friendId={friendId}
                setFriendId={(id) => {
                  setFriendId(id);
                  posthog.capture("consistency_friend_selected", {
                    source_activity_id: activity.id,
                    friend_added: Boolean(id),
                  });
                }}
              />
            )}

            {error && (
              <div
                role="alert"
                className="mt-4 border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive"
              >
                {error}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
              <Button
                variant="ghost"
                onClick={() => setStep((current) => Math.max(0, current - 1))}
                disabled={step === 0 || saving}
              >
                <ArrowLeft /> Back
              </Button>
              {step < 3 ? (
                <Button
                  size="lg"
                  onClick={() => {
                    if (step === 2) {
                      posthog.capture("consistency_days_selected", {
                        source_activity_id: activity.id,
                        planned_days: plannedDays,
                      });
                    }
                    setStep((current) => current + 1);
                  }}
                  disabled={!canContinue}
                >
                  {step === 0
                    ? "Build my habit"
                    : step === 1
                      ? "Choose my days"
                      : "See my progress"}
                  <ArrowRight />
                </Button>
              ) : (
                <Button size="lg" onClick={completePlan} disabled={saving}>
                  {saving ? "Saving…" : savedPlan ? "Update my plan" : "Save my plan"}
                  {!saving && <ArrowRight />}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function SavedStep({ activity }: { activity: Activity }) {
  return (
    <Card className="overflow-hidden shadow-none">
      <div className="grid md:grid-cols-[1.2fr_0.8fr]">
        <CardContent className="p-7">
          <div className="flex items-center gap-2 text-[var(--pr)]">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-mono text-[10px] uppercase tracking-[0.22em]">
              Activity complete
            </span>
          </div>
          <h2 className="mt-5 font-display text-3xl font-bold tracking-tight">
            Congrats—you showed up.
            <br /> Why not turn that into a habit?
          </h2>
          <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
            One activity feels good. A repeatable rhythm turns today’s effort into lasting fitness,
            confidence, and momentum.
          </p>
          <div className="mt-7 border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--pr)] text-white">
                  <Check className="h-4 w-4" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-semibold">{activity.title}</h3>
                    <SportBadge sport={activity.sport} />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {activity.distanceKm.toFixed(2)} km · {fmtDuration(activity.movingSeconds)}
                  </div>
                </div>
              </div>
              <Link
                to="/activity/$id"
                params={{ id: activity.id }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                View
              </Link>
            </div>
          </div>
        </CardContent>
        <div className="bg-secondary p-7 text-secondary-foreground">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] opacity-60">
            Why build a habit?
          </div>
          <div className="mt-7 space-y-6">
            <Benefit
              icon={Repeat2}
              title="Make showing up easier"
              body="A simple weekly rhythm removes the daily decision."
            />
            <Benefit
              icon={TrendingUp}
              title="See progress compound"
              body="Small, repeated efforts build fitness you can see."
            />
            <Benefit
              icon={LineChart}
              title="Keep momentum visible"
              body="Four weeks gives you a clear, motivating runway."
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

function GoalStep({
  activity,
  weeklyTarget,
  chooseGoal,
  recommendation,
}: {
  activity: Activity;
  weeklyTarget: number;
  chooseGoal: (value: number) => void;
  recommendation: HabitRecommendation;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-7">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-4 w-4" />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em]">
            {recommendation.hasHistory ? "Your recent rhythm" : "Start realistic"}
          </span>
        </div>
        <h2 className="mt-4 font-display text-3xl font-bold tracking-tight">
          {recommendation.hasHistory
            ? "You already have the beginnings of a habit."
            : "How many days feels repeatable?"}
        </h2>
        <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
          {recommendation.hasHistory
            ? `You completed ${recommendation.totalActivities} activities over the previous four weeks. We used that rhythm to suggest a goal you can realistically maintain.`
            : `Your ${activity.sport.toLowerCase()} is the starting point. Pick enough repetition to build momentum without making every week rigid.`}
        </p>
        {recommendation.hasHistory && (
          <HistoryGrid weeks={recommendation.baselineWeeks} title="Previous four weeks" />
        )}
        <div className="mt-7 flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-semibold">Choose your weekly target</h3>
          <span className="text-xs text-muted-foreground">Based on your recent activity</span>
        </div>
        <div className="mt-7 grid gap-3 md:grid-cols-3">
          {GOALS.map((goal) => (
            <button
              key={goal.value}
              type="button"
              onClick={() => chooseGoal(goal.value)}
              aria-pressed={weeklyTarget === goal.value}
              className={`relative border p-5 text-left transition-all ${
                weeklyTarget === goal.value
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-background hover:border-foreground/40"
              }`}
            >
              {goal.value === recommendation.weeklyTarget && (
                <Badge className="absolute right-3 top-3 px-2 py-0.5">Your rhythm</Badge>
              )}
              <div className="stat-num text-4xl font-bold">
                {goal.value}
                <span className="ml-1 text-base text-muted-foreground">×</span>
              </div>
              <div className="mt-5 font-display font-semibold">{goal.label}</div>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">{goal.hint}</p>
            </button>
          ))}
        </div>
        <div className="mt-6 flex items-center gap-3 bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Clock3 className="h-4 w-4 shrink-0 text-foreground" />
          You can change this anytime. Consistency matters more than a perfect number.
        </div>
      </CardContent>
    </Card>
  );
}

function DaysStep({
  weeklyTarget,
  plannedDays,
  toggleDay,
}: {
  weeklyTarget: number;
  plannedDays: HabitDayId[];
  toggleDay: (id: HabitDayId) => void;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-7">
        <div className="flex items-center gap-2 text-primary">
          <CalendarDays className="h-4 w-4" />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em]">
            Make room for it
          </span>
        </div>
        <h2 className="mt-4 font-display text-3xl font-bold tracking-tight">
          Pick your {weeklyTarget} activity days.
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          Think of these as a plan, not a promise. You can move an activity when life changes.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {HABIT_DAYS.map((day) => {
            const selected = plannedDays.includes(day.id);
            return (
              <button
                key={day.id}
                type="button"
                onClick={() => toggleDay(day.id)}
                aria-pressed={selected}
                aria-label={day.label}
                className={`flex min-h-28 flex-col items-center justify-center border transition-all ${
                  selected
                    ? "border-secondary bg-secondary text-secondary-foreground"
                    : "border-border bg-background hover:border-foreground/40"
                }`}
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] opacity-60">
                  {day.short}
                </span>
                <span
                  className={`mt-3 grid h-8 w-8 place-items-center rounded-full ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  {selected ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {plannedDays.length === weeklyTarget
              ? "Your week has a rhythm."
              : `Choose ${weeklyTarget - plannedDays.length} more day${weeklyTarget - plannedDays.length === 1 ? "" : "s"}.`}
          </span>
          <span className="font-medium">
            {plannedDays.length} / {weeklyTarget} selected
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressStep({
  activity,
  weeklyTarget,
  plannedDayLabels,
  baselineWeeks,
  progress,
  friendCandidates,
  friendId,
  setFriendId,
}: {
  activity: Activity;
  weeklyTarget: number;
  plannedDayLabels: string[];
  baselineWeeks: Array<Omit<HabitWeek, "status">>;
  progress?: HabitWeek[];
  friendCandidates: EncouragementFriend[];
  friendId: string | null;
  setFriendId: (id: string | null) => void;
}) {
  const weeks =
    progress ??
    Array.from({ length: 4 }, (_, index) => ({
      label: `Week ${index + 1}`,
      start: "",
      count: index === 0 ? 1 : 0,
      distanceKm: index === 0 ? activity.distanceKm : 0,
      status: index === 0 ? ("in_progress" as const) : ("upcoming" as const),
    }));

  return (
    <Card className="overflow-hidden shadow-none">
      <CardContent className="p-7">
        <div className="flex items-center gap-2 text-primary">
          <Flag className="h-4 w-4" />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em]">
            Your next four weeks
          </span>
        </div>
        <h2 className="mt-4 font-display text-3xl font-bold tracking-tight">
          Keep your rhythm moving forward.
        </h2>
        <p className="mt-3 text-muted-foreground">
          {plannedDayLabels.join(", ")} · {weeklyTarget} activities each week
        </p>
        {baselineWeeks.some((week) => week.count > 0) && (
          <HistoryGrid weeks={baselineWeeks} title="Your recent baseline" compact />
        )}
        <div className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Your four-week plan
            </span>
            <span className="text-xs text-muted-foreground">Every activity counts</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            {weeks.map((week, index) => (
              <div
                key={`${week.label}-${index}`}
                className={`border p-4 ${index === 0 ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {week.label}
                </span>
                <div className="stat-num mt-5 text-3xl font-bold">
                  {week.count}
                  <span className="text-base text-muted-foreground">/{weeklyTarget}</span>
                </div>
                <Progress
                  value={Math.min(100, (week.count / weeklyTarget) * 100)}
                  className="mt-4 h-1.5 rounded-none"
                />
                <div className="mt-3 text-xs capitalize text-muted-foreground">
                  {week.status.replace("_", " ")}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-7 border-t border-border pt-6">
          <div className="flex items-center gap-2 text-primary">
            <UserRoundPlus className="h-4 w-4" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em]">
              Optional encouragement
            </span>
          </div>
          <h3 className="mt-2 font-display text-lg font-semibold">Bring a friend into the plan.</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose someone you follow. They won’t be contacted automatically; you decide when to
            share an update.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFriendId(null)}
              className={`h-11 border px-4 text-sm ${friendId === null ? "border-secondary bg-secondary text-secondary-foreground" : "border-border"}`}
            >
              Just me
            </button>
            {friendCandidates.map((friend) => (
              <button
                key={friend.id}
                type="button"
                onClick={() => setFriendId(friend.id)}
                className={`flex h-11 items-center gap-2 border px-3 text-sm ${friendId === friend.id ? "border-secondary bg-secondary text-secondary-foreground" : "border-border"}`}
              >
                <img src={friend.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                {friend.name}
              </button>
            ))}
          </div>
          {friendCandidates.length === 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Follow an athlete first to add an encouragement partner.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryGrid({
  weeks,
  title,
  compact = false,
}: {
  weeks: Array<Omit<HabitWeek, "status">>;
  title: string;
  compact?: boolean;
}) {
  return (
    <div className="mt-7 border border-border bg-background p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </span>
        <span className="text-xs text-muted-foreground">Observed activity</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {weeks.map((week) => (
          <div key={week.start} className={`border border-border ${compact ? "p-3" : "p-4"}`}>
            <div className="stat-num text-2xl font-bold">{week.count}</div>
            <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
              Week of {week.label}
            </div>
            {!compact && (
              <div className="mt-1 text-xs text-muted-foreground">
                {week.distanceKm.toFixed(1)} km
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Benefit({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Repeat2;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10">
        <Icon className="h-4 w-4 text-primary" />
      </span>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <p className="mt-1 text-xs leading-5 opacity-65">{body}</p>
      </div>
    </div>
  );
}
