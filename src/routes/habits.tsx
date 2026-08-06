import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { usePostHog } from "@posthog/react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleCheck,
  RefreshCcw,
  Share2,
  Target,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Progress } from "@/components/ui/progress";
import { fetchHabitPlan, scheduleHabitRecovery } from "@/lib/api";
import { habitDayLabel, type HabitDayId, type HabitPlanState } from "@/lib/habits";
import { fmtDate } from "@/lib/mock-data";

export const Route = createFileRoute("/habits")({
  loader: () => fetchHabitPlan(),
  head: () => ({
    meta: [
      { title: "Habits — Stride" },
      { name: "description", content: "Build and track a consistent activity habit." },
    ],
  }),
  component: HabitsPage,
});

function HabitsPage() {
  const loaded = Route.useLoaderData();
  const [state, setState] = useState<HabitPlanState>(loaded);
  const [busyDay, setBusyDay] = useState<HabitDayId | null>(null);
  const [error, setError] = useState("");
  const [shared, setShared] = useState(false);
  const posthog = usePostHog();
  const plan = state.plan;

  if (!plan) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl py-12 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
            <Target className="h-6 w-6" />
          </div>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Your habits
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">
            Build consistency from what you already do.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
            Start from an activity and Stride will suggest a realistic weekly rhythm from your
            recent training.
          </p>
          {state.sourceActivity ? (
            <Link
              to="/first-activity/$id"
              params={{ id: state.sourceActivity.id }}
              search={{ mode: "start" }}
              className="mt-7 inline-flex h-11 items-center gap-2 bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-95"
            >
              Create a plan from your latest activity <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <Link
              to="/record"
              className="mt-7 inline-flex h-11 items-center gap-2 bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-95"
            >
              Record your first activity <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </AppShell>
    );
  }

  const activeWeek =
    plan.progress.find((week) => week.status === "in_progress") ??
    plan.progress.find((week) => week.status === "complete") ??
    plan.progress[0];
  const completed = activeWeek?.count ?? 0;
  const remaining = Math.max(0, plan.weeklyTarget - completed);

  async function recoverOn(day: HabitDayId) {
    setBusyDay(day);
    setError("");
    try {
      const next = await scheduleHabitRecovery(day);
      setState(next);
      posthog.capture("consistency_missed_day_rescheduled", {
        missed_day: plan.recovery?.missedDay,
        recovery_day: day,
        weekly_target: plan.weeklyTarget,
      });
    } catch (caught) {
      posthog.captureException(caught, { feature: "consistency_recovery" });
      setError("That day is no longer available. Refresh and choose another day.");
    } finally {
      setBusyDay(null);
    }
  }

  async function shareUpdate() {
    const text = `${completed} of ${plan.weeklyTarget} activities complete this week on Stride. ${remaining === 0 ? "Goal met." : `${remaining} to go.`}`;
    try {
      if (navigator.share) await navigator.share({ title: "My Stride consistency", text });
      else await navigator.clipboard.writeText(text);
      setShared(true);
      posthog.capture("consistency_progress_shared", {
        weekly_target: plan.weeklyTarget,
        completed,
        encouragement_friend_id: plan.friend?.id,
      });
    } catch {
      // Closing a native share sheet leaves the plan unchanged.
    }
  }

  return (
    <AppShell>
      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Your habits
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
            Weekly consistency
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Every activity counts, including the ones that happen off-plan.
          </p>
        </div>
        <Link
          to="/first-activity/$id"
          params={{ id: plan.sourceActivityId }}
          search={{ mode: "review" }}
          className="inline-flex h-10 items-center justify-center gap-2 border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
        >
          Edit plan <CalendarDays className="h-4 w-4 text-primary" />
        </Link>
      </div>

      <section className="overflow-hidden rounded-xl border border-primary/30 bg-surface">
        <div className="grid lg:grid-cols-[1fr_300px]">
          <div className="p-7">
            <div className="flex items-center gap-2 text-primary">
              <Target className="h-4 w-4" />
              <span className="font-mono text-[10px] uppercase tracking-[0.22em]">Active plan</span>
            </div>
            <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-display text-3xl font-bold">
                  {plan.weeklyTarget} activities each week
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Planned for {plan.plannedDays.map(habitDayLabel).join(", ")}
                </p>
              </div>
              <div className="sm:text-right">
                <div className="stat-num text-4xl font-bold">
                  {completed}
                  <span className="text-lg text-muted-foreground">/{plan.weeklyTarget}</span>
                </div>
                <div className="text-xs text-muted-foreground">activities this week</div>
              </div>
            </div>
            <Progress
              value={Math.min(100, (completed / plan.weeklyTarget) * 100)}
              className="mt-6 h-2 rounded-none"
            />
            <p className="mt-3 text-sm font-medium">
              {remaining === 0
                ? "Weekly plan complete — nice work."
                : `${remaining} more ${remaining === 1 ? "activity" : "activities"} to complete this week.`}
            </p>
          </div>
          <div className="border-t border-border bg-primary/5 p-7 lg:border-l lg:border-t-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Planned days
            </p>
            <div className="mt-4 space-y-3">
              {plan.plannedDays.map((day) => (
                <div key={day} className="flex items-center gap-3 text-sm">
                  <span className="grid h-6 w-6 place-items-center rounded-full border border-primary/30 bg-primary/5 text-primary">
                    <CalendarDays className="h-3.5 w-3.5" />
                  </span>
                  <span className="font-medium">{habitDayLabel(day)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {plan.recovery && (
        <section className="mt-6 border border-accent/70 bg-accent/10 p-6">
          <div className="flex items-start gap-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
              <RefreshCcw className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Missed {habitDayLabel(plan.recovery.missedDay)}? Keep the week flexible.
              </p>
              {plan.recovery.recoveryDay ? (
                <p className="mt-2 text-sm">
                  Moved to <strong>{habitDayLabel(plan.recovery.recoveryDay)}</strong>. Nothing was
                  lost—your weekly target stays the same.
                </p>
              ) : plan.recovery.options.length > 0 ? (
                <>
                  <h2 className="mt-2 font-display text-xl font-semibold">
                    Choose another day this week.
                  </h2>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {plan.recovery.options.map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => recoverOn(day)}
                        disabled={busyDay !== null}
                        className="h-10 border border-border bg-surface px-4 text-sm font-medium hover:border-primary disabled:opacity-50"
                      >
                        {busyDay === day ? "Moving…" : habitDayLabel(day)}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm">
                  This week is nearly over. Start fresh next week—one imperfect week does not reset
                  your progress.
                </p>
              )}
              {error && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <section className="rounded-xl border border-border bg-surface p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Four-week plan
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold">Consistency at a glance</h2>
            </div>
            <Link to="/record" className="text-sm font-medium text-primary hover:underline">
              Record activity
            </Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            {plan.progress.map((week) => (
              <div
                key={week.start}
                className={`border p-4 ${week.status === "in_progress" ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                  {week.label}
                </div>
                <div className="stat-num mt-4 text-2xl font-bold">
                  {week.count}
                  <span className="text-sm text-muted-foreground">/{plan.weeklyTarget}</span>
                </div>
                <Progress
                  value={Math.min(100, (week.count / plan.weeklyTarget) * 100)}
                  className="mt-3 h-1.5 rounded-none"
                />
                <div className="mt-3 flex items-center gap-1.5 text-[11px] capitalize text-muted-foreground">
                  {week.status === "complete" && (
                    <CircleCheck className="h-3.5 w-3.5 text-[var(--pr)]" />
                  )}
                  {week.status.replace("_", " ")}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-7 border-t border-border pt-5">
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-display font-semibold">Activities that count this week</h3>
              <span className="text-xs text-muted-foreground">
                {state.currentWeekActivities.length} total
              </span>
            </div>
            <div className="mt-3 divide-y divide-border border-y border-border">
              {state.currentWeekActivities.map((activity) => (
                <Link
                  key={activity.id}
                  to="/activity/$id"
                  params={{ id: activity.id }}
                  className="flex items-center justify-between gap-4 py-3 hover:text-primary"
                >
                  <div>
                    <div className="text-sm font-medium">{activity.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {fmtDate(activity.date)} · {activity.sport}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--pr)]">
                    <Check className="h-3.5 w-3.5" /> Counts
                  </span>
                </Link>
              ))}
              {state.currentWeekActivities.length === 0 && (
                <div className="py-7 text-center text-sm text-muted-foreground">
                  Your next activity will appear here.
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="rounded-xl border border-border bg-surface p-6">
          <div className="flex items-center gap-2 text-primary">
            <UserRound className="h-4 w-4" />
            <p className="font-mono text-[10px] uppercase tracking-[0.18em]">Encouragement</p>
          </div>
          {plan.friend ? (
            <>
              <div className="mt-5 flex items-center gap-3">
                <img
                  src={plan.friend.avatar}
                  alt=""
                  className="h-11 w-11 rounded-full object-cover"
                />
                <div>
                  <div className="font-display font-semibold">{plan.friend.name}</div>
                  <div className="text-xs text-muted-foreground">@{plan.friend.handle}</div>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Share an update when you want a nudge. Stride never messages them automatically.
              </p>
              <button
                type="button"
                onClick={shareUpdate}
                className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 bg-secondary px-4 text-sm font-medium text-secondary-foreground"
              >
                {shared ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                {shared ? "Update ready" : "Share an update"}
              </button>
            </>
          ) : (
            <>
              <h2 className="mt-3 font-display text-xl font-semibold">Doing this solo—for now.</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Add someone you follow if a little encouragement would help.
              </p>
              <Link
                to="/first-activity/$id"
                params={{ id: plan.sourceActivityId }}
                search={{ mode: "review" }}
                className="mt-5 inline-flex h-10 w-full items-center justify-center border border-border px-4 text-sm font-medium hover:bg-muted"
              >
                Add a friend
              </Link>
            </>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
