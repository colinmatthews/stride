import { useEffect, useMemo, useState } from "react";
import { usePostHog } from "@posthog/react";
import { ArrowRight, Calendar, Check, Flame, Trophy } from "lucide-react";
import {
  ATHLETES,
  CHALLENGES,
  CHALLENGE_STREAKS,
  FEATURED_CHALLENGE_ID,
  ME,
} from "@/lib/mock-data";
import { toggleChallengeJoin } from "@/lib/api";
import { daysUntil } from "@/lib/challenge";

type RankRow = { id: string; name: string; avatar: string; months: number; isMe: boolean };

function buildRanking(): RankRow[] {
  const rows: RankRow[] = [];

  for (const entry of CHALLENGE_STREAKS) {
    if (entry.months <= 0) continue;

    if (entry.athleteId === "me") {
      rows.push({ id: "me", name: "You", avatar: ME.avatar, months: entry.months, isMe: true });
      continue;
    }

    const athlete = ATHLETES.find((a) => a.id === entry.athleteId);
    if (athlete) {
      rows.push({
        id: athlete.id,
        name: athlete.name,
        avatar: athlete.avatar,
        months: entry.months,
        isMe: false,
      });
    }
  }

  return rows.sort((a, b) => b.months - a.months);
}

// Inline nudge banner sitting above the activity feed — mirrors the
// prototype's ChallengeBanner placement, not a popup. It persists after
// joining (to show progress + a way to leave) rather than disappearing.
export function ChallengeNudgeBanner() {
  const posthog = usePostHog();
  const challenge = FEATURED_CHALLENGE_ID
    ? CHALLENGES.find((c) => c.id === FEATURED_CHALLENGE_ID)
    : undefined;

  const [joined, setJoined] = useState(Boolean(challenge?.joined));
  const [saving, setSaving] = useState(false);
  const ranking = useMemo(buildRanking, []);
  const challengeId = challenge?.id;

  useEffect(() => {
    if (!challenge) return;

    posthog.capture("challenge_nudge_shown", {
      challenge_id: challenge.id,
      challenge_name: challenge.name,
      sport: challenge.sport,
      joined,
    });
    // Fire once per mount for this challenge, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeId]);

  if (!challenge) {
    return null;
  }

  const daysLeft = daysUntil(challenge.endsAt, new Date());

  if (!joined && daysLeft <= 0) {
    return null;
  }

  const activeChallenge = challenge;
  const pct = Math.min(100, (activeChallenge.myProgressKm / activeChallenge.goalKm) * 100);
  const unit = activeChallenge.sport === "Ride" && activeChallenge.goalKm > 1000 ? "m" : "km";
  const myRank = ranking.findIndex((row) => row.isMe) + 1;
  const athleteAhead = myRank > 1 ? ranking[myRank - 2] : undefined;

  async function handleToggleJoin() {
    setSaving(true);
    try {
      const result = await toggleChallengeJoin(activeChallenge.id);
      setJoined(result.joined);
      posthog.capture(result.joined ? "challenge_joined" : "challenge_left", {
        challenge_id: activeChallenge.id,
        challenge_name: activeChallenge.name,
        sport: activeChallenge.sport,
        goal_km: activeChallenge.goalKm,
        source: "nudge_banner",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="group relative mb-6 overflow-hidden border border-border bg-secondary text-secondary-foreground">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="relative flex items-start gap-6 p-6">
        <div className="hidden shrink-0 sm:block">
          <div className="grid h-16 w-16 place-items-center bg-secondary-foreground/10 font-display text-xl font-bold">
            {challenge.badge}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/60">
            <Calendar className="h-3 w-3" />
            {joined
              ? `Joined · closes in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`
              : `Closes in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
          </div>

          <h2 className="mt-3 font-display text-2xl font-bold leading-tight tracking-[-0.01em] sm:text-[1.75rem]">
            {ranking.length > 1
              ? "Join before you fall behind the athletes you follow"
              : `${challenge.name} closes in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-secondary-foreground/70">
            {athleteAhead ? (
              <>
                You're <span className="font-semibold text-secondary-foreground">#{myRank}</span> of{" "}
                {ranking.length} among athletes you follow. Join {challenge.name} to close the gap
                on {athleteAhead.name.split(" ")[0]} ({athleteAhead.months}mo streak).
              </>
            ) : ranking.length > 1 ? (
              "You're already in the lead among athletes you follow — join to defend it."
            ) : (
              "A monthly challenge built around your current training. Joinable only until it closes."
            )}
          </p>

          {ranking.length > 1 && (
            <ol className="mt-3 flex items-center gap-3">
              {ranking.slice(0, 6).map((row, index) => (
                <li key={row.id} className="flex flex-col items-center gap-1">
                  <div className="relative">
                    {row.isMe ? (
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/20 ring-2 ring-primary">
                        <Flame className="h-4 w-4 text-primary" />
                      </div>
                    ) : (
                      <img
                        src={row.avatar}
                        alt={row.name}
                        className="h-8 w-8 rounded-full object-cover ring-2 ring-secondary-foreground/15"
                      />
                    )}
                    <span className="absolute -left-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-secondary-foreground/70 font-mono text-[9px] font-semibold text-secondary">
                      {index + 1}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-secondary-foreground/50">
                    {row.months}mo
                  </span>
                </li>
              ))}
            </ol>
          )}

          <div className="mt-4 flex items-center gap-4">
            <div className="h-1.5 max-w-xs flex-1 overflow-hidden rounded-full bg-secondary-foreground/15">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="shrink-0 font-mono text-[11px] text-secondary-foreground/60">
              {challenge.myProgressKm.toFixed(0)} / {challenge.goalKm} {unit}
            </span>
          </div>

          {joined ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="inline-flex h-10 items-center gap-2 border border-secondary-foreground/25 px-5 text-sm font-medium text-secondary-foreground">
                <Check className="h-4 w-4" /> You're in
              </span>
              <a
                href="/challenges"
                className="inline-flex h-10 items-center gap-2 bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-95"
              >
                Track your challenge <ArrowRight className="h-4 w-4" />
              </a>
              <button
                type="button"
                disabled={saving}
                onClick={handleToggleJoin}
                className="font-mono text-[10px] uppercase tracking-[0.2em] text-secondary-foreground/45 hover:text-secondary-foreground/70 disabled:cursor-wait"
              >
                Undo
              </button>
            </div>
          ) : (
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={handleToggleJoin}
                className="inline-flex h-10 items-center gap-2 bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-95 disabled:cursor-wait disabled:opacity-60"
              >
                <Trophy className="h-4 w-4" />
                {saving ? "Joining…" : "Join challenge"}
                <ArrowRight className="h-4 w-4" />
              </button>
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-secondary-foreground/45">
                Won't reopen after it closes
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
