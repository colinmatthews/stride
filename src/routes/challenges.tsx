import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CHALLENGES } from "@/lib/mock-data";
import { AppShell } from "@/components/AppShell";
import { Trophy, Users, Calendar, Check } from "lucide-react";

export const Route = createFileRoute("/challenges")({
  head: () => ({ meta: [{ title: "Challenges — Stride" }, { name: "description", content: "Join monthly distance and climbing challenges." }] }),
  component: ChallengesPage,
});

function ChallengesPage() {
  const [joined, setJoined] = useState<Record<string, boolean>>(
    Object.fromEntries(CHALLENGES.map((c) => [c.id, !!c.joined]))
  );
  const toggle = (id: string) => setJoined((s) => ({ ...s, [id]: !s[id] }));

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm text-muted-foreground">Push yourself this month</p>
        <h1 className="text-3xl font-display font-bold tracking-tight mt-1">Challenges</h1>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {CHALLENGES.map((c) => {
          const isJoined = joined[c.id];
          const pct = Math.min(100, (c.myProgressKm / c.goalKm) * 100);
          return (
            <article key={c.id} className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="h-32 gradient-orange relative grid place-items-center text-6xl">
                {c.badge}
                <span className="absolute top-3 right-3 text-[11px] bg-secondary text-secondary-foreground px-2 py-1 rounded uppercase tracking-wider">
                  {c.sport}
                </span>
              </div>
              <div className="p-5">
                <h3 className="text-lg font-display font-semibold">{c.name}</h3>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {c.participants.toLocaleString()}</span>
                  <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> ends {c.endsAt}</span>
                </div>

                {isJoined && (
                  <div className="mt-4">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium">Your progress</span>
                      <span className="num">{c.myProgressKm.toFixed(1)} / {c.goalKm} {c.sport === "Ride" && c.goalKm > 1000 ? "m" : "km"}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}

                <button
                  onClick={() => toggle(c.id)}
                  className={`mt-4 w-full h-10 rounded-md text-sm font-medium inline-flex items-center justify-center gap-2 ${
                    isJoined ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground"
                  }`}
                >
                  {isJoined ? <><Check className="h-4 w-4" /> Joined</> : <><Trophy className="h-4 w-4" /> Join challenge</>}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
