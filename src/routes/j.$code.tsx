import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { usePostHog } from "@posthog/react";
import { ArrowLeft, ArrowRight, Clock, LoaderCircle, MapPin, Mountain, Zap } from "lucide-react";
import { RouteMap } from "@/components/RouteMap";
import { SportBadge } from "@/components/SportBadge";
import { Stat } from "@/components/Stat";
import { fmtDate, fmtDuration, fmtPace } from "@/lib/mock-data";
import { claimInvite, fetchInvite, register, ApiError } from "@/lib/api";
import {
  isEditedClaim,
  splitDuration,
  sportNoun,
  toTotalSeconds,
  type PublicInvite,
} from "@/lib/invites";

export const Route = createFileRoute("/j/$code")({
  loader: async ({ params }) => {
    const invite = await fetchInvite(params.code).catch(() => {
      throw notFound();
    });

    return { invite };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.invite.inviter.name} invited you — Stride` },
          {
            name: "description",
            content: `Log the ${sportNoun(loaderData.invite.activity.sport)} you did together.`,
          },
        ]
      : [],
  }),
  component: InvitePage,
  notFoundComponent: () => (
    <InviteMessage
      eyebrow="Invite link"
      title="This link doesn't exist."
      body="Double-check the link you were sent, or ask whoever shared it to send a new one."
    />
  ),
});

type Step = "landing" | "join" | "log";

function InvitePage() {
  const { invite } = Route.useLoaderData() as { invite: PublicInvite };
  const posthog = usePostHog();
  const [step, setStep] = useState<Step>("landing");

  // Top of the referral funnel. Fires for every open, including the states that stop
  // short of a claim, so open → signup → claim conversion is measurable rather than
  // inferred from the claims alone.
  useEffect(() => {
    posthog.capture("invite_link_opened", {
      invite_code: invite.code,
      sport: invite.activity.sport,
      invite_state: invite.state,
      is_inviter: invite.isInviter,
      already_claimed: invite.viewerClaimActivityId !== null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invite.code]);

  if (invite.state !== "open") {
    return (
      <InviteMessage
        eyebrow="Invite link"
        title="This link has expired."
        body={`Ask ${invite.inviter.name} to send a fresh one — the activity is still on their log.`}
      />
    );
  }

  if (invite.viewerClaimActivityId) {
    return (
      <InviteMessage
        eyebrow="Already logged"
        title="You've already logged this one."
        body="It's on your record. Nothing else to do here."
        action={{ to: invite.viewerClaimActivityId, label: "See your activity" }}
      />
    );
  }

  if (invite.isInviter) {
    return (
      <InviteMessage
        eyebrow="Your invite"
        title="This is your own link."
        body="The activity is already on your log. Send this link to the people you trained with."
      />
    );
  }

  if (step === "log") {
    return <ClaimForm invite={invite} onBack={() => setStep("landing")} />;
  }

  if (step === "join") {
    return (
      <QuickStart
        invite={invite}
        onBack={() => setStep("landing")}
        onJoined={() => setStep("log")}
      />
    );
  }

  return <Landing invite={invite} onStart={() => setStep("join")} />;
}

/* -----------------------------------------------------------------------
 *   Shared chrome — these pages are reached with no session, so they can't
 *   use AppShell (it dereferences ME).
 * ---------------------------------------------------------------------*/
function InviteHeader({ right }: { right?: string }) {
  return (
    <header className="flex items-center justify-between px-6 py-6 lg:px-12">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-sm bg-secondary font-display text-base font-bold text-secondary-foreground">
          S
        </div>
        <div className="leading-tight">
          <div className="font-display text-lg font-semibold tracking-tight">Stride</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Endurance
          </div>
        </div>
      </div>
      {right && (
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {right}
        </div>
      )}
    </header>
  );
}

function InviteMessage({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body: string;
  action?: { to: string; label: string };
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <InviteHeader />
      <main className="flex flex-1 items-center px-6 pb-16 lg:px-12">
        <div className="max-w-lg">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {eyebrow}
          </div>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-[-0.02em]">
            {title}
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">{body}</p>
          {action ? (
            <Link
              to="/activity/$id"
              params={{ id: action.to }}
              className="mt-8 inline-flex h-11 items-center gap-2 bg-primary px-6 text-sm font-medium text-primary-foreground"
            >
              {action.label} <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <Link
              to="/"
              className="mt-8 inline-flex h-11 items-center gap-2 border border-border px-6 text-sm font-medium hover:bg-muted"
            >
              Go to Stride
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}

/** A slim reminder of what's waiting, so signing up never feels like a detour. */
function PinnedActivity({ invite }: { invite: PublicInvite }) {
  return (
    <div className="flex items-center gap-4 border-b border-border bg-surface-2 px-6 py-4 lg:px-12">
      <div className="h-12 w-16 shrink-0 overflow-hidden border border-border">
        <RouteMap
          seed={invite.activity.routeSeed}
          width={160}
          height={120}
          className="h-full w-full"
          showScale={false}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Waiting for you
        </div>
        <div className="truncate text-sm font-medium">
          {invite.activity.title} · {invite.activity.distanceKm.toFixed(2)} km
        </div>
      </div>
      <div className="hidden font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground sm:block">
        From {invite.inviter.name}
      </div>
    </div>
  );
}

/* -----------------------------------------------------------------------
 *   Step 1 — the landing a recipient hits straight from a text or email
 * ---------------------------------------------------------------------*/
function Landing({ invite, onStart }: { invite: PublicInvite; onStart: () => void }) {
  const noun = sportNoun(invite.activity.sport);
  const { activity, inviter } = invite;

  return (
    <div className="grid min-h-screen bg-background text-foreground lg:grid-cols-[1.05fr_0.95fr]">
      <div className="flex min-h-screen flex-col">
        <InviteHeader right={`Shared link · ${invite.code}`} />

        <main className="flex flex-1 items-center px-6 pb-10 lg:px-12">
          <section className="w-full max-w-xl">
            <div className="flex items-center gap-3">
              <img
                src={inviter.avatar}
                alt={inviter.name}
                className="h-10 w-10 rounded-full object-cover ring-1 ring-border"
              />
              <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                {inviter.name} invited you
              </span>
            </div>

            <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-[-0.02em] sm:text-5xl">
              Take credit for <em className="not-italic text-primary">the {noun} you did.</em>
            </h1>
            <p className="mt-5 text-base leading-7 text-muted-foreground">
              This is the {noun} you did together on {fmtDate(activity.date)}. Your copy is already
              filled in with the distance, time, and climbing. Post it to your own record in a
              couple of taps.
            </p>

            <div className="mt-8 grid grid-cols-3 gap-6 border-y border-border py-6">
              <Stat label="Distance" value={activity.distanceKm.toFixed(2)} unit="km" emphasis />
              <Stat label="Time" value={fmtDuration(activity.movingSeconds)} />
              <Stat label="Elevation" value={activity.elevationM} unit="m" />
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                onClick={onStart}
                className="group inline-flex items-center justify-center gap-2 bg-primary px-6 py-3.5 text-sm font-medium text-primary-foreground transition-all hover:gap-3"
              >
                Log my {noun}{" "}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Quick start · no credit card
              </span>
            </div>

            <div className="mt-10 flex items-center gap-3 border-t border-border pt-6">
              <img
                src={inviter.avatar}
                alt={inviter.name}
                className="h-8 w-8 rounded-full object-cover ring-1 ring-border"
              />
              <span className="text-sm text-muted-foreground">
                {inviter.name} logged theirs on {fmtDate(activity.date)}
                {invite.claimCount > 0
                  ? ` · ${invite.claimCount} ${invite.claimCount === 1 ? "other has" : "others have"} logged it`
                  : ""}
              </span>
            </div>
          </section>
        </main>
      </div>

      <aside className="relative hidden lg:block">
        <RouteMap
          seed={activity.routeSeed}
          width={900}
          height={1200}
          className="absolute inset-0 h-full w-full"
          variant="dark"
          distanceKm={activity.distanceKm}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-secondary/70 via-secondary/10 to-transparent" />

        <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
          <div className="flex items-center gap-2 self-start bg-background/90 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground backdrop-blur">
            <MapPin className="h-3 w-3 text-primary" /> {inviter.city} · {fmtDate(activity.date)}
          </div>

          <div className="bg-background/95 p-6 backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Shared effort
                </div>
                <div className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
                  {activity.title}
                </div>
              </div>
              <SportBadge sport={activity.sport} />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-4 border-t border-border pt-4">
              <MiniStat icon={Clock} label="Time" value={fmtDuration(activity.movingSeconds)} />
              <MiniStat
                icon={Zap}
                label={activity.sport === "Ride" ? "Speed" : "Pace"}
                value={
                  activity.sport === "Ride"
                    ? (activity.avgSpeedKmh?.toFixed(1) ?? "—")
                    : activity.avgPaceSecPerKm
                      ? fmtPace(activity.avgPaceSecPerKm).replace("/km", "")
                      : "—"
                }
              />
              <MiniStat icon={Mountain} label="Elev" value={`${activity.elevationM}`} />
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="stat-num mt-1 text-lg font-bold text-foreground">{value}</div>
    </div>
  );
}

/* -----------------------------------------------------------------------
 *   Step 2 — quick start. One screen, three fields, straight into the log.
 * ---------------------------------------------------------------------*/
function QuickStart({
  invite,
  onBack,
  onJoined,
}: {
  invite: PublicInvite;
  onBack: () => void;
  onJoined: () => void;
}) {
  const posthog = usePostHog();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isValid = name.trim().length > 0 && email.trim().length > 0 && password.length >= 8;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid || busy) return;

    setBusy(true);
    setError("");
    try {
      await register(name.trim(), email.trim(), password);
      posthog.capture("invite_signup_completed", { invite_code: invite.code });
      onJoined();
    } catch (err) {
      posthog.captureException(err);
      if (err instanceof ApiError && err.status === 409) {
        setError("An account already exists for that email. Sign in and reopen this link.");
      } else if (err instanceof ApiError && err.status === 400) {
        setError("Name, email, and a password of at least 8 characters are required.");
      } else {
        setError("Couldn't create your account. Try again.");
      }
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <InviteHeader right="Quick start" />
      <PinnedActivity invite={invite} />

      <main className="flex flex-1 items-start px-6 py-10 lg:px-12">
        <div className="w-full max-w-md">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Two minutes, tops
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold leading-tight tracking-[-0.02em]">
            Create your account.
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Your copy of the {sportNoun(invite.activity.sport)} is waiting on the other side. You
            can change any of the numbers before you post it.
          </p>

          {error && (
            <div className="mt-6 border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Your name" value={name} onChange={setName} placeholder="Ana Whitfield" />
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="ana@example.com"
            />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="At least 8 characters"
            />

            <button
              type="submit"
              disabled={!isValid || busy}
              className="group inline-flex h-12 w-full items-center justify-center gap-2 bg-primary px-6 text-sm font-medium text-primary-foreground transition-all hover:gap-3 disabled:opacity-50"
            >
              {busy ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" /> Creating your account
                </>
              ) : (
                <>
                  Create account &amp; see my {sportNoun(invite.activity.sport)}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-xs leading-5 text-muted-foreground">
            Already on Stride?{" "}
            <Link to="/auth" className="text-foreground underline">
              Sign in
            </Link>{" "}
            and reopen this link.
          </p>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="block">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 w-full border border-border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground"
      />
    </label>
  );
}

/* -----------------------------------------------------------------------
 *   Step 3 — the prefilled activity, ready to post
 * ---------------------------------------------------------------------*/
function ClaimForm({ invite, onBack }: { invite: PublicInvite; onBack: () => void }) {
  const posthog = usePostHog();
  const source = invite.activity;
  const initial = splitDuration(source.movingSeconds);

  const [title, setTitle] = useState(source.title);
  const [distance, setDistance] = useState(source.distanceKm.toFixed(2));
  const [hours, setHours] = useState(String(initial.hours));
  const [minutes, setMinutes] = useState(String(initial.minutes));
  const [seconds, setSeconds] = useState(String(initial.seconds));
  const [elevation, setElevation] = useState(String(source.elevationM));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const noun = sportNoun(source.sport);
  const distanceKm = Number(distance) || 0;
  const totalSeconds = toTotalSeconds(hours, minutes, seconds);
  const elevationM = Number(elevation) || 0;
  const isValid = distanceKm > 0 && totalSeconds > 0;

  const edited = isEditedClaim(
    {
      distanceKm: source.distanceKm,
      movingSeconds: source.movingSeconds,
      elevationM: source.elevationM,
    },
    { distanceKm, movingSeconds: totalSeconds, elevationM },
  );

  const derived =
    distanceKm > 0 && totalSeconds > 0
      ? source.sport === "Ride"
        ? `${(distanceKm / (totalSeconds / 3600)).toFixed(1)} km/h`
        : fmtPace(totalSeconds / distanceKm)
      : "—";

  const save = async () => {
    if (!isValid || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await claimInvite(invite.code, {
        distanceKm: Math.round(distanceKm * 100) / 100,
        movingSeconds: totalSeconds,
        elevationM,
        title: title.trim() || source.title,
        description: note.trim() || undefined,
      });
      posthog.capture("invite_claimed", {
        invite_code: invite.code,
        sport: source.sport,
        was_edited: result.wasEdited,
      });
      // Full load rather than a client navigation: this page was reached without a
      // session, so the app store is empty and bootstrap needs to run for the
      // activity page to have an athlete to render.
      window.location.assign(`/activity/${result.activityId}`);
    } catch (err) {
      posthog.captureException(err);
      setError(err instanceof ApiError ? err.message : "Couldn't log this activity. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <InviteHeader right="Account created" />
      <PinnedActivity invite={invite} />

      <main className="flex-1 px-6 py-10 lg:px-12">
        <div className="mx-auto w-full max-w-2xl">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Your first activity
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold leading-tight tracking-[-0.02em]">
            It's already filled in.
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Pulled from {invite.inviter.name}'s {noun} on {fmtDate(source.date)}. Change anything
            your watch disagrees with, then post it to your record.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-border bg-secondary p-5 text-secondary-foreground">
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/70">
                Prefilled from {invite.inviter.name}'s {noun}
              </div>
              <div className="num mt-2 text-sm">
                {source.distanceKm.toFixed(2)} km · {fmtDuration(source.movingSeconds)} ·{" "}
                {source.elevationM} m
              </div>
            </div>
            <span
              className={`px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] ${
                edited ? "bg-primary text-primary-foreground" : "bg-surface-2 text-foreground"
              }`}
            >
              {edited ? "Edited" : "Matched"}
            </span>
          </div>

          <section className="mt-6 border border-border bg-surface">
            <div className="border-b border-border p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                The essentials
              </div>
              <div className="mt-4 grid gap-6 sm:grid-cols-2">
                <label className="block">
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    Distance
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={distance}
                      onChange={(event) => setDistance(event.target.value)}
                      className="stat-num h-12 w-full border border-border bg-background pl-3 pr-12 text-lg font-semibold outline-none transition-colors focus:border-foreground"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                      km
                    </span>
                  </div>
                </label>

                <div>
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    Duration
                  </div>
                  <div className="grid grid-cols-3 border border-border">
                    <DurationCell label="hh" value={hours} onChange={setHours} max={23} />
                    <DurationCell
                      label="mm"
                      value={minutes}
                      onChange={setMinutes}
                      max={59}
                      border
                    />
                    <DurationCell
                      label="ss"
                      value={seconds}
                      onChange={setSeconds}
                      max={59}
                      border
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  {source.sport === "Ride" ? "Avg speed" : "Avg pace"}
                </div>
                <div className="stat-num text-lg font-semibold">{derived}</div>
              </div>
            </div>

            <div className="border-b border-border p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Details
              </div>
              <div className="mt-4 space-y-4">
                <Field label="Title" value={title} onChange={setTitle} placeholder={source.title} />
                <label className="block">
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    Elevation gain
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step="1"
                      value={elevation}
                      onChange={(event) => setElevation(event.target.value)}
                      className="stat-num h-12 w-full border border-border bg-background pl-3 pr-12 text-lg font-semibold outline-none transition-colors focus:border-foreground"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                      m
                    </span>
                  </div>
                </label>
                <label className="block">
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    Note
                  </div>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    placeholder="How did it feel?"
                    className="w-full resize-none border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-foreground"
                  />
                </label>
              </div>
            </div>

            {error && (
              <div className="border-b border-destructive/30 bg-destructive/8 px-6 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between gap-4 p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                {isValid ? "Ready to log" : "Fill distance and time"}
              </div>
              <button
                onClick={save}
                disabled={!isValid || busy}
                className="group inline-flex h-11 items-center gap-2 bg-primary px-6 text-sm font-medium text-primary-foreground transition-all hover:gap-3 disabled:opacity-50"
              >
                {busy ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" /> Logging
                  </>
                ) : (
                  <>
                    Log this {noun}{" "}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function DurationCell({
  label,
  value,
  onChange,
  max,
  border,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  border?: boolean;
}) {
  return (
    <label className={`flex items-center gap-2 px-3 ${border ? "border-l border-border" : ""}`}>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0"
        className="stat-num h-12 w-full bg-transparent text-lg font-semibold outline-none"
      />
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </span>
    </label>
  );
}
