import { Link } from "@tanstack/react-router";
import { Check, Flame, Target, Users } from "lucide-react";
import { getAthlete } from "@/lib/mock-data";
import {
  habitProgress,
  habitWindowDays,
  type HabitCommitment,
  type HabitState,
} from "@/lib/habit";
import { SportBadge } from "./SportBadge";

type Props = {
  state: HabitState;
  onSetNextAction?: () => void;
};

export function HabitProgressCard({ state, onSetNextAction }: Props) {
  const { commitment, commitPromptPending, firstActivityId } = state;

  if (!commitment && (commitPromptPending || Boolean(firstActivityId))) {
    return (
      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="bg-secondary p-5 text-secondary-foreground">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/60">
            Week 0 · Keep the streak going
          </div>
          <h3 className="mt-3 font-display text-xl font-bold tracking-tight">
            First effort logged. Lock your next 3 days.
          </h3>
          <p className="mt-2 text-sm leading-6 text-secondary-foreground/75">
            Pick the same sport, a distance, and optionally a buddy — we&apos;ll nudge you if a day
            slips.
          </p>
          {onSetNextAction && (
            <button
              type="button"
              onClick={onSetNextAction}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-95"
            >
              <Target className="h-4 w-4" /> Set next action
            </button>
          )}
        </div>
      </section>
    );
  }

  if (!commitment) return null;

  return <HabitActiveCard commitment={commitment} onSetNextAction={onSetNextAction} />;
}

function HabitActiveCard({
  commitment,
  onSetNextAction,
}: {
  commitment: HabitCommitment;
  onSetNextAction?: () => void;
}) {
  const { done, target } = habitProgress(commitment);
  const days = habitWindowDays(commitment);
  const buddy = commitment.buddyId ? getAthlete(commitment.buddyId) : null;
  const won = Boolean(commitment.completedAt);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Week 0 habit
            </div>
            <h3 className="mt-1 flex items-center gap-2 font-display text-base font-semibold">
              <Flame className={`h-4 w-4 ${won ? "text-pr" : "text-primary"}`} />
              {won ? "Streak locked" : "Keep the streak going"}
            </h3>
          </div>
          <div className="text-right">
            <div className="stat-num text-2xl font-bold leading-none">
              {done}
              <span className="text-base text-muted-foreground">/{target}</span>
            </div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              active days
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {days.map((day, index) => {
            const hit = commitment.activeDays.includes(day);
            const label = new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
              weekday: "short",
            });
            return (
              <div
                key={day}
                className={`rounded-md border px-2 py-2.5 text-center ${
                  hit
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border bg-surface-2 text-muted-foreground"
                }`}
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.16em]">{label}</div>
                <div className="mt-1.5 flex justify-center">
                  {hit ? (
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  ) : (
                    <span className="grid h-6 w-6 place-items-center rounded-full border border-dashed border-border text-[10px] font-mono">
                      {index + 1}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 px-5 py-4">
        <div className="flex items-center gap-2">
          <SportBadge sport={commitment.sport} />
          <span className="text-sm text-muted-foreground">
            {commitment.distanceKm} km · next {commitment.windowDays} days
          </span>
        </div>

        {buddy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>
              Buddy:{" "}
              <Link
                to="/athlete/$id"
                params={{ id: buddy.id }}
                className="font-medium text-foreground hover:underline"
              >
                {buddy.name}
              </Link>
            </span>
          </div>
        )}

        {won ? (
          <p className="text-sm leading-6 text-pr">
            3 active days in week 0 — that&apos;s the habit bar. Keep showing up.
          </p>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            Next action: another {commitment.sport.toLowerCase()} of ~{commitment.distanceKm} km
            {buddy ? ` — ping ${buddy.name.split(" ")[0]}` : ""}.
          </p>
        )}

        {!won && onSetNextAction && (
          <button
            type="button"
            onClick={onSetNextAction}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Edit next action
          </button>
        )}
      </div>
    </section>
  );
}
