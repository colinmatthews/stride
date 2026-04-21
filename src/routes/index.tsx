import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { usePostHog } from "@posthog/react";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  MapPin,
  Trophy,
  TrendingUp,
  Users,
} from "lucide-react";
import { ACTIVITIES, ATHLETES, CHALLENGES, ME, fmtDuration, getAthlete } from "@/lib/mock-data";
import { AppShell } from "@/components/AppShell";
import { ActivityCard } from "@/components/ActivityCard";
import { toggleAthleteFollow } from "@/lib/api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Stride — Train with momentum" },
      {
        name: "description",
        content:
          "A training home for runners, riders, and endurance athletes who want clearer progress, better community, and more consistent momentum.",
      },
    ],
  }),
  component: Index,
});

const FILTERS = ["Following", "Clubs", "You"] as const;
type Filter = (typeof FILTERS)[number];

function Index() {
  if (!ME.id) {
    return <LandingPage />;
  }

  return <FeedPage />;
}

function FeedPage() {
  const posthog = usePostHog();
  const [filter, setFilter] = useState<Filter>("Following");
  const visible = useMemo(() => {
    if (filter === "You") return ACTIVITIES.filter((activity) => activity.athleteId === "me");
    if (filter === "Clubs")
      return ACTIVITIES.filter((activity) => activity.athleteId !== "me").slice(0, 8);
    return ACTIVITIES.filter(
      (activity) =>
        activity.athleteId === "me" || Boolean(getAthlete(activity.athleteId).isFollowing),
    ).slice(0, 20);
  }, [filter]);

  const myWeekKm = ACTIVITIES.filter((activity) => activity.athleteId === "me")
    .slice(0, 5)
    .reduce((sum, activity) => sum + activity.distanceKm, 0);
  const myWeekTime = ACTIVITIES.filter((activity) => activity.athleteId === "me")
    .slice(0, 5)
    .reduce((sum, activity) => sum + activity.movingSeconds, 0);
  const myWeekElev = ACTIVITIES.filter((activity) => activity.athleteId === "me")
    .slice(0, 5)
    .reduce((sum, activity) => sum + activity.elevationM, 0);

  const suggested = ATHLETES.filter((athlete) => athlete.id !== "me").slice(0, 4);
  const myChallenges = CHALLENGES.filter((challenge) => challenge.joined);

  return (
    <AppShell>
      <div className="grid grid-cols-[1fr_320px] gap-8">
        <div className="min-w-0">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Welcome back, {ME.name.split(" ")[0]}</p>
              <h1 className="mt-1 text-3xl font-display font-bold tracking-tight">Your feed</h1>
            </div>
            <div className="flex gap-1 rounded-md bg-surface-2 p-1">
              {FILTERS.map((filterName) => (
                <button
                  key={filterName}
                  onClick={() => {
                    setFilter(filterName);
                    posthog.capture("feed_filter_changed", { filter: filterName });
                  }}
                  className={`rounded px-3 py-1.5 text-sm transition-colors ${
                    filter === filterName
                      ? "bg-surface text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {filterName}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            {visible.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} />
            ))}
          </div>
        </div>

        <aside className="space-y-6">
          <section className="rounded-xl bg-secondary p-5 text-secondary-foreground">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] opacity-70">
              <TrendingUp className="h-3.5 w-3.5" /> Your week
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div>
                <div className="stat-num text-2xl text-primary">{myWeekKm.toFixed(0)}</div>
                <div className="text-[11px] uppercase tracking-wider opacity-70">km</div>
              </div>
              <div>
                <div className="stat-num text-2xl">{fmtDuration(myWeekTime).split(":")[0]}h</div>
                <div className="text-[11px] uppercase tracking-wider opacity-70">time</div>
              </div>
              <div>
                <div className="stat-num text-2xl">{myWeekElev.toLocaleString()}</div>
                <div className="text-[11px] uppercase tracking-wider opacity-70">m elev</div>
              </div>
            </div>
            <Link
              to="/training"
              className="mt-4 inline-flex items-center gap-1 text-xs opacity-80 hover:opacity-100"
            >
              See training log <ChevronRight className="h-3 w-3" />
            </Link>
          </section>

          <section className="rounded-xl border border-border bg-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-base font-semibold">
                <Trophy className="h-4 w-4 text-primary" /> Your challenges
              </h3>
              <Link
                to="/challenges"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                View all
              </Link>
            </div>
            <ul className="space-y-3">
              {myChallenges.map((challenge) => {
                const pct = Math.min(100, (challenge.myProgressKm / challenge.goalKm) * 100);
                return (
                  <li key={challenge.id}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate font-medium">
                        {challenge.badge} {challenge.name}
                      </span>
                      <span className="num text-xs text-muted-foreground">{Math.round(pct)}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-xl border border-border bg-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-base font-semibold">
                <Users className="h-4 w-4 text-primary" /> Suggested athletes
              </h3>
            </div>
            <ul className="space-y-3">
              {suggested.map((athlete) => (
                <li key={athlete.id} className="flex items-center gap-3">
                  <Link to="/athlete/$id" params={{ id: athlete.id }} className="shrink-0">
                    <img
                      src={athlete.avatar}
                      alt={athlete.name}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/athlete/$id"
                      params={{ id: athlete.id }}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {athlete.name}
                    </Link>
                    <div className="truncate text-xs text-muted-foreground">
                      {athlete.city} · {athlete.followers} followers
                    </div>
                  </div>
                  <FollowButton id={athlete.id} />
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}

const HERO_IMG =
  "https://images.unsplash.com/photo-1486218119243-13883505764c?w=1400&q=80&auto=format&fit=crop";
const FEATURE_1_IMG =
  "https://images.unsplash.com/photo-1502904550040-7534597429ae?w=900&q=80&auto=format&fit=crop";
const FEATURE_2_IMG =
  "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=900&q=80&auto=format&fit=crop";
const FEATURE_3_IMG =
  "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=900&q=80&auto=format&fit=crop";
const TESTIMONIAL_IMG =
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&q=80&auto=format&fit=crop";
const CTA_IMG =
  "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=1800&q=80&auto=format&fit=crop";

const MARQUEE_ITEMS = [
  "Portland",
  "Chamonix",
  "Boulder",
  "Girona",
  "Kyoto",
  "Cape Town",
  "Queenstown",
  "Flagstaff",
  "Bergen",
  "Boulder",
  "São Paulo",
  "Reykjavík",
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70">
        <div className="mx-auto flex w-full max-w-[1320px] items-center justify-between px-6 py-5 lg:px-10">
          <Link to="/" className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-sm bg-secondary font-display text-base font-bold text-secondary-foreground">
              S
            </div>
            <div className="leading-tight">
              <div className="font-display text-lg font-semibold tracking-tight">Stride</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Endurance · Est. 2024
              </div>
            </div>
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            <a
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              href="#features"
            >
              Training
            </a>
            <a
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              href="#segments"
            >
              Segments
            </a>
            <a
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              href="#proof"
            >
              Athletes
            </a>
          </nav>
          <div className="flex items-center gap-1.5">
            <Link
              to="/auth"
              className="hidden px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground transition-opacity hover:opacity-90"
            >
              Start training <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1320px] px-6 pb-24 lg:px-10">
        {/* HERO */}
        <section className="grid gap-10 pt-10 pb-14 lg:grid-cols-12 lg:gap-12 lg:pt-16 lg:pb-20">
          <div className="lg:col-span-6 xl:col-span-7">
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-foreground/40" />
              <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Issue 01 · Training with purpose
              </span>
            </div>
            <h1 className="mt-7 font-display text-5xl font-bold leading-[1.02] tracking-[-0.03em] text-balance sm:text-6xl lg:text-[5.25rem]">
              Train with the <em className="not-italic text-primary">kind of clarity</em> that makes
              every week count.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground">
              Stride is a training home for runners, riders, and endurance athletes. Your efforts,
              segments, and community in one focused place — so progress stays visible and the
              streak stays alive.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                to="/auth"
                className="group inline-flex items-center justify-center gap-2 bg-primary px-6 py-3.5 text-sm font-medium text-primary-foreground transition-all hover:gap-3"
              >
                Create your account{" "}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/auth"
                className="inline-flex items-center justify-center gap-2 px-2 py-3 text-sm font-medium text-foreground underline-offset-4 transition-colors hover:underline"
              >
                I already have an account
              </Link>
            </div>
            <div className="mt-12 grid grid-cols-3 gap-6 border-t border-border pt-8">
              <Stat value="4.8×" label="More consistent after 8 weeks" />
              <Stat value="52,400" label="Segment efforts analyzed" />
              <Stat value="280K+" label="Athletes on Stride" />
            </div>
          </div>

          <div className="relative lg:col-span-6 xl:col-span-5">
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
              <img
                src={HERO_IMG}
                alt="Trail runner on a mountain ridge at dawn"
                className="h-full w-full object-cover"
                loading="eager"
              />
              {/* subtle vignette for text legibility */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />

              <div className="absolute left-4 top-4 flex items-center gap-2 bg-background/90 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground backdrop-blur">
                <MapPin className="h-3 w-3 text-primary" /> Cascade Ridge · 06:12
              </div>

              <div className="absolute inset-x-4 bottom-4 bg-background/95 p-4 backdrop-blur">
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                      This week
                    </div>
                    <div className="mt-1 font-display text-3xl font-bold tracking-tight">
                      74.6 <span className="text-base font-medium text-muted-foreground">km</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                      Readiness
                    </div>
                    <div className="mt-1 flex items-center justify-end gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[var(--pr)]" />
                      <span className="font-display text-base font-semibold">High</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex h-1.5 overflow-hidden bg-muted">
                  <div className="h-full bg-primary" style={{ width: "62%" }} />
                  <div className="h-full bg-foreground/60" style={{ width: "22%" }} />
                  <div className="h-full bg-foreground/25" style={{ width: "16%" }} />
                </div>
                <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  <span>Easy 62%</span>
                  <span>Threshold 22%</span>
                  <span>VO₂ 16%</span>
                </div>
              </div>
            </div>

            <div className="absolute -left-4 -top-4 hidden bg-foreground px-3 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-background sm:block">
              Live training feed
            </div>
          </div>
        </section>

        {/* MARQUEE / ticker of cities */}
        <section className="-mx-6 border-y border-border bg-secondary py-5 text-secondary-foreground lg:-mx-10">
          <div className="flex items-center gap-6 overflow-hidden px-6 lg:px-10">
            <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.24em] text-secondary-foreground/60">
              Training from
            </span>
            <div className="flex flex-1 items-center gap-8 overflow-hidden">
              <div className="flex shrink-0 animate-[scroll_40s_linear_infinite] items-center gap-8">
                {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((city, i) => (
                  <span
                    key={`${city}-${i}`}
                    className="flex shrink-0 items-center gap-8 font-display text-xl font-semibold tracking-tight"
                  >
                    {city}
                    <span className="text-secondary-foreground/25">✦</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES - editorial grid with photography */}
        <section id="features" className="pt-20 pb-12 lg:pt-28">
          <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                — What you get
              </div>
              <h2 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-[-0.02em] sm:text-5xl">
                The product layer your training log has been missing.
              </h2>
            </div>
            <p className="max-w-sm text-base leading-7 text-muted-foreground">
              Most athletes don't need more graphs. They need better feedback loops — the kind that
              make the next decision easier.
            </p>
          </div>

          <div className="mt-14 grid gap-8 md:grid-cols-3 md:gap-6">
            <FeatureCard
              index="01"
              image={FEATURE_1_IMG}
              imageAlt="Runner on an empty road at sunrise"
              eyebrow="Training clarity"
              title="See the shape of your week."
              body="Volume, intensity, and ramp side by side. Know if this block is building, flat, or overcooked before the fatigue writes the answer."
            />
            <FeatureCard
              index="02"
              image={FEATURE_2_IMG}
              imageAlt="Athlete on a stadium track"
              eyebrow="Segments & effort"
              title="Every effort keeps its context."
              body="Personal bests sit beside the workouts that created them. Compare segment splits, find yesterday's pace, keep the competitive part honest."
            />
            <FeatureCard
              index="03"
              image={FEATURE_3_IMG}
              imageAlt="Cyclist climbing a pass"
              eyebrow="A stronger circle"
              title="Follow athletes who raise your standard."
              body="Clubs, kudos, and shared challenges — a social layer that stays motivating instead of turning into another feed to scroll."
            />
          </div>
        </section>

        {/* TESTIMONIAL / EDITORIAL PROOF */}
        <section id="proof" className="mt-16 border-y border-border py-16 lg:py-24">
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <figure className="lg:col-span-7">
              <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                Field notes · 04
              </div>
              <blockquote className="mt-6 font-display text-3xl font-semibold leading-[1.2] tracking-[-0.015em] text-foreground sm:text-4xl lg:text-[2.8rem]">
                <span className="text-primary">&ldquo;</span>
                The best apps keep me honest. Stride keeps me honest
                <em className="not-italic"> and </em>
                excited — the training week finally feels connected instead of buried in a pile of
                workouts.
                <span className="text-primary">&rdquo;</span>
              </blockquote>
              <figcaption className="mt-8 flex items-center gap-4">
                <img
                  src={TESTIMONIAL_IMG}
                  alt="Nadia Okafor"
                  className="h-14 w-14 rounded-full object-cover"
                />
                <div>
                  <div className="font-medium">Nadia Okafor</div>
                  <div className="text-sm text-muted-foreground">
                    Mountain runner · 4× Cascade Crest finisher
                  </div>
                </div>
              </figcaption>
            </figure>

            <aside className="flex flex-col justify-between gap-6 border-l border-border pl-6 lg:col-span-5 lg:pl-12">
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                  By the numbers
                </div>
                <dl className="mt-6 space-y-6">
                  <ProofRow label="Weekly active athletes" value="182,400" />
                  <ProofRow label="Kilometres logged this month" value="14.2M" />
                  <ProofRow label="Segments tracked worldwide" value="96,318" />
                  <ProofRow label="Clubs training together" value="3,204" />
                </dl>
              </div>
              <div className="text-sm text-muted-foreground">
                Data rolling 30-day window · Updated{" "}
                {new Date().toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </div>
            </aside>
          </div>
        </section>

        {/* FINAL CTA with photo */}
        <section className="mt-20 lg:mt-28">
          <div className="relative overflow-hidden bg-secondary text-secondary-foreground">
            <img
              src={CTA_IMG}
              alt="Trail runner at sunset"
              className="absolute inset-0 h-full w-full object-cover opacity-40"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-secondary via-secondary/85 to-secondary/30" />
            <div className="relative grid gap-10 p-8 sm:p-12 lg:grid-cols-12 lg:gap-16 lg:p-20">
              <div className="lg:col-span-8">
                <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-secondary-foreground/60">
                  Get started · No credit card
                </div>
                <h2 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-[-0.02em] sm:text-5xl lg:text-6xl">
                  Start the streak. <br />
                  <span className="text-primary">Keep it alive.</span>
                </h2>
                <p className="mt-6 max-w-xl text-lg leading-8 text-secondary-foreground/75">
                  Create your Stride account in under a minute. Record the next effort. Build the
                  habit from there.
                </p>
              </div>
              <div className="flex flex-col justify-end gap-4 lg:col-span-4">
                <Link
                  to="/auth"
                  className="group inline-flex items-center justify-between gap-2 bg-primary px-6 py-4 text-base font-medium text-primary-foreground transition-all"
                >
                  Create your account
                  <ArrowUpRight className="h-5 w-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
                <Link
                  to="/auth"
                  className="inline-flex items-center justify-between gap-2 border border-secondary-foreground/25 px-6 py-4 text-base font-medium text-secondary-foreground transition-colors hover:bg-secondary-foreground/5"
                >
                  Sign in
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-16 flex flex-col gap-4 border-t border-border pt-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em]">
            © {new Date().getFullYear()} Stride · Endurance training, plainly.
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <a className="hover:text-foreground" href="#">
              About
            </a>
            <a className="hover:text-foreground" href="#">
              Privacy
            </a>
            <a className="hover:text-foreground" href="#">
              Terms
            </a>
            <a className="hover:text-foreground" href="#">
              Press
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}

function FollowButton({ id }: { id: string }) {
  const [following, setFollowing] = useState(Boolean(getAthlete(id).isFollowing));
  return (
    <button
      onClick={async () => {
        const result = await toggleAthleteFollow(id);
        setFollowing(result.following);
      }}
      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
        following
          ? "border-secondary bg-secondary text-secondary-foreground"
          : "border-border hover:bg-muted"
      }`}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="stat-num text-3xl font-bold tracking-tight sm:text-[2.1rem]">{value}</div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{label}</p>
    </div>
  );
}

function FeatureCard({
  index,
  image,
  imageAlt,
  eyebrow,
  title,
  body,
}: {
  index: string;
  image: string;
  imageAlt: string;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <article className="group flex flex-col">
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
        <img
          src={image}
          alt={imageAlt}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
        />
        <div className="absolute left-3 top-3 bg-background/90 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-foreground backdrop-blur">
          {index}
        </div>
      </div>
      <div className="mt-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
          {eyebrow}
        </div>
        <h3 className="mt-3 font-display text-2xl font-bold leading-[1.15] tracking-[-0.01em]">
          {title}
        </h3>
        <p className="mt-3 text-base leading-7 text-muted-foreground">{body}</p>
      </div>
    </article>
  );
}

function ProofRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/70 pb-4 last:border-0 last:pb-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="stat-num text-xl font-bold text-foreground">{value}</dd>
    </div>
  );
}
