import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Calendar, Check, Clock, Globe, Lock, Plus, Sparkles, Trophy, Users } from "lucide-react";
import { usePostHog } from "@posthog/react";
import {
  CHALLENGES,
  type Challenge,
  type ChallengeStatus,
  type GoalMetric,
  type Sport,
  type Visibility,
} from "@/lib/mock-data";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, createChallenge, toggleChallengeJoin } from "@/lib/api";
import {
  dayOfMonth,
  daysBetween,
  fmtGoal,
  fmtProgress,
  monthIndexOf,
  monthLabel,
  monthShort,
  todayISO,
  windowLabel,
} from "@/lib/challenge-format";

const STATUS_TABS: { key: ChallengeStatus; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
];

const VISIBILITY_LABEL: Record<Visibility, string> = {
  private: "Just you",
  friends: "People you follow",
  public: "Anyone on Stride",
};

export const Route = createFileRoute("/challenges")({
  head: () => ({
    meta: [
      { title: "Challenges — Stride" },
      { name: "description", content: "Set your own monthly distance and climbing challenges." },
    ],
  }),
  component: ChallengesPage,
});

/**
 * Yours reads "Created by you"; anyone else's — which you only ever see when
 * they made it public or you follow them — is credited by name, so the shelf
 * reads as a set of things people made rather than anonymous rows.
 */
function bylineFor(challenge: Challenge) {
  return challenge.createdBy.isMe ? "Created by you" : `Created by ${challenge.createdBy.name}`;
}

