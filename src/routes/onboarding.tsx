import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from "lucide-react";
import {
  ATHLETES,
  CHALLENGE_WEEK,
  CHALLENGES,
  ME,
  SPORT_ORDER,
  fmtDayMonth,
  fmtDayMonthLong,
  weeklyChallengesForSports,
  type Challenge,
  type ChallengeWeek,
  type Sport,
} from "@/lib/mock-data";
import { joinChallenges, toggleAthleteFollow } from "@/lib/api";
import { SPORT_ICONS, SportBadge } from "@/components/SportBadge";
import { usePostHog } from "@posthog/react";

export const ONBOARDING_STORAGE_KEY = "stride:onboarding:v1";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [{ title: "Welcome — Stride" }],
  }),
  component: OnboardingPage,
});

const SPORT_HINTS: Record<Sport, string> = {
  Run: "Road · track · trail",
  Ride: "Road · gravel · MTB",
  Swim: "Pool · open water",
  Hike: "Trail · summit",
  Walk: "Daily miles",
};

const GOAL_PRESETS = [15, 30, 50, 80, 120];

const DONE_IMG =
  "https://images.unsplash.com/photo-1502904550040-7534597429ae?w=1200&q=80&auto=format&fit=crop";

const STEPS = ["Disciplines", "Weekly target", "Your circle", "Ready"] as const;

