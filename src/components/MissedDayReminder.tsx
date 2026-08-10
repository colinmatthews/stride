import { Bell, Mail, Smartphone, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { getAthlete } from "@/lib/mock-data";
import {
  habitProgress,
  type HabitCommitment,
  type ReminderChannel,
} from "@/lib/habit";
import { dismissHabitReminder } from "@/lib/api";

const CHANNEL_META: Record<
  ReminderChannel,
  { label: string; icon: typeof Bell; blurb: string }
> = {
  in_app: {
    label: "In-app",
    icon: Smartphone,
    blurb: "You missed a day in week 0 — still time to hit 3 active days.",
  },
  push: {
    label: "Push",
    icon: Bell,
    blurb: "Open Stride and log today’s effort to keep week 0 alive.",
  },
  email: {
    label: "Email",
    icon: Mail,
    blurb: "Keep your week 0 streak alive — record today’s effort.",
  },
};

type Props = {
  commitment: HabitCommitment;
  onDismiss?: () => void;
};

export function MissedDayReminder({ commitment, onDismiss }: Props) {
  const reminder = commitment.reminder;
  if (!reminder || reminder.dismissed) return null;

  const meta = CHANNEL_META[reminder.channel];
  const Icon = meta.icon;
  const { done, target } = habitProgress(commitment);
  const buddy = commitment.buddyId ? getAthlete(commitment.buddyId) : null;
  const missedLabel = new Date(`${reminder.missedDate}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  async function dismiss() {
    await dismissHabitReminder();
    onDismiss?.();
  }

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-primary/30 bg-surface">
      <div className="flex items-stretch">
        <div className="grid w-12 shrink-0 place-items-center bg-primary text-primary-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                {meta.label} reminder · missed {missedLabel}
              </div>
              <p className="mt-1 text-sm font-medium leading-6 text-foreground">{meta.blurb}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                You&apos;re at{" "}
                <span className="font-medium text-foreground">
                  {done} of {target} days
                </span>
                . Next: {commitment.sport.toLowerCase()} ~{commitment.distanceKm} km
                {buddy ? ` with ${buddy.name.split(" ")[0]}` : ""}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void dismiss()}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Dismiss reminder"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              to="/record"
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-95"
            >
              Record today
            </Link>
            <button
              type="button"
              onClick={() => void dismiss()}
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
