import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bike,
  Check,
  LoaderCircle,
  Mountain,
  PersonStanding,
  Waves,
} from "lucide-react";
import { ATHLETES, ME } from "@/lib/mock-data";
import { toggleAthleteFollow } from "@/lib/api";
import { usePostHog } from "@posthog/react";

export const ONBOARDING_STORAGE_KEY = "stride:onboarding:v1";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [{ title: "Welcome — Stride" }],
  }),
  component: OnboardingPage,
});

type Sport = "run" | "ride" | "swim" | "multi";

const SPORTS: { id: Sport; label: string; hint: string; icon: typeof Bike }[] = [
  { id: "run", label: "Run", hint: "Road · track · trail", icon: PersonStanding },
  { id: "ride", label: "Ride", hint: "Road · gravel · MTB", icon: Bike },
  { id: "swim", label: "Swim", hint: "Pool · open water", icon: Waves },
  { id: "multi", label: "Multisport", hint: "Triathlon · hybrid", icon: Mountain },
];

const GOAL_PRESETS = [15, 30, 50, 80, 120];

const DONE_IMG =
  "https://images.unsplash.com/photo-1502904550040-7534597429ae?w=1200&q=80&auto=format&fit=crop";

const STEPS = ["Discipline", "Weekly target", "Your circle", "Ready"] as const;

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
  const [sport, setSport] = useState<Sport | null>(null);
  const [goalKm, setGoalKm] = useState(30);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const suggested = useMemo(
    () => ATHLETES.filter((athlete) => athlete.id !== "me" && athlete.id !== ME.id).slice(0, 6),
    [],
  );

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        <LoaderCircle className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const canAdvance = () => {
    if (step === 0) return sport !== null;
    if (step === 1) return goalKm > 0;
    return true;
  };

  async function finish() {
    setSaving(true);
    // If the user skipped the follow step, auto-follow a starter set so the feed
    // isn't empty on first entry.
    const baseline = suggested.slice(0, 4).map((athlete) => athlete.id);
    const ids = followed.size > 0 ? Array.from(followed) : baseline;
    try {
      await Promise.all(ids.map((id) => toggleAthleteFollow(id).catch(() => null)));
      posthog.capture("onboarding_completed", {
        sport,
        goal_km: goalKm,
        follow_count: ids.length,
        auto_followed: followed.size === 0,
      });
    } finally {
      localStorage.setItem(
        ONBOARDING_STORAGE_KEY,
        JSON.stringify({
          completed: true,
          sport,
          goalKm,
          followed: ids,
          autoFollowed: followed.size === 0,
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
              sport={sport}
              setSport={setSport}
              name={ME.name.split(" ")[0] || "athlete"}
            />
          )}
          {step === 1 && <GoalStep goalKm={goalKm} setGoalKm={setGoalKm} sport={sport} />}
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
              sport={sport}
              goalKm={goalKm}
              followCount={followed.size}
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
  sport,
  setSport,
  name,
}: {
  sport: Sport | null;
  setSport: (s: Sport) => void;
  name: string;
}) {
  return (
    <div>
      <StepHeader
        eyebrow={`Welcome, ${name}`}
        title="What's your primary discipline?"
        body="We'll tune your feed, challenges, and training views around how you move. You can adjust this anytime."
      />
      <div className="mt-10 grid grid-cols-2 gap-3">
        {SPORTS.map((item) => {
          const Icon = item.icon;
          const active = sport === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setSport(item.id)}
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
                <div className="font-display text-xl font-bold tracking-tight">{item.label}</div>
                <div
                  className={`mt-1 font-mono text-[10px] uppercase tracking-[0.22em] ${
                    active ? "text-secondary-foreground/70" : "text-muted-foreground"
                  }`}
                >
                  {item.hint}
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
    </div>
  );
}

function GoalStep({
  goalKm,
  setGoalKm,
  sport,
}: {
  goalKm: number;
  setGoalKm: (n: number) => void;
  sport: Sport | null;
}) {
  const unitLabel = sport === "swim" ? "km in the pool" : "km per week";
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
  sport,
  goalKm,
  followCount,
}: {
  name: string;
  sport: Sport | null;
  goalKm: number;
  followCount: number;
}) {
  const sportLabel = SPORTS.find((s) => s.id === sport)?.label ?? "Athlete";
  return (
    <div>
      <StepHeader
        eyebrow="All set"
        title={`You're ready, ${name}.`}
        body="Your training home is waiting. Record your first effort, scroll through the feed, or build the habit one day at a time."
      />

      <div className="mt-10 grid gap-0 border border-border bg-surface sm:grid-cols-3">
        <RecapCell label="Discipline" value={sportLabel} />
        <RecapCell label="Weekly target" value={`${goalKm} km`} />
        <RecapCell
          label="Following"
          value={`${followCount} athlete${followCount === 1 ? "" : "s"}`}
        />
      </div>

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

function RecapCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border p-5 [&:not(:last-child)]:border-b sm:[&:not(:last-child)]:border-b-0 sm:[&:not(:last-child)]:border-r">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
      <div className="stat-num mt-2 text-2xl font-bold tracking-tight">{value}</div>
    </div>
  );
}
