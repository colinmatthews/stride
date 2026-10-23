import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CHALLENGES } from "@/lib/mock-data";
import { AppShell } from "@/components/AppShell";
import { ChallengeCard } from "@/components/ChallengeCard";
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

function ChallengesPage() {
  const posthog = usePostHog();
  const [joined, setJoined] = useState<Record<string, boolean>>(
    Object.fromEntries(CHALLENGES.map((c) => [c.id, !!c.joined])),
  );
  const [participants, setParticipants] = useState<Record<string, number>>(
    Object.fromEntries(CHALLENGES.map((c) => [c.id, c.participants])),
  );

  const joinedCount = Object.values(joined).filter(Boolean).length;

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
        {CHALLENGES.map((c) => (
          <ChallengeCard
            key={c.id}
            challenge={c}
            joined={joined[c.id]}
            participants={participants[c.id]}
            onToggleJoin={async () => {
              const result = await toggleChallengeJoin(c.id);
              setJoined((state) => ({ ...state, [c.id]: result.joined }));
              setParticipants((state) => ({ ...state, [c.id]: result.participants }));
              posthog.capture(result.joined ? "challenge_joined" : "challenge_left", {
                challenge_id: c.id,
                challenge_name: c.name,
                sport: c.sport,
                goal_km: c.goalKm,
              });
            }}
          />
        ))}
      </div>
    </AppShell>
  );
}