function ChallengesPage() {
  const posthog = usePostHog();

  // A copy, not the shared array: `createChallenge` pushes onto CHALLENGES so
  // the rest of the app sees the new challenge, and reusing that reference here
  // would land it in this list twice.
  const [challenges, setChallenges] = useState<Challenge[]>(() => [...CHALLENGES]);
  const [status, setStatus] = useState<ChallengeStatus>("active");
  const [creating, setCreating] = useState(false);

  const today = todayISO();
  const currentMonth = monthIndexOf(today);

  const counts = useMemo(() => {
    const tally: Record<ChallengeStatus, number> = { active: 0, upcoming: 0, past: 0 };

    for (const challenge of challenges) {
      tally[challenge.status] += 1;
    }

    return tally;
  }, [challenges]);

  const visible = useMemo(
    () =>
      challenges
        .filter((challenge) => challenge.status === status)
        .sort((a, b) => {
          if (a.monthIdx !== b.monthIdx) return b.monthIdx - a.monthIdx;
          if (a.createdBy.isMe !== b.createdBy.isMe) return a.createdBy.isMe ? -1 : 1;
          return Number(b.joined) - Number(a.joined);
        }),
    [challenges, status],
  );

  function selectStatus(next: ChallengeStatus) {
    setStatus(next);

    // Mirrors `feed_filter_changed` on the home feed — without it there's no
    // way to tell whether anyone uses Upcoming or Past.
    posthog.capture("challenge_filter_changed", { filter: next, results: counts[next] });
  }

  async function toggleJoin(challenge: Challenge) {
    const result = await toggleChallengeJoin(challenge.id);

    setChallenges((state) =>
      state.map((entry) =>
        entry.id === challenge.id
          ? { ...entry, joined: result.joined, participants: result.participants }
          : entry,
      ),
    );

    posthog.capture(result.joined ? "challenge_joined" : "challenge_left", {
      challenge_id: challenge.id,
      sport: challenge.sport,
      status: challenge.status,
      mine: challenge.createdBy.isMe,
    });
  }

  return (
    <AppShell>
      {/* ---------------------------------------------------------------- */}
      {/* Header                                                            */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex items-end justify-between gap-6 border-b border-border pb-8">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {monthLabel(currentMonth)} · {counts.active} running now
          </div>
          <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-[-0.02em]">
            Challenges
          </h1>
        </div>
        <Button onClick={() => setCreating(true)} className="h-11 px-5">
          <Plus className="h-4 w-4" /> Create challenge
        </Button>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Filter                                                            */}
      {/*                                                                   */}
      {/* Past deliberately carries no count — history only grows, and a    */}
      {/* rising number next to a tab reads as noise, not information.      */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex border border-border">
          {STATUS_TABS.map((tab) => {
            const selected = status === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => selectStatus(tab.key)}
                aria-pressed={selected}
                className={`inline-flex h-10 items-center gap-2 px-5 text-sm transition-colors ${
                  selected
                    ? "bg-secondary font-medium text-secondary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {tab.label}
                {tab.key !== "past" && (
                  <span
                    className={`stat-num text-xs ${
                      selected ? "text-secondary-foreground/60" : "text-muted-foreground/70"
                    }`}
                  >
                    {counts[tab.key]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {status === "upcoming" && visible.length > 0 && (
        <p className="mt-4 flex items-center gap-2 border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          Starts on the 1st. Anything you join now begins counting at midnight.
        </p>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Shelf                                                             */}
      {/* ---------------------------------------------------------------- */}
      {visible.length === 0 ? (
        <EmptyShelf
          status={status}
          firstRun={challenges.length === 0}
          onCreate={() => setCreating(true)}
        />
      ) : status === "past" ? (
        <PastList challenges={visible} />
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {visible.map((challenge) => (
            <ChallengeCard
              key={challenge.id}
              challenge={challenge}
              today={today}
              onToggle={() => toggleJoin(challenge)}
            />
          ))}
        </div>
      )}

      <CreateDialog
        open={creating}
        onOpenChange={setCreating}
        currentMonth={currentMonth}
        onCreated={(challenge) => {
          setChallenges((state) => [challenge, ...state]);
          setStatus(challenge.status);
          posthog.capture("challenge_created", {
            challenge_id: challenge.id,
            sport: challenge.sport,
            metric: challenge.metric,
            goal: challenge.goal,
            visibility: challenge.visibility,
            starts_next_month: challenge.status === "upcoming",
          });
        }}
      />
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */
/* Active + upcoming card                                              */
/* ------------------------------------------------------------------ */

function ChallengeCard({
  challenge,
  today,
  onToggle,
}: {
  challenge: Challenge;
  today: string;
  onToggle: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upcoming = challenge.status === "upcoming";
  const { progress } = challenge;
  const mine = challenge.createdBy.isMe;
  const daysLeft = Math.max(0, daysBetween(today, challenge.endsAt));

  async function handleToggle() {
    setPending(true);
    setError(null);

    try {
      await onToggle();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="flex flex-col overflow-hidden border border-border bg-surface transition-colors hover:border-foreground/40">
      <div
        className={`relative flex min-h-[176px] flex-col justify-between p-6 text-secondary-foreground ${
          upcoming ? "bg-secondary/85" : "bg-secondary"
        }`}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        <div className="relative flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em]">
            <span className="inline-flex items-center gap-1.5 bg-accent px-2 py-1 text-accent-foreground">
              <Sparkles className="h-3 w-3" /> {bylineFor(challenge)}
            </span>
            <span className="text-secondary-foreground/60">{challenge.sport}</span>
            {/* Who can see it is the only sharing control left, so it's worth
                showing the author rather than burying it in the create form. */}
            {mine && (
              <span className="inline-flex items-center gap-1 text-secondary-foreground/45">
                {challenge.visibility === "private" ? (
                  <Lock className="h-3 w-3" />
                ) : (
                  <Globe className="h-3 w-3" />
                )}
                {VISIBILITY_LABEL[challenge.visibility]}
              </span>
            )}
          </div>

          {upcoming && !challenge.joined ? (
            <span className="shrink-0 border border-secondary-foreground/25 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/70">
              Starts 1 {monthShort(challenge.monthIdx)}
            </span>
          ) : challenge.joined ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 bg-primary px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-primary-foreground">
              <Check className="h-3 w-3" />{" "}
              {upcoming ? `Joined · 1 ${monthShort(challenge.monthIdx)}` : "Joined"}
            </span>
          ) : (
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/50">
              Open
            </span>
          )}
        </div>

        <div className="relative">
          <div className="font-display text-[3.5rem] font-bold leading-none tracking-[-0.04em] sm:text-[4.25rem]">
            {challenge.badge}
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-4">
            <h3 className="font-display text-lg font-semibold tracking-tight text-secondary-foreground/90">
              {challenge.name}
            </h3>
            <span className="stat-num shrink-0 text-base font-semibold text-primary">
              {fmtGoal(challenge.goal, challenge.unit)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {challenge.participants.toLocaleString()}{" "}
            {challenge.participants === 1 ? "athlete" : "athletes"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {windowLabel(challenge.startsAt, challenge.endsAt)}
          </span>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">{challenge.blurb}</p>

        <div className="mt-5">
          {upcoming ? (
            <div className="border border-dashed border-border px-4 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Counting begins 1 {monthShort(challenge.monthIdx)}
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  {challenge.joined ? "Your progress" : "If you joined today"}
                </span>
                <span className="stat-num text-sm font-semibold">
                  {fmtProgress(progress.total, challenge.unit)}
                  <span className="text-muted-foreground">
                    {" "}
                    / {fmtGoal(challenge.goal, challenge.unit)}
                  </span>
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden bg-muted">
                <div
                  className={`h-full transition-all ${progress.complete ? "bg-pr" : "bg-primary"}`}
                  style={{ width: `${progress.pct}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                <span>
                  {progress.activities} activit{progress.activities === 1 ? "y" : "ies"} counted
                  {progress.lastDate &&
                    ` · last ${dayOfMonth(progress.lastDate)} ${monthShort(challenge.monthIdx)}`}
                </span>
                <span>{daysLeft} days left</span>
              </div>
            </>
          )}
        </div>

        <button
          onClick={handleToggle}
          disabled={pending}
          className={`mt-6 inline-flex h-11 w-full items-center justify-center gap-2 text-sm font-medium transition-opacity hover:opacity-95 disabled:opacity-60 ${
            challenge.joined
              ? "border border-border bg-surface text-foreground"
              : "bg-primary text-primary-foreground"
          }`}
        >
          {challenge.joined ? (
            <>
              <Check className="h-4 w-4" />{" "}
              {upcoming ? `Joined for 1 ${monthShort(challenge.monthIdx)}` : "Leave challenge"}
            </>
          ) : (
            <>
              <Trophy className="h-4 w-4" /> {upcoming ? "Join early" : "Join challenge"}
            </>
          )}
        </button>

        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Past — a compact ledger, not a wall of dead cards.                  */
/* ------------------------------------------------------------------ */

function PastList({ challenges }: { challenges: Challenge[] }) {
  const months = [...new Set(challenges.map((challenge) => challenge.monthIdx))].sort(
    (a, b) => b - a,
  );

  return (
    <div className="mt-8 space-y-10">
      {months.map((idx) => {
        const rows = challenges.filter((challenge) => challenge.monthIdx === idx);
        const finished = rows.filter(
          (challenge) => challenge.joined && challenge.progress.complete,
        ).length;

        return (
          <section key={idx}>
            <div className="flex items-baseline justify-between border-b border-border pb-3">
              {/* Year included — history eventually spans more than one. */}
              <h2 className="font-display text-xl font-semibold tracking-tight">
                {monthLabel(idx)}
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                {rows.length} {rows.length === 1 ? "challenge" : "challenges"} · {finished}{" "}
                completed
              </span>
            </div>

            <ul className="divide-y divide-border">
              {rows.map((challenge) => (
                <li key={challenge.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 py-4">
                  <span className="grid h-10 w-14 shrink-0 place-items-center bg-muted font-display text-xs font-bold tracking-tight text-muted-foreground">
                    {challenge.badge}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{challenge.name}</div>
                    <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                      {bylineFor(challenge)} · {challenge.sport} ·{" "}
                      {windowLabel(challenge.startsAt, challenge.endsAt)}
                    </div>
                  </div>

                  <div className="stat-num w-40 shrink-0 text-right text-sm">
                    {challenge.joined ? (
                      <>
                        {fmtProgress(challenge.progress.total, challenge.unit)}
                        <span className="text-muted-foreground">
                          {" "}
                          / {fmtGoal(challenge.goal, challenge.unit)}
                        </span>
                      </>
                    ) : (
                      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                        Not joined
                      </span>
                    )}
                  </div>

                  <div className="w-28 shrink-0 text-right">
                    {challenge.joined && challenge.progress.complete ? (
                      <span className="inline-flex items-center gap-1.5 bg-pr/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-pr">
                        <Check className="h-3 w-3" /> Earned
                      </span>
                    ) : challenge.joined ? (
                      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                        {Math.round(challenge.progress.pct)}%
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty states                                                        */
/*                                                                     */
/* Without a system seeding the shelf, empty is the state every new     */
/* athlete starts in — so it has to ask for the one action that fixes   */
/* it rather than just reporting that there's nothing here.             */
/* ------------------------------------------------------------------ */

const EMPTY_COPY: Record<ChallengeStatus, { title: string; body: string }> = {
  active: {
    title: "Nothing running this month",
    body: "Set yourself a target for the rest of the month. Your activities start counting towards it straight away.",
  },
  upcoming: {
    title: "Nothing lined up for next month",
    body: "Plan next month's target now and it starts counting on the 1st.",
  },
  past: {
    title: "No finished challenges yet",
    body: "Once a challenge's month is over it moves here, with what you managed against the goal.",
  },
};

function EmptyShelf({
  status,
  firstRun,
  onCreate,
}: {
  status: ChallengeStatus;
  firstRun: boolean;
  onCreate: () => void;
}) {
  const copy = firstRun
    ? {
        title: "Make your own challenge",
        body: "Name a target, pick a sport and a month, and decide who can see it. Progress is counted from the activities you already record.",
      }
    : EMPTY_COPY[status];

  return (
    <div className="mt-8 border border-dashed border-border px-6 py-16 text-center">
      <Trophy className="mx-auto h-6 w-6 text-muted-foreground/50" />
      <h2 className="mt-4 font-display text-lg font-semibold tracking-tight">{copy.title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{copy.body}</p>
      {status !== "past" && (
        <Button className="mt-6" onClick={onCreate}>
          <Plus className="h-4 w-4" /> Create challenge
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Create your own                                                     */
/* ------------------------------------------------------------------ */

function CreateDialog({
  open,
  onOpenChange,
  currentMonth,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  currentMonth: number;
  onCreated: (challenge: Challenge) => void;
}) {
  const [name, setName] = useState("");
  const [sport, setSport] = useState<Sport>("Run");
  const [metric, setMetric] = useState<GoalMetric>("distance");
  const [goal, setGoal] = useState("80");
  const [monthIdx, setMonthIdx] = useState(currentMonth);
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedGoal = Number(goal);
  const valid = name.trim().length > 1 && Number.isFinite(parsedGoal) && parsedGoal > 0;

  async function submit() {
    if (!valid || pending) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const challenge = await createChallenge({
        name: name.trim(),
        sport,
        metric,
        goal: parsedGoal,
        monthIdx,
        visibility,
      });

      onCreated(challenge);
      setName("");
      setGoal("80");
      setMonthIdx(currentMonth);
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "Could not create the challenge. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[28rem]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl tracking-tight">
            Create a challenge
          </DialogTitle>
          <DialogDescription>
            It counts the activities you already record — no separate tracking.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="challenge-name">Name</Label>
            <Input
              id="challenge-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Sunrise Crew 75K"
              maxLength={80}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Sport</Label>
              <Select value={sport} onValueChange={(value) => setSport(value as Sport)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["Run", "Ride", "Walk", "Swim", "Hike"] as Sport[]).map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Measured in</Label>
              <Select value={metric} onValueChange={(value) => setMetric(value as GoalMetric)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="distance">Distance (km)</SelectItem>
                  <SelectItem value="elevation">Elevation (m)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="challenge-goal">Goal ({metric === "elevation" ? "m" : "km"})</Label>
            <Input
              id="challenge-goal"
              type="number"
              min={1}
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Runs during</Label>
            <div className="flex border border-border">
              {[currentMonth, currentMonth + 1].map((idx) => {
                const selected = monthIdx === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setMonthIdx(idx)}
                    aria-pressed={selected}
                    className={`h-9 flex-1 text-sm transition-colors ${
                      selected
                        ? "bg-secondary font-medium text-secondary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {idx === currentMonth ? "This month" : "Next month"}
                    <span className="ml-1.5 font-mono text-[10px] uppercase tracking-[0.22em] opacity-60">
                      {monthShort(idx)}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              A challenge runs for one calendar month, this month or next.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Who can see it</Label>
            <Select
              value={visibility}
              onValueChange={(value) => setVisibility(value as Visibility)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Just me</SelectItem>
                <SelectItem value="friends">People I follow</SelectItem>
                <SelectItem value="public">Anyone on Stride</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || pending}>
            <Plus className="h-4 w-4" /> {pending ? "Creating…" : "Create challenge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
