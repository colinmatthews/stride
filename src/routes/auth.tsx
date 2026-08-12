import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, LoaderCircle, Lock, Mail, MapPin, User } from "lucide-react";
import { ApiError, login, register } from "@/lib/api";
import { ME } from "@/lib/mock-data";
import { usePostHog } from "@posthog/react";

const ONBOARDING_STORAGE_KEY = "stride:onboarding:v1";

const AUTH_IMG =
  "https://images.unsplash.com/photo-1486218119243-13883505764c?w=1400&q=80&auto=format&fit=crop";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Stride" },
      {
        name: "description",
        content:
          "Sign in to Stride or create your account to track training, follow athletes, and build momentum.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const posthog = usePostHog();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const next = new URLSearchParams(window.location.search).get("next") || "/";

  useEffect(() => {
    if (ME.id) {
      window.location.replace("/");
    }
  }, []);

  async function submit() {
    setBusy(true);
    setError("");

    try {
      if (mode === "login") {
        await login(email, password);
        posthog.identify(email, { email });
        posthog.capture("user_logged_in", { email });
      } else {
        await register(name, email, password);
        posthog.identify(email, { email, name });
        posthog.capture("user_signed_up", { email, name });
      }

      if (mode === "register") {
        localStorage.removeItem(ONBOARDING_STORAGE_KEY);
      }
      const onboarded = localStorage.getItem(ONBOARDING_STORAGE_KEY);
      window.location.assign(onboarded ? next : "/onboarding");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        posthog.captureException(err);
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-background text-foreground lg:grid-cols-[1.05fr_0.95fr]">
      {/* LEFT — form column */}
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-6 py-6 lg:px-12">
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
          <Link
            to="/"
            className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center px-6 pb-10 lg:px-12">
          <section className="w-full max-w-md">
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-foreground/40" />
              <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                {mode === "login" ? "Welcome back" : "Start training"}
              </span>
            </div>

            <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-[-0.02em] sm:text-5xl">
              {mode === "login" ? (
                <>
                  Sign in and <em className="not-italic text-primary">keep the streak alive.</em>
                </>
              ) : (
                <>
                  Create your account. <em className="not-italic text-primary">Build the habit.</em>
                </>
              )}
            </h1>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              {mode === "login"
                ? "Pick up your training exactly where you left off. Your efforts, segments, and clubs are waiting."
                : "A Stride account takes under a minute. Record the next effort and start building your history today."}
            </p>

            <div className="mt-8 grid grid-cols-2 gap-0 border border-border">
              <button
                onClick={() => setMode("login")}
                className={`py-3 text-sm font-medium transition-colors ${
                  mode === "login"
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign in
              </button>
              <button
                onClick={() => setMode("register")}
                className={`py-3 text-sm font-medium transition-colors ${
                  mode === "register"
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Create account
              </button>
            </div>

            <form
              className="mt-8 space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              {mode === "register" && (
                <Field
                  label="Full name"
                  icon={User}
                  value={name}
                  onChange={setName}
                  placeholder="Alex Carter"
                />
              )}
              <Field
                label="Email"
                icon={Mail}
                value={email}
                onChange={setEmail}
                placeholder="alex@example.com"
                type="email"
              />
              <Field
                label="Password"
                icon={Lock}
                value={password}
                onChange={setPassword}
                placeholder="At least 8 characters"
                type="password"
              />

              {error && (
                <p className="border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className={`group inline-flex h-[52px] w-full items-center justify-center gap-2 px-5 text-sm font-medium text-primary-foreground transition-all hover:gap-3 disabled:opacity-60 ${
                  mode === "login" ? "bg-blue-600 hover:bg-blue-700" : "bg-primary"
                }`}
              >
                {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {mode === "login" ? "Sign in to Stride" : "Create your account"}
                {!busy && (
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                )}
              </button>
            </form>

            <div className="mt-8 flex items-center gap-4">
              <span className="h-px flex-1 bg-border" />
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                {mode === "login" ? "New to Stride?" : "Already a member?"}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <button
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              className="mt-4 w-full py-3 text-sm font-medium underline-offset-4 transition-all hover:underline"
            >
              {mode === "login" ? "Create a free account →" : "Sign in to your account →"}
            </button>
          </section>
        </main>

        <footer className="px-6 py-6 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground lg:px-12">
          © {new Date().getFullYear()} Stride · Endurance training, plainly.
        </footer>
      </div>

      {/* RIGHT — photography column */}
      <aside className="relative hidden lg:block">
        <img
          src={AUTH_IMG}
          alt="Runner on a mountain ridge at dawn"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-secondary/60 via-secondary/10 to-transparent" />

        <div className="relative flex h-full flex-col justify-between p-10 text-secondary-foreground xl:p-14">
          <div className="flex items-center gap-2 self-start bg-background/90 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-foreground backdrop-blur">
            <MapPin className="h-3 w-3 text-primary" /> Cascade Ridge · 06:12
          </div>

          <div className="max-w-lg">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-secondary-foreground/70">
              Field notes · 04
            </div>
            <blockquote className="mt-5 font-display text-3xl font-semibold leading-[1.2] tracking-[-0.015em] sm:text-[2.1rem]">
              <span className="text-primary">&ldquo;</span>
              The training week finally feels connected instead of buried in a pile of workouts.
              <span className="text-primary">&rdquo;</span>
            </blockquote>
            <div className="mt-6 flex items-center gap-3">
              <span className="h-px w-6 bg-secondary-foreground/50" />
              <span className="text-sm text-secondary-foreground/80">
                Nadia Okafor — Mountain runner
              </span>
            </div>

            <div className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-secondary-foreground/15 pt-6">
              <SideStat value="280K+" label="Athletes" />
              <SideStat value="14.2M" label="km / month" />
              <SideStat value="96K" label="Segments" />
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function SideStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="stat-num text-2xl font-bold tracking-tight">{value}</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/60">
        {label}
      </div>
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  icon: typeof Mail;
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
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-12 w-full border border-border bg-background pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground"
        />
      </div>
    </label>
  );
}
