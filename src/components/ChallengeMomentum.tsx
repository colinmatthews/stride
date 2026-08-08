import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronUp, Flame, Trophy, Users } from "lucide-react";
import { usePostHog } from "@posthog/react";
import { toggleChallengeJoin, type ActivityMomentum, type MomentumBoardRow } from "@/lib/api";

/**
 * Post-run challenge momentum.
 *
 * Instead of asking "want to join a challenge?", this asks "want to keep the
 * progress you already have?". The run just logged is credited retroactively,
 * so the first thing the athlete sees is a bar that is already part-full and
 * the leaderboard rank they'd hold today. Opting in protects progress rather
 * than starting from zero, and the people they follow ranked immediately
 * above give a reason to keep going after the join.
 */
export function ChallengeMomentum({ momentum }: { momentum: ActivityMomentum }) {
  const posthog = usePostHog();
  const { challenge, carried, board, myRank, gapToNext, aheadName, followedCount } = momentum;

  const [joined, setJoined] = useState(challenge.joined);
  const [participants, setParticipants] = useState(challenge.participants);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const unit = challenge.unit;
  const pct = challenge.goalKm > 0 ? Math.min(100, (carried.total / challenge.goalKm) * 100) : 0;
  const priorPct =
    challenge.goalKm > 0 ? Math.min(100, (carried.prior / challenge.goalKm) * 100) : 0;
  const remaining = Math.max(0, challenge.goalKm - carried.total);
  const animatedTotal = useCountUp(carried.total, 900);

  // The nudge only works if it's seen, and only counts as a nudge while the
  // athlete is still outside the challenge — instrumenting it separately from
  // the join is what makes impression-to-join measurable.
  const nudgeLogged = useRef(false);

  useEffect(() => {
    if (nudgeLogged.current || challenge.joined) {
      return;
    }

    nudgeLogged.current = true;
    posthog.capture("challenge_nudge_shown", {
      challenge_id: challenge.id,
      challenge_name: challenge.name,
      sport: challenge.sport,
      surface: "post_run",
      provisional_rank: myRank,
      carried_km: carried.total,
    });
  }, [posthog, challenge, myRank, carried.total]);

  async function join() {
    if (busy || joined) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await toggleChallengeJoin(challenge.id);
      setJoined(result.joined);
      setParticipants(result.participants);

      if (result.joined) {
        posthog.capture("challenge_joined", {
          challenge_id: challenge.id,
          challenge_name: challenge.name,
          sport: challenge.sport,
          goal_km: challenge.goalKm,
          surface: "post_run",
          carried_km: carried.total,
          provisional_rank: myRank,
        });
      }
    } catch (err) {
      posthog.captureException(err);
      setError("Couldn't join the challenge. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden border border-border bg-surface">
      {/* Ink banner — same language as the /challenges cards, laid out
          horizontally so it reads as a strip under the run rather than
          competing with it. */}
      <div className="relative flex flex-wrap items-center gap-x-5 gap-y-3 bg-secondary px-6 py-5 text-secondary-foreground">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="relative font-display text-4xl font-bold leading-none tracking-[-0.04em]">
          {challenge.badge}
        </div>
        <div className="relative min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/60">
            {challenge.sport} · ends {challenge.endsAt}
          </div>
          <h2 className="mt-1 truncate font-display text-xl font-semibold tracking-tight">
            {challenge.name}
          </h2>
        </div>
        <div className="relative ml-auto flex items-center gap-4">
          <div className="hidden text-right sm:block">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/60">
              Goal
            </div>
            <div className="stat-num mt-0.5 text-lg font-semibold text-primary">
              {challenge.goalKm} {unit}
            </div>
          </div>
          {joined ? (
            <div className="flex items-center gap-1.5 bg-primary px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-primary-foreground">
              <Check className="h-3 w-3" /> Joined
            </div>
          ) : (
            challenge.daysLeft > 0 && (
              <div className="flex items-center gap-1.5 bg-secondary-foreground/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/70">
                <Flame className="h-3 w-3" /> {challenge.daysLeft} days left
              </div>
            )
          )}
        </div>
      </div>

      {/* The hook, full width and unmissable: this run already counted */}
      <div className="border-b border-border px-6 py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {joined ? "Your progress" : "This run already counts — you've covered"}
          </div>
          <div className="stat-num text-2xl font-bold leading-none">
            {animatedTotal.toFixed(1)}
            <span className="font-body text-base font-normal text-muted-foreground">
              {" "}
              / {challenge.goalKm} {unit}
            </span>
          </div>
        </div>

        {/* Two-tone bar: distance banked before today vs. the run just logged */}
        <div className="mt-3 flex h-3 overflow-hidden bg-muted">
          <div
            className="h-full bg-primary/45 transition-all duration-[900ms] ease-out"
            style={{ width: `${priorPct}%` }}
          />
          <div
            className="h-full bg-primary transition-all duration-[900ms] ease-out"
            style={{ width: `${Math.max(0, pct - priorPct)}%` }}
          />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 font-mono text-[10px] uppercase tracking-[0.22em]">
          <span className="inline-flex items-center gap-1.5 text-primary">
            <ChevronUp className="h-3 w-3" />+{carried.fromThisActivity} {unit} from this activity
          </span>
          <span className="text-muted-foreground">
            {remaining.toFixed(1)} {unit} to go · {participants.toLocaleString()} athletes
          </span>
        </div>
      </div>

      {/* Standings sit beside the decision, so the rank being offered is
          visible at the same moment as the button. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <div className="p-6">
          <div className="flex items-baseline justify-between gap-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Last {momentum.windowDays} days
            </div>
            {followedCount > 0 && (
              <div className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                <Users className="h-3 w-3" />
                {followedCount} you follow
              </div>
            )}
          </div>

          <ol className="mt-3 divide-y divide-border border-y border-border">
            {board.map((entry, index) => {
              const previous = board[index - 1];
              const skipped = previous !== undefined && entry.rank !== previous.rank + 1;

              return (
                <Fragment key={entry.athleteId}>
                  {skipped && (
                    <li className="px-3 py-1.5 text-center font-mono text-[10px] tracking-[0.22em] text-muted-foreground">
                      ···
                    </li>
                  )}
                  <BoardRow entry={entry} joined={joined} goalKm={challenge.goalKm} unit={unit} />
                </Fragment>
              );
            })}
          </ol>
        </div>

        <div className="flex flex-col justify-center border-t border-border bg-surface-2 p-6 lg:border-l lg:border-t-0">
          {joined ? (
            <div className="border border-pr/30 bg-pr/5 p-4">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-pr">
                <Check className="h-3.5 w-3.5" /> You're in at #{myRank}
              </div>
              <p className="mt-2 text-sm leading-6 text-foreground">
                {aheadName ? (
                  <>
                    <span className="stat-num font-semibold">
                      {gapToNext.toFixed(1)} {unit}
                    </span>{" "}
                    behind <span className="font-semibold">{aheadName}</span>. One more like today's
                    and you take {ordinal(myRank - 1)}.
                  </>
                ) : (
                  <>You're leading the pack. Keep it there.</>
                )}
              </p>
            </div>
          ) : (
            <>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Your spot
              </div>
              <div className="stat-num mt-1 text-4xl font-bold leading-none">#{myRank}</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {aheadName ? (
                  <>
                    Just{" "}
                    <span className="stat-num font-semibold text-foreground">
                      {gapToNext.toFixed(1)} {unit}
                    </span>{" "}
                    behind <span className="font-medium text-foreground">{aheadName}</span>.
                  </>
                ) : (
                  <>You'd be leading this challenge.</>
                )}
              </p>
              <button
                onClick={join}
                disabled={busy}
                className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              >
                <Trophy className="h-4 w-4" />
                {busy ? "Joining" : "Keep this progress"}
                <ArrowRight className="h-4 w-4" />
              </button>
              <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
                Your last {momentum.windowDays} days already count. Nothing resets.
              </p>
              {error && (
                <p className="mt-2 text-center text-xs leading-5 text-destructive">{error}</p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function BoardRow({
  entry,
  joined,
  goalKm,
  unit,
}: {
  entry: MomentumBoardRow;
  joined: boolean;
  goalKm: number;
  unit: string;
}) {
  const pct = goalKm > 0 ? Math.min(100, (entry.value / goalKm) * 100) : 0;

  // Before joining, the athlete's own row reads as provisional — it's the
  // visual argument for pressing the button, not just a status.
  const provisional = entry.isMe && !joined;

  return (
    <li
      className={`relative flex items-center gap-3 px-3 py-2.5 transition-colors ${
        entry.isMe ? (joined ? "bg-primary/[0.07]" : "bg-muted/50") : ""
      }`}
    >
      {entry.isMe && (
        <span
          className={`absolute inset-y-0 left-0 w-0.5 transition-colors ${
            joined ? "bg-primary" : "bg-border"
          }`}
        />
      )}
      <span
        className={`stat-num w-6 shrink-0 text-sm ${
          entry.isMe ? "font-bold text-foreground" : "text-muted-foreground"
        }`}
      >
        {entry.rank}
      </span>
      <img
        src={entry.avatar}
        alt={entry.name}
        className={`h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-border ${
          provisional ? "opacity-60" : ""
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`truncate text-sm ${entry.isMe ? "font-semibold" : "font-medium"} ${
              provisional ? "text-muted-foreground" : ""
            }`}
          >
            {entry.name}
          </span>
          {provisional && (
            <span className="shrink-0 border border-dashed border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
              Not joined
            </span>
          )}
          {!entry.isMe && entry.isFollowing && (
            <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
              Following
            </span>
          )}
        </div>
        <div className="mt-1 h-1 overflow-hidden bg-muted">
          <div
            className={`h-full transition-all duration-700 ${
              entry.isMe ? (joined ? "bg-primary" : "bg-border") : "bg-secondary/30"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <span
        className={`stat-num shrink-0 text-sm ${
          provisional ? "text-muted-foreground" : "font-semibold text-foreground"
        }`}
      >
        {entry.value.toFixed(1)}
        <span className="ml-0.5 font-body text-[10px] font-normal text-muted-foreground">
          {unit}
        </span>
      </span>
    </li>
  );
}

function ordinal(n: number): string {
  const suffix = ["th", "st", "nd", "rd"][
    (n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10
  ];

  return `${n}${suffix}`;
}

/** Counts up on mount so the carried-over distance reads as something gained. */
function useCountUp(target: number, durationMs: number) {
  const [value, setValue] = useState(0);
  const frame = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out so it decelerates into the final number
      setValue(target * (1 - Math.pow(1 - t, 3)));

      if (t < 1) {
        frame.current = requestAnimationFrame(tick);
      }
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, durationMs]);

  return value;
}
