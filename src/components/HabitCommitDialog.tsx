import { useEffect, useMemo, useRef, useState } from "react";
import { Flame, Mail, Bell, Smartphone } from "lucide-react";
import { ATHLETES, type Sport } from "@/lib/mock-data";
import {
  commitWeekZeroHabit,
  dismissHabitCommitPrompt,
  type CommitHabitInput,
} from "@/lib/api";
import { SportBadge } from "./SportBadge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SPORTS: Sport[] = ["Run", "Ride", "Swim", "Hike", "Walk"];
const DISTANCES = [3, 5, 8, 10];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSport?: Sport;
  initialDistanceKm?: number;
  onCommitted?: (input: CommitHabitInput) => void;
  onSkipped?: () => void;
};

export function HabitCommitDialog({
  open,
  onOpenChange,
  initialSport = "Run",
  initialDistanceKm = 5,
  onCommitted,
  onSkipped,
}: Props) {
  const buddies = useMemo(
    () => ATHLETES.filter((a) => a.id !== "me").slice(0, 4),
    [],
  );
  const [sport, setSport] = useState<Sport>(initialSport);
  const [distanceKm, setDistanceKm] = useState(initialDistanceKm);
  const [buddyId, setBuddyId] = useState<string | null>(
    buddies.find((b) => b.isFollowing)?.id ?? null,
  );
  const [saving, setSaving] = useState(false);
  const closedByAction = useRef(false);

  useEffect(() => {
    if (!open) return;
    closedByAction.current = false;
    setSport(initialSport);
    const nearest = DISTANCES.reduce((best, km) =>
      Math.abs(km - initialDistanceKm) < Math.abs(best - initialDistanceKm) ? km : best,
    );
    setDistanceKm(nearest);
    setBuddyId(buddies.find((b) => b.isFollowing)?.id ?? null);
  }, [open, initialSport, initialDistanceKm, buddies]);

  async function save() {
    setSaving(true);
    closedByAction.current = true;
    try {
      const input = { sport, distanceKm, buddyId };
      await commitWeekZeroHabit(input);
      onCommitted?.(input);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function skip() {
    setSaving(true);
    closedByAction.current = true;
    try {
      await dismissHabitCommitPrompt();
      onSkipped?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleOpenChange(next: boolean) {
    if (!next && open && !closedByAction.current) {
      await dismissHabitCommitPrompt();
      onSkipped?.();
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => void handleOpenChange(next)}>
      <DialogContent className="max-w-md gap-0 overflow-hidden border-border p-0 sm:rounded-xl">
        <div className="border-b border-border bg-secondary px-6 py-5 text-secondary-foreground">
          <DialogHeader className="space-y-2 text-left">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/60">
              After activity_created · Week 0
            </div>
            <DialogTitle className="font-display text-2xl font-bold tracking-tight">
              Keep the streak going
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-secondary-foreground/75">
              One concrete next action for the next 2–3 days — not a challenge join. We&apos;ll
              remind you in-app if you miss a day.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-6 px-6 py-5">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Same sport
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {SPORTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSport(s)}
                  className={`rounded-md transition-opacity ${
                    sport === s ? "opacity-100" : "opacity-45 hover:opacity-80"
                  }`}
                >
                  <SportBadge sport={s} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Distance goal
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {DISTANCES.map((km) => (
                <button
                  key={km}
                  type="button"
                  onClick={() => setDistanceKm(km)}
                  className={`rounded-md border px-2 py-2.5 text-sm font-medium transition-colors ${
                    distanceKm === km
                      ? "border-secondary bg-secondary text-secondary-foreground"
                      : "border-border bg-surface text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="stat-num">{km}</span>
                  <span className="ml-1 text-xs opacity-70">km</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Buddy <span className="normal-case tracking-normal opacity-70">(optional)</span>
            </div>
            <div className="mt-2 space-y-2">
              <button
                type="button"
                onClick={() => setBuddyId(null)}
                className={`flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                  buddyId === null
                    ? "border-secondary bg-secondary text-secondary-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                Solo — just remind me
              </button>
              {buddies.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBuddyId(b.id)}
                  className={`flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
                    buddyId === b.id
                      ? "border-secondary bg-secondary text-secondary-foreground"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <img
                    src={b.avatar}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover ring-1 ring-border"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{b.name}</div>
                    <div
                      className={`truncate text-xs ${
                        buddyId === b.id ? "opacity-70" : "text-muted-foreground"
                      }`}
                    >
                      @{b.handle} · {b.city}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-border bg-surface-2 px-3 py-3">
            <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <Flame className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>
                Progress is simply <strong className="text-foreground">2 of 3</strong> (or 3 of 3)
                active days in week 0 — no multi-step challenge flow.
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Smartphone className="h-3 w-3" /> In-app
              </span>
              <span className="inline-flex items-center gap-1">
                <Bell className="h-3 w-3" /> Push
              </span>
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3 w-3" /> Email
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={() => void skip()}
            disabled={saving}
            className="h-10 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-95 disabled:opacity-50"
          >
            Lock next action
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
