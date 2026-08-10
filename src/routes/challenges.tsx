import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Gauge,
  LoaderCircle,
  ShieldAlert,
  Sparkles,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { usePostHog } from "@posthog/react";
import { AppShell } from "@/components/AppShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  buildChallengeDecision,
  formatChallengeAmount,
  formatDeadline,
  type ChallengeDecision,
} from "@/lib/challenge-decision";
import { joinChallenge, leaveChallenge } from "@/lib/api";
import { CHALLENGES, type Challenge } from "@/lib/mock-data";

export const Route = createFileRoute("/challenges")({
  head: () => ({
    meta: [
      { title: "Challenges — Stride" },
      { name: "description", content: "Review and join Stride training challenges." },
    ],
  }),
  component: ChallengesPage,
});

type Feedback = { type: "success" | "error"; title: string; message: string } | null;

function ChallengesPage() {
  const posthog = usePostHog();
  const [selected, setSelected] = useState<Challenge | null>(null);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [joined, setJoined] = useState<Record<string, boolean>>(
    Object.fromEntries(CHALLENGES.map((challenge) => [challenge.id, Boolean(challenge.joined)])),
  );
  const [participants, setParticipants] = useState<Record<string, number>>(
    Object.fromEntries(CHALLENGES.map((challenge) => [challenge.id, challenge.participants])),
  );

  const joinedCount = Object.values(joined).filter(Boolean).length;

  function selectChallenge(challenge: Challenge) {
    const decision = buildChallengeDecision(challenge);
    setSelected(challenge);
    setFeedback(null);
    setJoining(false);
    setLeaving(false);
    posthog.capture("challenge_reviewed", {
      challenge_id: challenge.id,
      challenge_name: challenge.name,
      difficulty: decision.difficulty,
      eligible: decision.eligible,
      fit: decision.fit,
    });
  }

  async function handleJoin() {
    if (!selected) return;

    setJoining(true);
    setFeedback(null);

    try {
      const result = await joinChallenge(selected.id);
      setJoined((state) => ({ ...state, [selected.id]: result.joined }));
      setParticipants((state) => ({ ...state, [selected.id]: result.participants }));
      setFeedback({
        type: "success",
        title: "You’re in",
        message: `You joined ${selected.name}. Your qualifying ${selected.sport.toLowerCase()} activities count automatically.`,
      });
      posthog.capture("challenge_joined", {
        challenge_id: selected.id,
        challenge_name: selected.name,
        sport: selected.sport,
        goal: selected.goalKm,
        metric_type: selected.metricType,
      });
    } catch (error) {
      posthog.captureException(error);
      setFeedback({
        type: "error",
        title: "Couldn’t join challenge",
        message:
          error instanceof Error
            ? error.message
            : "Stride could not join this challenge. Please try again.",
      });
    } finally {
      setJoining(false);
    }
  }

  async function handleLeave() {
    if (!selected) return;

    setLeaving(true);
    setFeedback(null);

    try {
      const result = await leaveChallenge(selected.id);
      setJoined((state) => ({ ...state, [selected.id]: result.joined }));
      setParticipants((state) => ({ ...state, [selected.id]: result.participants }));
      setFeedback({
        type: "success",
        title: "Challenge left",
        message: `You left ${selected.name}. Future qualifying activities will no longer count toward your participation.`,
      });
      posthog.capture("challenge_left", {
        challenge_id: selected.id,
        challenge_name: selected.name,
        sport: selected.sport,
      });
    } catch (error) {
      posthog.captureException(error);
      setFeedback({
        type: "error",
        title: "Couldn’t leave challenge",
        message:
          error instanceof Error
            ? error.message
            : "Stride could not leave this challenge. Please try again.",
      });
    } finally {
      setLeaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-10 flex flex-col items-start gap-5 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Issue 08 · Choose your next target
          </div>
          <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-[-0.02em]">
            Challenges
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Review the fit, rules, and finish line before you commit.
          </p>
        </div>
        <div className="text-left sm:text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Joined
          </div>
          <div className="stat-num mt-1 text-2xl font-bold">
            {joinedCount} / {CHALLENGES.length}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {CHALLENGES.map((challenge) => {
          const isJoined = joined[challenge.id];
          const decision = buildChallengeDecision(challenge);
          const pct = Math.min(
            100,
            challenge.goalKm > 0 ? (challenge.myProgressKm / challenge.goalKm) * 100 : 0,
          );

          return (
            <article
              key={challenge.id}
              className="group flex flex-col overflow-hidden border border-border bg-surface transition-colors hover:border-foreground/40"
            >
              <div className="relative flex min-h-[180px] flex-col justify-between bg-secondary p-6 text-secondary-foreground">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 opacity-[0.07]"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
                    backgroundSize: "32px 32px",
                  }}
                />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/60">
                    {challenge.sport} · {decision.difficulty}
                  </div>
                  {isJoined ? (
                    <div className="flex items-center gap-1.5 bg-primary px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-primary-foreground">
                      <Check className="h-3 w-3" /> Joined
                    </div>
                  ) : (
                    <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/50">
                      {decision.eligible ? "Open" : "Closed"}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <div className="font-display text-[4rem] font-bold leading-none tracking-[-0.04em] text-secondary-foreground sm:text-[5rem]">
                    {challenge.badge}
                  </div>
                  <div className="mt-3 flex items-baseline justify-between gap-4">
                    <h2 className="font-display text-lg font-semibold tracking-tight text-secondary-foreground/90">
                      {challenge.name}
                    </h2>
                    <span className="stat-num shrink-0 text-base font-semibold text-primary">
                      {formatChallengeAmount(challenge, challenge.goalKm)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-1 flex-col p-6">
                <p className="text-sm leading-6 text-muted-foreground">{decision.description}</p>
                <div className="mt-5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {participants[challenge.id].toLocaleString()} athletes
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" /> {formatDeadline(challenge.endsAt)}
                  </span>
                </div>

                {isJoined && (
                  <div className="mt-5">
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                        Your progress
                      </span>
                      <span className="stat-num text-sm font-semibold">{Math.round(pct)}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => selectChallenge(challenge)}
                  className="group/action mt-6 inline-flex h-11 w-full items-center justify-between border border-border bg-surface px-4 text-sm font-medium transition-colors hover:border-foreground/50 hover:bg-muted"
                >
                  <span>{isJoined ? "View progress" : "Review challenge"}</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover/action:translate-x-0.5" />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setFeedback(null);
          }
        }}
      >
        {selected && (
          <ChallengeDecisionPanel
            challenge={selected}
            decision={buildChallengeDecision(selected)}
            joined={joined[selected.id]}
            participants={participants[selected.id]}
            joining={joining}
            leaving={leaving}
            feedback={feedback}
            onJoin={handleJoin}
            onLeave={handleLeave}
          />
        )}
      </Sheet>
    </AppShell>
  );
}

function ChallengeDecisionPanel({
  challenge,
  decision,
  joined,
  participants,
  joining,
  leaving,
  feedback,
  onJoin,
  onLeave,
}: {
  challenge: Challenge;
  decision: ChallengeDecision;
  joined: boolean;
  participants: number;
  joining: boolean;
  leaving: boolean;
  feedback: Feedback;
  onJoin: () => void;
  onLeave: () => void;
}) {
  const pct = Math.min(
    100,
    challenge.goalKm > 0 ? (challenge.myProgressKm / challenge.goalKm) * 100 : 0,
  );

  return (
    <SheetContent className="w-full gap-0 overflow-y-auto bg-background p-0 sm:max-w-3xl [&>button]:text-secondary-foreground">
      <SheetHeader className="bg-secondary px-7 pb-7 pt-8 text-left text-secondary-foreground">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/60">
          Challenge decision · {challenge.sport}
        </div>
        <div className="flex items-end justify-between gap-5 pt-5">
          <div>
            <div className="font-display text-5xl font-bold leading-none tracking-[-0.04em] text-primary">
              {challenge.badge}
            </div>
            <SheetTitle className="mt-3 font-display text-2xl font-bold tracking-tight text-secondary-foreground">
              {challenge.name}
            </SheetTitle>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-secondary-foreground/60">
              Athletes in
            </div>
            <div className="stat-num mt-1 text-lg font-semibold">
              {participants.toLocaleString()}
            </div>
          </div>
        </div>
        <SheetDescription className="pt-2 leading-6 text-secondary-foreground/70">
          {decision.description}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-7 px-7 py-7">
        {joined && (
          <section className="border border-border bg-surface p-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <SectionLabel>Your progress</SectionLabel>
                <div className="stat-num mt-2 text-2xl font-bold">
                  {formatChallengeAmount(challenge, challenge.myProgressKm)} /{" "}
                  {formatChallengeAmount(challenge, challenge.goalKm)}
                </div>
              </div>
              <span className="stat-num text-lg font-semibold text-primary">
                {Math.round(pct)}%
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden bg-muted">
              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </section>
        )}

        <section className="grid grid-cols-1 border border-border bg-surface sm:grid-cols-2">
          <DecisionStat
            icon={Sparkles}
            label="Your fit"
            value={decision.fit}
            detail={decision.fitReason}
          />
          <DecisionStat
            icon={Gauge}
            label="Difficulty"
            value={decision.difficulty}
            detail={decision.difficultyDetail}
            border
          />
        </section>

        <section>
          <SectionLabel>{joined ? "Participation" : "Eligibility"}</SectionLabel>
          {joined ? (
            <Alert className="mt-3 rounded-none border-pr/40 bg-pr/10">
              <CheckCircle2 />
              <AlertTitle>You’re participating</AlertTitle>
              <AlertDescription>
                Qualifying activities count automatically until {formatDeadline(challenge.endsAt)}.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert
              variant={decision.eligible ? "default" : "destructive"}
              className={
                decision.eligible
                  ? "mt-3 rounded-none border-pr/40 bg-pr/10"
                  : "mt-3 rounded-none bg-destructive/5"
              }
            >
              {decision.eligible ? <CheckCircle2 /> : <ShieldAlert />}
              <AlertTitle>{decision.eligible ? "You can join" : "Not eligible"}</AlertTitle>
              <AlertDescription>{decision.eligibility}</AlertDescription>
            </Alert>
          )}
        </section>

        <section className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2">
          <div className="bg-surface p-5">
            <Target className="h-4 w-4 text-primary" />
            <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Goal
            </div>
            <div className="stat-num mt-1 text-2xl font-bold">
              {formatChallengeAmount(challenge, challenge.goalKm)}
            </div>
          </div>
          <div className="bg-surface p-5">
            <CalendarDays className="h-4 w-4 text-primary" />
            <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Deadline
            </div>
            <div className="stat-num mt-1 text-2xl font-bold">
              {formatDeadline(challenge.endsAt)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {decision.eligible ? `${decision.daysRemaining} days remaining` : "Entry closed"}
            </div>
          </div>
        </section>

        <section>
          <SectionLabel>How activities count</SectionLabel>
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {decision.countingRules.map((rule) => (
              <li key={rule} className="flex gap-3 py-3 text-sm leading-6">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </section>

        {feedback?.type === "success" && (
          <Alert className="rounded-none border-pr/40 bg-pr/10">
            <CheckCircle2 />
            <AlertTitle>{feedback.title}</AlertTitle>
            <AlertDescription>{feedback.message}</AlertDescription>
          </Alert>
        )}

        {feedback?.type === "error" && (
          <Alert variant="destructive" className="rounded-none bg-destructive/5">
            <ShieldAlert />
            <AlertTitle>{feedback.title}</AlertTitle>
            <AlertDescription>{feedback.message}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-border bg-background/95 px-7 py-5 backdrop-blur">
        {joined ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="flex h-12 items-center justify-center gap-2 bg-secondary px-5 text-sm font-medium text-secondary-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Joined · activities count
              automatically
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  disabled={leaving}
                  className="inline-flex h-12 items-center justify-center gap-2 border border-destructive/40 bg-background px-5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/5 disabled:opacity-50"
                >
                  {leaving ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" /> Leaving
                    </>
                  ) : (
                    "Leave challenge"
                  )}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Leave {challenge.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Future activities will stop counting toward your participation. You can join
                    again before the deadline.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep challenge</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onLeave}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Leave challenge
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
          <button
            type="button"
            onClick={onJoin}
            disabled={joining || !decision.eligible}
            className="group inline-flex h-12 w-full items-center justify-center gap-2 bg-primary px-6 text-sm font-medium text-primary-foreground transition-all hover:gap-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {joining ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" /> Joining
              </>
            ) : decision.eligible ? (
              <>
                Join challenge
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            ) : (
              <>
                <ShieldAlert className="h-4 w-4" /> Challenge closed
              </>
            )}
          </button>
        )}
        {!joined && (
          <p className="mt-2 text-center font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            Joining is free · leave any time before the deadline
          </p>
        )}
      </div>
    </SheetContent>
  );
}

function DecisionStat({
  icon: Icon,
  label,
  value,
  detail,
  border,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  border?: boolean;
}) {
  return (
    <div className={`p-5 ${border ? "border-t border-border sm:border-l sm:border-t-0" : ""}`}>
      <Icon className="h-4 w-4 text-primary" />
      <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-display text-lg font-bold tracking-tight">{value}</div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
      {children}
    </div>
  );
}
