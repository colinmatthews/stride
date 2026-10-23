import { Trophy, Users, Calendar, Check } from "lucide-react";
import type { Challenge } from "@/lib/mock-data";

interface Props {
  challenge: Challenge;
  joined: boolean;
  participants: number;
  onToggleJoin: () => void | Promise<void>;
}

export function ChallengeCard({ challenge: c, joined, participants, onToggleJoin }: Props) {
  const pct = Math.min(100, (c.myProgressKm / c.goalKm) * 100);
  const unit = c.sport === "Ride" && c.goalKm > 1000 ? "m" : "km";

  return (
    <article className="group flex flex-col overflow-hidden border border-border bg-surface transition-colors hover:border-foreground/40">
      <div className="relative flex min-h-[180px] flex-col justify-between bg-secondary p-6 text-secondary-foreground">
        {/* decorative gridlines */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/60">
            {c.sport} · monthly
          </div>
          {joined ? (
            <div className="flex items-center gap-1.5 bg-primary px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-primary-foreground">
              <Check className="h-3 w-3" /> Joined
            </div>
          ) : (
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/50">
              Open
            </div>
          )}
        </div>

        <div className="relative">
          <div className="font-display text-[4rem] font-bold leading-none tracking-[-0.04em] text-secondary-foreground sm:text-[5rem]">
            {c.badge}
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-4">
            <h3 className="font-display text-lg font-semibold tracking-tight text-secondary-foreground/90">
              {c.name}
            </h3>
            <span className="stat-num shrink-0 text-base font-semibold text-primary">
              {c.goalKm} {unit}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {participants.toLocaleString()} athletes
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" /> ends {c.endsAt}
          </span>
        </div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              {joined ? "Your progress" : "Not started"}
            </span>
            <span className="stat-num text-sm font-semibold">
              {joined ? (
                <>
                  {c.myProgressKm.toFixed(1)}
                  <span className="text-muted-foreground">
                    {" "}
                    / {c.goalKm} {unit}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  0 / {c.goalKm} {unit}
                </span>
              )}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${joined ? pct : 0}%` }}
            />
          </div>
          {joined && (
            <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              <span>{Math.round(pct)}% complete</span>
              <span>
                {Math.max(0, c.goalKm - c.myProgressKm).toFixed(0)} {unit} to go
              </span>
            </div>
          )}
        </div>

        <button
          onClick={() => onToggleJoin()}
          className={`mt-6 inline-flex h-11 w-full items-center justify-center gap-2 text-sm font-medium transition-opacity hover:opacity-95 ${
            joined
              ? "border border-border bg-surface text-foreground"
              : "bg-primary text-primary-foreground"
          }`}
        >
          {joined ? (
            <>
              <Check className="h-4 w-4" /> Leave challenge
            </>
          ) : (
            <>
              <Trophy className="h-4 w-4" /> Join challenge
            </>
          )}
        </button>
      </div>
    </article>
  );
}