function OnboardingPage() {
  const posthog = usePostHog();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ME.id) {
      window.location.replace("/auth");
      return;
    }
    if (typeof window !== "undefined" && localStorage.getItem(ONBOARDING_STORAGE_KEY)) {
      window.location.replace("/");
      return;
    }
    setReady(true);
  }, []);

  const [step, setStep] = useState(0);
  const [sports, setSports] = useState<Set<Sport>>(new Set());
  const [goalKm, setGoalKm] = useState(30);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [optedOut, setOptedOut] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const suggested = useMemo(
    () => ATHLETES.filter((athlete) => athlete.id !== "me" && athlete.id !== ME.id).slice(0, 6),
    [],
  );

  // The week on offer is decided by the server and delivered with bootstrap, so
  // a late-week registrant gets the same rollover every other athlete gets.
  const week = CHALLENGE_WEEK;
  // Every sport the athlete picked gets its weekly challenge offered, already
  // ticked. Opting out is tracked separately so revisiting step 0 doesn't
  // silently re-check something they turned off.
  const offered = useMemo(
    () => weeklyChallengesForSports(sports, week?.start, CHALLENGES),
    [sports, week?.start],
  );
  const chosen = useMemo(
    () => offered.filter((challenge) => !optedOut.has(challenge.id)),
    [offered, optedOut],
  );

  function toggleSport(sport: Sport) {
    setSports((prev) => {
      const copy = new Set(prev);
      if (copy.has(sport)) copy.delete(sport);
      else copy.add(sport);
      return copy;
    });
  }

  // Fired once, when the athlete first reaches the picker. Without it, opt-out
  // is only measurable across athletes who finish onboarding — anyone who sees
  // the challenges and abandons is invisible.
  const offeredCaptured = useRef(false);
  useEffect(() => {
    if (step !== STEPS.length - 1 || offeredCaptured.current) {
      return;
    }

    offeredCaptured.current = true;
    posthog.capture("onboarding_challenges_offered", {
      challenge_ids: offered.map((challenge) => challenge.id),
      challenge_count: offered.length,
      sports: Array.from(sports),
      challenge_week_start: week?.start,
      rolled_forward: week?.isNextWeek ?? false,
    });
  }, [step, offered, sports, week, posthog]);

  function toggleChallenge(challenge: Challenge) {
    const leaving = !optedOut.has(challenge.id);
    setOptedOut((prev) => {
      const copy = new Set(prev);
      if (leaving) copy.add(challenge.id);
      else copy.delete(challenge.id);
      return copy;
    });
    posthog.capture(leaving ? "onboarding_challenge_removed" : "onboarding_challenge_restored", {
      challenge_id: challenge.id,
      sport: challenge.sport,
      goal_km: challenge.goalKm,
    });
  }

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        <LoaderCircle className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const canAdvance = () => {
    if (step === 0) return sports.size > 0;
    if (step === 1) return goalKm > 0;
    return true;
  };

  async function finish() {
    setSaving(true);
    // If the user skipped the follow step, auto-follow a starter set so the feed
    // isn't empty on first entry.
    const baseline = suggested.slice(0, 4).map((athlete) => athlete.id);
    const ids = followed.size > 0 ? Array.from(followed) : baseline;
    const requestedChallengeIds = chosen.map((challenge) => challenge.id);
    // Only the challenges the server confirmed are recorded as joined — a
    // failed join must not leave the athlete believing they're entered.
    let joinedChallengeIds: string[] = [];

    try {
      await Promise.all(ids.map((id) => toggleAthleteFollow(id).catch(() => null)));

      if (requestedChallengeIds.length > 0) {
        try {
          const result = await joinChallenges(requestedChallengeIds);
          joinedChallengeIds = result.joined;

          // One challenge_joined per challenge, matching the shape /challenges
          // emits, so both routes into a challenge land in the same funnel.
          // Driven off `added` rather than `joined`: the endpoint is idempotent,
          // and a re-run of onboarding must not re-count a challenge the
          // athlete is already in.
          const offeredById = new Map(offered.map((challenge) => [challenge.id, challenge]));

          for (const id of result.added) {
            const challenge = offeredById.get(id);
            posthog.capture("challenge_joined", {
              challenge_id: id,
              challenge_name: challenge?.name,
              sport: challenge?.sport,
              goal_km: challenge?.goalKm,
              source: "onboarding",
            });
          }
        } catch (error) {
          // Non-fatal: the athlete still gets into the app and can join from
          // /challenges. Captured so the drop-off is visible in analytics.
          posthog.capture("onboarding_challenge_join_failed", {
            challenge_ids: requestedChallengeIds,
            message: error instanceof Error ? error.message : "unknown",
          });
        }
      }

      posthog.capture("onboarding_completed", {
        sports: Array.from(sports),
        goal_km: goalKm,
        follow_count: ids.length,
        auto_followed: followed.size === 0,
        challenge_count: joinedChallengeIds.length,
        challenge_ids: joinedChallengeIds,
        challenge_opt_out_count: offered.length - requestedChallengeIds.length,
        challenge_week_start: week?.start,
        challenge_week_rolled_forward: week?.isNextWeek ?? false,
      });
    } finally {
      localStorage.setItem(
        ONBOARDING_STORAGE_KEY,
        JSON.stringify({
          completed: true,
          sports: Array.from(sports),
          goalKm,
          followed: ids,
          autoFollowed: followed.size === 0,
          challenges: joinedChallengeIds,
          completedAt: new Date().toISOString(),
        }),
      );
      window.location.assign("/");
    }
  }

  function next() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      void finish();
    }
  }

  function back() {
    if (step > 0) setStep(step - 1);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between px-6 py-5 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-sm bg-secondary font-display text-base font-bold text-secondary-foreground">
              S
            </div>
            <div className="leading-tight">
              <div className="font-display text-lg font-semibold tracking-tight">Stride</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Getting set up
              </div>
            </div>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Step {String(step + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
          </div>
        </div>
        <StepIndicator step={step} />
      </header>

      <main className="flex flex-1 items-start justify-center px-6 py-12 lg:px-10 lg:py-16">
        <div className="w-full max-w-2xl">
          {step === 0 && (
            <SportStep
              sports={sports}
              toggleSport={toggleSport}
              name={ME.name.split(" ")[0] || "athlete"}
            />
          )}
          {step === 1 && <GoalStep goalKm={goalKm} setGoalKm={setGoalKm} sports={sports} />}
          {step === 2 && (
            <FollowStep
              suggested={suggested}
              followed={followed}
              toggle={(id) =>
                setFollowed((prev) => {
                  const copy = new Set(prev);
                  if (copy.has(id)) copy.delete(id);
                  else copy.add(id);
                  return copy;
                })
              }
            />
          )}
          {step === 3 && (
            <DoneStep
              name={ME.name.split(" ")[0] || "athlete"}
              sports={sports}
              goalKm={goalKm}
              followCount={followed.size}
              week={week}
              offered={offered}
              optedOut={optedOut}
              onToggleChallenge={toggleChallenge}
            />
          )}
        </div>
      </main>

      <footer className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-4 px-6 py-4 lg:px-10">
          <button
            onClick={back}
            disabled={step === 0}
            className="inline-flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-0"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          <div className="flex items-center gap-3">
            {step === 2 && (
              <button
                onClick={next}
                className="px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Skip for now
              </button>
            )}
            <button
              onClick={next}
              disabled={!canAdvance() || saving}
              className="group inline-flex items-center gap-2 bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all hover:gap-3 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" /> Saving
                </>
              ) : step === STEPS.length - 1 ? (
                <>
                  Enter Stride <ArrowRight className="h-4 w-4" />
                </>
              ) : (
                <>
                  Continue{" "}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-6 pb-5 lg:px-10">
      <div className="flex gap-2">
        {STEPS.map((label, index) => (
          <div key={label} className="flex-1">
            <div
              className={`h-[3px] w-full ${
                index < step ? "bg-foreground" : index === step ? "bg-primary" : "bg-border"
              }`}
            />
            <div
              className={`mt-2 font-mono text-[10px] uppercase tracking-[0.22em] ${
                index <= step ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {String(index + 1).padStart(2, "0")} · {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepHeader({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="h-px w-8 bg-foreground/40" />
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          {eyebrow}
        </span>
      </div>
      <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-[-0.02em] sm:text-5xl">
        {title}
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">{body}</p>
    </div>
  );
}

function SportStep({
  sports,
  toggleSport,
  name,
}: {
  sports: Set<Sport>;
  toggleSport: (sport: Sport) => void;
  name: string;
}) {
  return (
    <div>
      <StepHeader
        eyebrow={`Welcome, ${name}`}
        title="What are you training for?"
        body="Pick everything you do — most athletes move in more than one way. We'll tune your feed, challenges, and training views around all of them. You can adjust this anytime."
      />
      <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SPORT_ORDER.map((sport) => {
          const Icon = SPORT_ICONS[sport];
          const active = sports.has(sport);
          return (
            <button
              key={sport}
              onClick={() => toggleSport(sport)}
              aria-pressed={active}
              className={`group relative flex flex-col items-start gap-4 border p-5 text-left transition-all ${
                active
                  ? "border-foreground bg-secondary text-secondary-foreground"
                  : "border-border bg-surface hover:border-foreground/50"
              }`}
            >
              <div
                className={`grid h-11 w-11 place-items-center ${
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="font-display text-xl font-bold tracking-tight">{sport}</div>
                <div
                  className={`mt-1 font-mono text-[10px] uppercase tracking-[0.22em] ${
                    active ? "text-secondary-foreground/70" : "text-muted-foreground"
                  }`}
                >
                  {SPORT_HINTS[sport]}
                </div>
              </div>
              {active && (
                <div className="absolute right-4 top-4 grid h-6 w-6 place-items-center bg-primary text-primary-foreground">
                  <Check className="h-3.5 w-3.5" />
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-6 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {sports.size} selected · pick as many as you like
      </div>
    </div>
  );
}

function GoalStep({
  goalKm,
  setGoalKm,
  sports,
}: {
  goalKm: number;
  setGoalKm: (n: number) => void;
  sports: Set<Sport>;
}) {
  const unitLabel = sports.size === 1 && sports.has("Swim") ? "km in the pool" : "km per week";
  return (
    <div>
      <StepHeader
        eyebrow="Weekly target"
        title="How much are you training?"
        body="A rough weekly goal gives Stride something to chart against. Err a little ambitious — missing by 10% still teaches the system."
      />

      <div className="mt-12 border border-border bg-surface p-8">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="stat-num text-7xl font-bold leading-none tracking-[-0.04em]">
              {goalKm}
            </div>
            <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              {unitLabel}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Ramp target
            </div>
            <div className="stat-num mt-1 text-xl font-bold">+5% / wk</div>
          </div>
        </div>

        <input
          type="range"
          min={5}
          max={200}
          step={5}
          value={goalKm}
          onChange={(event) => setGoalKm(Number(event.target.value))}
          className="mt-8 w-full accent-[var(--primary)]"
        />

        <div className="mt-6 flex flex-wrap gap-2">
          {GOAL_PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => setGoalKm(preset)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                goalKm === preset
                  ? "bg-secondary text-secondary-foreground"
                  : "border border-border text-foreground hover:border-foreground/50"
              }`}
            >
              {preset} km
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FollowStep({
  suggested,
  followed,
  toggle,
}: {
  suggested: typeof ATHLETES;
  followed: Set<string>;
  toggle: (id: string) => void;
}) {
  return (
    <div>
      <StepHeader
        eyebrow="Your circle"
        title="Bring a few athletes with you."
        body="Your feed fills in as you follow people. Pick a few to start — you can always follow more later."
      />
      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        {suggested.map((athlete) => {
          const isFollowing = followed.has(athlete.id);
          return (
            <button
              key={athlete.id}
              onClick={() => toggle(athlete.id)}
              className={`flex items-center gap-4 border p-4 text-left transition-all ${
                isFollowing
                  ? "border-foreground bg-secondary text-secondary-foreground"
                  : "border-border bg-surface hover:border-foreground/50"
              }`}
            >
              <img
                src={athlete.avatar}
                alt={athlete.name}
                className="h-12 w-12 shrink-0 object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{athlete.name}</div>
                <div
                  className={`mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.22em] ${
                    isFollowing ? "text-secondary-foreground/70" : "text-muted-foreground"
                  }`}
                >
                  {athlete.city} · {athlete.followers.toLocaleString()} followers
                </div>
              </div>
              <div
                className={`grid h-8 w-8 place-items-center border ${
                  isFollowing
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                {isFollowing ? <Check className="h-4 w-4" /> : <span className="text-lg">+</span>}
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-6 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {followed.size} selected · optional
      </div>
    </div>
  );
}

function DoneStep({
  name,
  sports,
  goalKm,
  followCount,
  week,
  offered,
  optedOut,
  onToggleChallenge,
}: {
  name: string;
  sports: Set<Sport>;
  goalKm: number;
  followCount: number;
  week: ChallengeWeek | null;
  offered: Challenge[];
  optedOut: Set<string>;
  onToggleChallenge: (challenge: Challenge) => void;
}) {
  const joinedCount = offered.filter((challenge) => !optedOut.has(challenge.id)).length;
  const daysLeft = week?.daysLeftInCurrentWeek ?? 0;

  return (
    <div>
      <StepHeader
        eyebrow={`All set, ${name}`}
        title="Pick your first challenge."
        body="Each weekly challenge is sized so about three in four athletes clear it in their first week. They're open to every athlete on Stride — we've ticked one for each sport you picked, so untick anything you'd rather skip."
      />

      {week?.isNextWeek && (
        <div className="mt-8 border-l-2 border-primary bg-surface-2 px-4 py-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Rolled forward
          </div>
          <p className="mt-1.5 text-sm leading-6 text-foreground/80">
            This week closes in{" "}
            {daysLeft === 0 ? "under a day" : `${daysLeft} day${daysLeft === 1 ? "" : "s"}`}, which
            isn't much of a run-up. You're starting with the week of {fmtDayMonth(week.start)}{" "}
            instead.
          </p>
        </div>
      )}

      <div className="mt-8 grid gap-3">
        {offered.map((challenge) => {
          const joined = !optedOut.has(challenge.id);
          return (
            <button
              key={challenge.id}
              onClick={() => onToggleChallenge(challenge)}
              aria-pressed={joined}
              className={`flex items-center gap-5 border p-4 text-left transition-all ${
                joined
                  ? "border-foreground bg-surface"
                  : "border-border bg-surface-2/60 hover:border-foreground/40"
              }`}
            >
              <div className="w-14 shrink-0">
                <div
                  className={`stat-num text-3xl font-bold leading-none tracking-[-0.03em] ${
                    joined ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {challenge.goalKm}
                </div>
                <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  km
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {challenge.sport !== "Multisport" && <SportBadge sport={challenge.sport} />}
                  <span
                    className={`truncate text-sm font-semibold ${
                      joined ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {challenge.name}
                  </span>
                </div>
                {challenge.startsAt && (
                  <div className="mt-1.5 text-xs text-muted-foreground">
                    {fmtDayMonthLong(challenge.startsAt)} – {fmtDayMonthLong(challenge.endsAt)}
                  </div>
                )}
                <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  {challenge.participants.toLocaleString()} athletes in
                </div>
              </div>

              <div
                className={`grid h-8 w-8 shrink-0 place-items-center border ${
                  joined
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                {joined && <Check className="h-4 w-4" />}
              </div>
            </button>
          );
        })}
      </div>

      {offered.length > 0 ? (
        <div className="mt-6 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {joinedCount} of {offered.length} joined · untick to skip
        </div>
      ) : (
        <div className="mt-8 border border-dashed border-border bg-surface-2/60 px-4 py-5 text-sm text-muted-foreground">
          No weekly challenge is on offer right now. You can join one any time from the Challenges
          page.
        </div>
      )}

      <div className="mt-10 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        Your Stride
      </div>
      <div className="mt-3 grid gap-0 border border-border bg-surface sm:grid-cols-3">
        <RecapCell label="Disciplines">
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SPORT_ORDER.filter((sport) => sports.has(sport)).map((sport) => (
              <SportBadge key={sport} sport={sport} />
            ))}
          </div>
        </RecapCell>
        <RecapCell label="Weekly target" value={`${goalKm} km`} />
        <RecapCell
          label="Following"
          value={`${followCount} athlete${followCount === 1 ? "" : "s"}`}
        />
      </div>

      <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground">
        Your training home is waiting. Record your first effort, scroll through the feed, or build
        the habit one day at a time.
      </p>

      <div className="mt-10 relative overflow-hidden border border-border">
        <img src={DONE_IMG} alt="Runner silhouette at dawn" className="h-56 w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-secondary/80 via-secondary/10 to-transparent" />
        <div className="absolute inset-x-6 bottom-6 text-secondary-foreground">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/80">
            First effort
          </div>
          <div className="mt-1 font-display text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
            The only workout that matters is the next one.
          </div>
        </div>
      </div>
    </div>
  );
}

function RecapCell({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-border p-5 [&:not(:last-child)]:border-b sm:[&:not(:last-child)]:border-b-0 sm:[&:not(:last-child)]:border-r">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
      {children ?? <div className="stat-num mt-2 text-2xl font-bold tracking-tight">{value}</div>}
    </div>
  );
}
