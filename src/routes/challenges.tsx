import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CHALLENGES, type Challenge } from "@/lib/mock-data";
import { AppShell } from "@/components/AppShell";
import { Trophy, Users, Calendar, Check, CheckCircle2 } from "lucide-react";
import { toggleChallengeJoin } from "@/lib/api";
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

function ChallengeCard({
  challenge: c,
  isJoined,
  completed,
  participants,
  onToggleJoin,
}: {
  challenge: Challenge;
  isJoined: boolean;
  completed: boolean;
  participants: number;
  onToggleJoin: () => void;
}) {
  const pct = Math.min(100, (c.myProgressKm / c.goalKm) * 100);
  const unit = c.sport === "Ride" && c.goalKm > 1000 ? "m" : "km";

  return (
    <article
      className={`group flex flex-col overflow-hidden border bg-surface transition-colors ${
        completed ? "border-pr/40" : "border-border hover:border-foreground/40"
      }`}
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
          {completed ? (
            <div className="flex items-center gap-1.5 bg-pr px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-secondary">
              <CheckCircle2 className="h-3 w-3" /> Complete
            </div>
          ) : isJoined ? (
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
            {participants.toLocaleString()} athletes
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" /> ends {c.endsAt}
          </span>
        </div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              {completed ? "Complete" : isJoined ? "Your progress" : "Not started"}
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
              className={`h-full transition-all ${completed ? "bg-pr" : "bg-primary"}`}
              style={{ width: `${isJoined ? pct : 0}%` }}
            />
          </div>
          {isJoined && !completed && (
            <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              <span>{Math.round(pct)}% complete</span>
              <span>
                {Math.max(0, c.goalKm - c.myProgressKm).toFixed(0)} {unit} to go
              </span>
            </div>
          )}
        </div>

        <button
          onClick={onToggleJoin}
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
}

function ChallengesPage() {
  const posthog = usePostHog();
  const [joined, setJoined] = useState<Record<string, boolean>>(
    Object.fromEntries(CHALLENGES.map((c) => [c.id, !!c.joined])),
  );
  const [participants, setParticipants] = useState<Record<string, number>>(
    Object.fromEntries(CHALLENGES.map((c) => [c.id, c.participants])),
  );

  const joinedCount = Object.values(joined).filter(Boolean).length;

  const isCompleted = (c: Challenge) => joined[c.id] && c.myProgressKm / c.goalKm >= 1;

  const openChallenges = CHALLENGES.filter((c) => !isCompleted(c));
  const completedChallenges = CHALLENGES.filter(isCompleted);

  async function handleToggleJoin(c: Challenge) {
    const result = await toggleChallengeJoin(c.id);
    setJoined((state) => ({ ...state, [c.id]: result.joined }));
    setParticipants((state) => ({ ...state, [c.id]: result.participants }));
    posthog.capture(result.joined ? "challenge_joined" : "challenge_left", {
      challenge_id: c.id,
      challenge_name: c.name,
      sport: c.sport,
      goal_km: c.goalKm,
    });
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
        {openChallenges.map((c) => (
          <ChallengeCard
            key={c.id}
            challenge={c}
            isJoined={joined[c.id]}
            completed={false}
            participants={participants[c.id]}
            onToggleJoin={() => handleToggleJoin(c)}
          />
        ))}
      </div>

      {completedChallenges.length > 0 && (
        <div className="mt-12">
          <div className="mb-6 flex items-center gap-2 border-b border-border pb-4">
            <CheckCircle2 className="h-4 w-4 text-pr" />
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Completed challenges
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-6">
            {completedChallenges.map((c) => (
              <ChallengeCard
                key={c.id}
                challenge={c}
                isJoined={joined[c.id]}
                completed
                participants={participants[c.id]}
                onToggleJoin={() => handleToggleJoin(c)}
              />
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}
