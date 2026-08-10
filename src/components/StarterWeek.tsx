import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { usePostHog } from "@posthog/react";
import { ArrowRight, Check, Flame, HeartPulse, PartyPopper, Trophy, Users } from "lucide-react";
import { CHALLENGES, fmtDuration, type Challenge, type StarterWeekState } from "@/lib/mock-data";
import { retryStarterWeek, toggleChallengeJoin } from "@/lib/api";
import {
  CONFETTI_DURATION_MS,
  advancePieces,
  createPieces,
  drawPieces,
  fadeAt,
  type ConfettiPiece,
} from "@/lib/confetti";
import { SportBadge } from "./SportBadge";

const EYEBROW = "font-mono text-[10px] uppercase tracking-[0.22em]";

/**
 * Health copy is tied to where the athlete actually is in the week rather than shown
 * on every surface — the PRD asks for the tie-in at motivational moments without
 * tipping into notification fatigue.
 */
function healthNote(state: StarterWeekState) {
  if (state.status === "expired") {
    return "The 3-a-week target isn't just a random number, by the way — research keeps finding that even a couple of solid sessions a week meaningfully lowers your long-term health risks. So this next attempt still counts for a lot.";
  }

  // Only claim they're one away when they actually are — a retry can land on day 6
  // with nothing logged yet.
  if (state.goal - state.progress === 1) {
    return "One more session gets you to three this week — and studies show that's basically the sweet spot for lowering your risk of heart disease, stroke, and diabetes. So close.";
  }

  return 'Good news: you don’t have to be a daily grinder. Research on so-called "weekend warriors" — people who pack their workouts into just 1–2 sessions a week — found heart-health benefits pretty much on par with people who exercise every day. It’s less about which days you pick, more about just showing up.';
}

function remainingLine(state: StarterWeekState) {
  const left = state.goal - state.progress;

  if (state.needsNudge) {
    return `${left} more activit${left === 1 ? "y" : "ies"} by tomorrow to finish Starter Week.`;
  }

  if (left === 1) {
    return "One more activity this week and you'll finish your first challenge.";
  }

  return `${left === 2 ? "Two" : left} more activities this week and you'll finish your first challenge.`;
}

/** Picks the next challenge to offer: same sport as their week if possible, else anything open. */
function recommendedChallenge(state: StarterWeekState): Challenge | undefined {
  const open = CHALLENGES.filter((challenge) => !challenge.joined);
  const sport = state.qualifyingActivities.at(-1)?.sport;

  return open.find((challenge) => challenge.sport === sport) ?? open[0];
}

function ProgressBar({ value, goal, tone }: { value: number; goal: number; tone: string }) {
  const pct = Math.round((value / goal) * 100);

  return (
    <>
      <div className="flex items-baseline justify-between">
        <div className="stat-num text-2xl font-bold">
          {value}{" "}
          <span className="text-base font-normal text-muted-foreground">/ {goal} activities</span>
        </div>
        <div className="stat-num text-sm font-semibold">{pct}%</div>
      </div>
      <div className="mt-3 h-1.5 w-full bg-primary/15">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </>
  );
}

function ActivityChips({ state }: { state: StarterWeekState }) {
  if (state.qualifyingActivities.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      {state.qualifyingActivities.map((activity) => (
        <div key={activity.id} className="flex items-center gap-2">
          <SportBadge sport={activity.sport} />
          <span className="text-sm text-muted-foreground">{activity.distanceKm.toFixed(1)} km</span>
        </div>
      ))}
    </div>
  );
}

