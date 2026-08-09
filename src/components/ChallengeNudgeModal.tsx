import { useEffect, useMemo, useState } from "react";
import { usePostHog } from "@posthog/react";
import { ArrowRight, Calendar, Flame, Trophy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ATHLETES,
  CHALLENGES,
  CHALLENGE_STREAKS,
  FEATURED_CHALLENGE_ID,
  ME,
} from "@/lib/mock-data";
import { toggleChallengeJoin } from "@/lib/api";
import { daysUntil, dismissStorageKey, shouldShowChallengeNudge } from "@/lib/challenge";

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

export function ChallengeNudgeModal() {
  const posthog = usePostHog();
  const challenge = FEATURED_CHALLENGE_ID
    ? CHALLENGES.find((c) => c.id === FEATURED_CHALLENGE_ID)
    : undefined;

  const [joined, setJoined] = useState(Boolean(challenge?.joined));
  const [open, setOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const ranking = useMemo(buildRanking, []);

  const challengeId = challenge?.id;

  useEffect(() => {
    if (!challenge || joined) return;
    if (daysUntil(challenge.endsAt, new Date()) <= 0) return;

    const key = dismissStorageKey(ME.id, challenge.id);
    const lastDismissed = window.localStorage.getItem(key);

    if (shouldShowChallengeNudge(lastDismissed, new Date())) {
      setOpen(true);
      posthog.capture("challenge_nudge_shown", {
        challenge_id: challenge.id,
        challenge_name: challenge.name,
        sport: challenge.sport,
      });
    }
    // Only re-evaluate when the featured challenge or joined status changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeId, joined]);

  if (!challenge || joined) {
    return null;
  }

  const activeChallenge = challenge;
  const daysLeft = daysUntil(activeChallenge.endsAt, new Date());
  const pct = Math.min(100, (activeChallenge.myProgressKm / activeChallenge.goalKm) * 100);
  const unit = activeChallenge.sport === "Ride" && activeChallenge.goalKm > 1000 ? "m" : "km";
  const myRank = ranking.findIndex((row) => row.isMe) + 1;
  const athleteAhead = myRank > 1 ? ranking[myRank - 2] : undefined;

  function handleDismiss() {
    window.localStorage.setItem(
      dismissStorageKey(ME.id, activeChallenge.id),
      new Date().toISOString(),
    );
    posthog.capture("challenge_nudge_dismissed", {
      challenge_id: activeChallenge.id,
      challenge_name: activeChallenge.name,
    });
    setOpen(false);
  }

  async function handleJoin() {
    setJoining(true);
    try {
      const result = await toggleChallengeJoin(activeChallenge.id);
      setJoined(result.joined);
      posthog.capture("challenge_joined", {
        challenge_id: activeChallenge.id,
        challenge_name: activeChallenge.name,
        sport: activeChallenge.sport,
        goal_km: activeChallenge.goalKm,
        source: "nudge_modal",
      });
      setOpen(false);
    } finally {
      setJoining(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleDismiss();
        else setOpen(true);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            Closes in {daysLeft} day{daysLeft === 1 ? "" : "s"}
          </div>
          <DialogTitle className="font-display text-xl">
            {ranking.length > 1
              ? "Join before you fall behind the athletes you follow"
              : `${activeChallenge.name} closes in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
          </DialogTitle>
          <DialogDescription>
            {athleteAhead ? (
              <>
                You're <strong className="text-foreground">#{myRank}</strong> of {ranking.length}{" "}
                among athletes you follow. Join {activeChallenge.name} to close the gap on{" "}
                {athleteAhead.name.split(" ")[0]} ({athleteAhead.months}mo streak).
              </>
            ) : ranking.length > 1 ? (
              <>You're already in the lead among athletes you follow — join to defend it.</>
            ) : (
              <>
                A monthly challenge built around your current training. Joinable only until it
                closes.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {ranking.length > 1 && (
          <ol className="flex items-center gap-3">
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
                      className="h-8 w-8 rounded-full object-cover ring-2 ring-border"
                    />
                  )}
                  <span className="absolute -left-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-foreground/80 font-mono text-[9px] font-semibold text-background">
                    {index + 1}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">{row.months}mo</span>
              </li>
            ))}
          </ol>
        )}

        <div className="flex items-center gap-4">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {activeChallenge.myProgressKm.toFixed(0)} / {activeChallenge.goalKm} {unit}
          </span>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={handleDismiss}
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            Not now
          </button>
          <button
            type="button"
            disabled={joining}
            onClick={handleJoin}
            className="inline-flex h-10 items-center justify-center gap-2 bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-95 disabled:cursor-wait disabled:opacity-60"
          >
            <Trophy className="h-4 w-4" /> {joining ? "Joining…" : "Join challenge"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
