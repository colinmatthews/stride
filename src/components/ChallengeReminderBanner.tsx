import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Trophy, X } from "lucide-react";
import { getChallengeReminders } from "@/lib/mock-data";

const DISMISSED_KEY_PREFIX = "stride-dismissed-reminder-";

export function ChallengeReminderBanner() {
  const [dismissedIds, setDismissedIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    const dismissed = new Set(
      getChallengeReminders()
        .map((r) => r.challenge.id)
        .filter((id) => localStorage.getItem(`${DISMISSED_KEY_PREFIX}${id}`) === "1"),
    );
    setDismissedIds(dismissed);
  }, []);

  if (!dismissedIds) return null;

  const reminder = getChallengeReminders().find((r) => !dismissedIds.has(r.challenge.id));
  if (!reminder) return null;

  const { challenge, reason, daysLeft, unit, pct, remaining } = reminder;

  function dismiss() {
    localStorage.setItem(`${DISMISSED_KEY_PREFIX}${challenge.id}`, "1");
    setDismissedIds((prev) => new Set(prev).add(challenge.id));
  }

  const message =
    reason === "deadline"
      ? `${daysLeft <= 0 ? "Ends today" : daysLeft === 1 ? "1 day left" : `${daysLeft} days left`} on ${
          challenge.name
        } — ${remaining.toFixed(0)} ${unit} to go.`
      : `You're ${Math.round(pct)}% of the way to ${challenge.name} — ${remaining.toFixed(0)} ${unit} to go.`;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-primary/25 bg-primary/8 px-5 py-4">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
        <Trophy className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">{message}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/15">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          to="/record"
          className="hidden h-9 items-center rounded-md bg-primary px-3.5 text-xs font-medium text-primary-foreground hover:opacity-95 sm:inline-flex"
        >
          Record activity
        </Link>
        <Link
          to="/challenges"
          className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-3.5 text-xs font-medium hover:bg-muted"
        >
          View challenge
        </Link>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