/** Shown before the first activity — Starter Week can't begin until something is logged. */
export function StarterWeekGetStarted() {
  return (
    <section className="border border-primary/30 bg-primary/5 p-6">
      <div className="flex gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-primary text-primary-foreground">
          <Flame className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className={`${EYEBROW} text-primary`}>Get started</div>
          <h2 className="mt-2 font-display text-xl font-bold tracking-[-0.015em]">
            Log your first activity to start Starter Week
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Any run, ride, swim, hike or walk — even a short one totally counts. It kicks off a
            7-day, 3-activity challenge, and here&apos;s the fun part: research shows the biggest
            health payoff isn&apos;t from training harder, it&apos;s from going from doing nothing
            to doing something. That first move does more for your heart than you&apos;d think.
          </p>
          <Link
            to="/record"
            className="mt-5 inline-flex items-center gap-2 bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Record your first activity <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * The persistent progress card. Renders the active, day-6 nudge and expired states —
 * completion is handled by StarterWeekCelebration.
 */
export function StarterWeekCard({
  state,
  onRetry,
  showHealthNote = true,
}: {
  state: StarterWeekState;
  onRetry?: (next: StarterWeekState) => void;
  showHealthNote?: boolean;
}) {
  const posthog = usePostHog();
  const [busy, setBusy] = useState(false);
  const expired = state.status === "expired";
  const nudging = state.needsNudge;

  const retry = async () => {
    setBusy(true);
    try {
      const next = await retryStarterWeek();
      posthog.capture("starter_week_retry_started", { attempt: next.attempt });
      onRetry?.(next);
    } finally {
      setBusy(false);
    }
  };

  const frame = expired
    ? "border-border bg-surface-2"
    : nudging
      ? "border-accent bg-accent/15"
      : "border-border bg-surface";

  return (
    <section className={`border ${frame} p-5`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <span className="font-semibold">Starter Week</span>
        </div>
        <div className={`${EYEBROW} text-muted-foreground`}>
          {expired
            ? "Window closed"
            : state.daysLeft <= 1
              ? "1 day left"
              : `${state.daysLeft} days left`}
        </div>
      </div>

      <div className="mt-4">
        <ProgressBar
          value={state.progress}
          goal={state.goal}
          tone={expired ? "bg-muted-foreground/50" : "bg-primary"}
        />
      </div>

      <ActivityChips state={state} />

      {!expired && <p className="mt-4 text-sm font-medium">{remainingLine(state)}</p>}

      {expired && (
        <p className="mt-4 text-sm">
          Momentum doesn&apos;t reset to zero. Pick a fresh 7-day window, or jump into a challenge
          that&apos;s already in progress below.
        </p>
      )}

      {showHealthNote && (
        <p className="mt-3 flex gap-2 text-sm leading-relaxed text-muted-foreground">
          <HeartPulse className="mt-0.5 h-4 w-4 shrink-0 text-pr" />
          <span>{healthNote(state)}</span>
        </p>
      )}

      {expired && (
        <button
          type="button"
          onClick={retry}
          disabled={busy}
          className="mt-5 inline-flex items-center gap-2 bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Starting…" : "Try Starter Week again"} <ArrowRight className="h-4 w-4" />
        </button>
      )}
    </section>
  );
}

/** Offered after completion and after a missed window. */
export function NextChallengeCard({ state }: { state: StarterWeekState }) {
  const posthog = usePostHog();
  const challenge = recommendedChallenge(state);
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!challenge) return null;

  const join = async () => {
    setBusy(true);
    try {
      const result = await toggleChallengeJoin(challenge.id);
      setJoined(result.joined);
      posthog.capture("starter_week_next_challenge_joined", {
        challenge_id: challenge.id,
        from_status: state.status,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border border-border bg-surface p-5">
      <div className={`${EYEBROW} text-muted-foreground`}>Recommended next challenge</div>
      <div className="mt-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="font-display text-lg font-bold tracking-[-0.015em]">{challenge.name}</div>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <SportBadge sport={challenge.sport === "Multisport" ? "Run" : challenge.sport} />
            <span>{challenge.goalKm} km goal</span>
            <span className="text-border">·</span>
            <Users className="h-3.5 w-3.5" />
            <span>{challenge.participants.toLocaleString()} athletes joined</span>
          </div>
        </div>
        <button
          type="button"
          onClick={join}
          disabled={busy || joined}
          className="shrink-0 bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {joined ? (
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4" /> Joined
            </span>
          ) : (
            "Join challenge"
          )}
        </button>
      </div>
    </section>
  );
}

/**
 * One-shot celebration burst. Drawn on a canvas rather than as DOM nodes so ~90
 * pieces cost a single element, and it stops and clears itself when finished.
 */
function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // The celebration reads perfectly well without motion, so honour the OS setting.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let width = 0;
    let height = 0;

    const measure = () => {
      width = window.innerWidth || document.documentElement.clientWidth;
      height = window.innerHeight || document.documentElement.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    measure();
    window.addEventListener("resize", measure);

    let pieces: ConfettiPiece[] = [];
    let raf = 0;
    let start: number | undefined;
    let last: number | undefined;

    const frame = (time: number) => {
      // Mounted in a background tab or before layout: hold the burst rather than
      // burning it against a zero-sized canvas where nobody would ever see it.
      if (width === 0 || height === 0) {
        measure();
        raf = requestAnimationFrame(frame);
        return;
      }

      if (pieces.length === 0) {
        pieces = createPieces(width, height);
      }

      start ??= time;
      const elapsed = time - start;
      // Clamp dt so a backgrounded tab doesn't teleport every piece off-screen.
      const dt = Math.min((time - (last ?? time)) / 1000, 0.05);
      last = time;

      advancePieces(pieces, dt);

      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = fadeAt(elapsed);
      drawPieces(ctx, pieces);
      ctx.globalAlpha = 1;

      if (elapsed < CONFETTI_DURATION_MS) {
        raf = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 h-full w-full"
    />
  );
}

export function StarterWeekCelebration({ state }: { state: StarterWeekState }) {
  return (
    <div className="space-y-4">
      <Confetti />
      <section className="border border-pr/40 bg-pr/10 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-pr/20">
          <PartyPopper className="h-6 w-6 text-pr" />
        </div>
        <div className={`${EYEBROW} mt-4 text-pr`}>Starter Week complete</div>
        <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.02em]">
          You showed up {state.totals.activities} times this week
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          That&apos;s the habit most new members never build. Here&apos;s what you logged:
        </p>

        <div className="mt-6 grid grid-cols-3 border border-border bg-surface">
          <div className="border-r border-border p-4">
            <div className={`${EYEBROW} text-muted-foreground`}>Activities</div>
            <div className="stat-num mt-1 text-2xl font-bold">{state.totals.activities}</div>
          </div>
          <div className="border-r border-border p-4">
            <div className={`${EYEBROW} text-muted-foreground`}>Distance</div>
            <div className="stat-num mt-1 text-2xl font-bold">
              {state.totals.distanceKm.toFixed(1)} km
            </div>
          </div>
          <div className="p-4">
            <div className={`${EYEBROW} text-muted-foreground`}>Time moving</div>
            <div className="stat-num mt-1 text-2xl font-bold">
              {fmtDuration(state.totals.movingSeconds)}
            </div>
          </div>
        </div>

        <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-pr">
          Three sessions a week is right around the sweet spot researchers keep landing on — enough
          to meaningfully lower your risk of heart disease, stroke, and diabetes, with better mood
          and better sleep thrown in as a bonus. Not bad for one week.
        </p>
      </section>

      <section className="border border-border bg-surface p-5">
        <div className={`${EYEBROW} flex items-center gap-2 text-muted-foreground`}>
          <Users className="h-3.5 w-3.5" /> Worth knowing
        </div>
        <p className="mt-3 text-sm leading-relaxed">
          About 1 in 4 Stride members who finish a challenge go on to join a second one. Keep the
          momentum going with something bigger.
        </p>
      </section>

      <NextChallengeCard state={state} />
    </div>
  );
}
