import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CHALLENGES,
  PENDING_COMPLETIONS,
  challengeUnit,
  type PendingChallengeCompletion,
} from "@/lib/mock-data";
import { AppShell } from "@/components/AppShell";
import { Trophy, Users, Calendar, Check, PartyPopper } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { acknowledgeChallengeCompletion, toggleChallengeJoin } from "@/lib/api";
import { usePostHog } from "@posthog/react";

export const Route = createFileRoute("/challenges")({
  head: () => ({
    meta: [
      { title: "Challenges — Stride" },
      { name: "description", content: "Join monthly distance and climbing challenges." },
    ],
  }),
  component: ChallengesPage,
});

function ChallengesPage() {
  const posthog = usePostHog();
  const [joined, setJoined] = useState<Record<string, boolean>>(
    Object.fromEntries(CHALLENGES.map((c) => [c.id, !!c.joined])),
  );
  const [participants, setParticipants] = useState<Record<string, number>>(
    Object.fromEntries(CHALLENGES.map((c) => [c.id, c.participants])),
  );

  const joinedCount = Object.values(joined).filter(Boolean).length;

  const [currentCompletion, setCurrentCompletion] = useState<PendingChallengeCompletion | null>(
    () => PENDING_COMPLETIONS[0] ?? null,
  );
  const [recapOpen, setRecapOpen] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (!currentCompletion) return;
    const id = setTimeout(() => setRecapOpen(true), 300);
    return () => clearTimeout(id);
  }, [currentCompletion]);

  const completedChallenge = currentCompletion
    ? CHALLENGES.find((c) => c.id === currentCompletion.challengeId)
    : undefined;
  const nextChallenge =
    currentCompletion?.suggestedChallengeId != null
      ? CHALLENGES.find((c) => c.id === currentCompletion.suggestedChallengeId)
      : undefined;

  async function handleDismiss() {
    if (!currentCompletion || dismissing) return;
    setDismissing(true);
    setRecapOpen(false);
    try {
      await acknowledgeChallengeCompletion(currentCompletion.challengeId);
      const idx = PENDING_COMPLETIONS.findIndex(
        (p) => p.challengeId === currentCompletion.challengeId,
      );
      if (idx !== -1) PENDING_COMPLETIONS.splice(idx, 1);
    } catch {
      setCurrentCompletion(null);
      setDismissing(false);
      return;
    }
    setCurrentCompletion(PENDING_COMPLETIONS[0] ?? null);
    setDismissing(false);
  }

  async function handleChallengeToggle(
    challengeId: string,
    challengeName: string,
    sport: string,
    goalKm: number,
  ) {
    const result = await toggleChallengeJoin(challengeId);
    setJoined((state) => ({ ...state, [challengeId]: result.joined }));
    setParticipants((state) => ({ ...state, [challengeId]: result.participants }));
    posthog.capture(result.joined ? "challenge_joined" : "challenge_left", {
      challenge_id: challengeId,
      challenge_name: challengeName,
      sport,
      goal_km: goalKm,
    });
    return result;
  }

  return (
    <AppShell>
      <div className="mb-10 flex items-end justify-between border-b border-border pb-8">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Issue 04 · Push yourself this month
          </div>
          <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-[-0.02em]">
            Challenges
          </h1>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Joined
          </div>
          <div className="stat-num mt-1 text-2xl font-bold">
            {joinedCount} / {CHALLENGES.length}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {CHALLENGES.map((c) => {
          const isJoined = joined[c.id];
          const pct = Math.min(100, (c.myProgressKm / c.goalKm) * 100);
          const unit = challengeUnit(c);
          return (
            <article
              key={c.id}
              className="group flex flex-col overflow-hidden border border-border bg-surface transition-colors hover:border-foreground/40"
            >
              <div className="relative flex min-h-[180px] flex-col justify-between bg-secondary p-6 text-secondary-foreground">
                {/* decorative gridlines */}
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.07]"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
                    backgroundSize: "32px 32px",
                  }}
                />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/60">
                    {c.sport} · monthly
                  </div>
                  {isJoined ? (
                    <div className="flex items-center gap-1.5 bg-primary px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-primary-foreground">
                      <Check className="h-3 w-3" /> Joined
                    </div>
                  ) : (
                    <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/50">
                      Open
                    </div>
                  )}
                </div>

                <div className="relative">
                  <div className="font-display text-[4rem] font-bold leading-none tracking-[-0.04em] text-secondary-foreground sm:text-[5rem]">
                    {c.badge}
                  </div>
                  <div className="mt-3 flex items-baseline justify-between gap-4">
                    <h3 className="font-display text-lg font-semibold tracking-tight text-secondary-foreground/90">
                      {c.name}
                    </h3>
                    <span className="stat-num shrink-0 text-base font-semibold text-primary">
                      {c.goalKm} {unit}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-1 flex-col p-6">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {participants[c.id].toLocaleString()} athletes
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" /> ends {c.endsAt}
                  </span>
                </div>

                <div className="mt-5">
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                      {isJoined ? "Your progress" : "Not started"}
                    </span>
                    <span className="stat-num text-sm font-semibold">
                      {isJoined ? (
                        <>
                          {c.myProgressKm.toFixed(1)}
                          <span className="text-muted-foreground">
                            {" "}
                            / {c.goalKm} {unit}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">
                          0 / {c.goalKm} {unit}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${isJoined ? pct : 0}%` }}
                    />
                  </div>
                  {isJoined && (
                    <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                      <span>{Math.round(pct)}% complete</span>
                      <span>
                        {Math.max(0, c.goalKm - c.myProgressKm).toFixed(0)} {unit} to go
                      </span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleChallengeToggle(c.id, c.name, c.sport, c.goalKm)}
                  className={`mt-6 inline-flex h-11 w-full items-center justify-center gap-2 text-sm font-medium transition-opacity hover:opacity-95 ${
                    isJoined
                      ? "border border-border bg-surface text-foreground"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  {isJoined ? (
                    <>
                      <Check className="h-4 w-4" /> Leave challenge
                    </>
                  ) : (
                    <>
                      <Trophy className="h-4 w-4" /> Join challenge
                    </>
                  )}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {completedChallenge && (
        <Dialog open={recapOpen} onOpenChange={(open) => { if (!open) handleDismiss(); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PartyPopper className="h-4 w-4 text-primary" /> {completedChallenge.name} complete!
              </DialogTitle>
            </DialogHeader>
            <div className="mt-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Your result</span>
                <span className="stat-num text-lg font-semibold">
                  {completedChallenge.myProgressKm.toFixed(1)}
                  <span className="text-muted-foreground text-sm">
                    {" "}
                    / {completedChallenge.goalKm} {challengeUnit(completedChallenge)}
                  </span>
                </span>
              </div>
              <div className="mt-2 h-1.5 bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{
                    width: `${Math.min(100, (completedChallenge.myProgressKm / completedChallenge.goalKm) * 100)}%`,
                  }}
                />
              </div>
            </div>
            {nextChallenge && (
              <div className="mt-5">
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-2">
                  What's next
                </div>
                <div className="rounded-lg border border-border bg-surface p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {nextChallenge.sport} · monthly
                    </span>
                    <Badge variant="secondary">{nextChallenge.badge}</Badge>
                  </div>
                  <div className="mt-2 font-display text-lg font-semibold">{nextChallenge.name}</div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" /> {participants[nextChallenge.id]?.toLocaleString()}{" "}
                      athletes
                    </span>
                    <span>
                      {nextChallenge.goalKm} {challengeUnit(nextChallenge)} goal
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      handleChallengeToggle(
                        nextChallenge.id,
                        nextChallenge.name,
                        nextChallenge.sport,
                        nextChallenge.goalKm,
                      )
                    }
                    disabled={joined[nextChallenge.id]}
                    className={`mt-4 inline-flex h-10 w-full items-center justify-center gap-2 text-sm font-medium transition-opacity hover:opacity-95 ${
                      joined[nextChallenge.id]
                        ? "border border-border bg-surface text-foreground"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    {joined[nextChallenge.id] ? (
                      <>
                        <Check className="h-4 w-4" /> Joined {nextChallenge.name}
                      </>
                    ) : (
                      <>
                        <Trophy className="h-4 w-4" /> Join {nextChallenge.name}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </AppShell>
  );
}
