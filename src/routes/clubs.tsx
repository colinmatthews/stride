import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CLUBS } from "@/lib/mock-data";
import { AppShell } from "@/components/AppShell";
import { Users, Check } from "lucide-react";
import { toggleClubJoin } from "@/lib/api";

export const Route = createFileRoute("/clubs")({
  head: () => ({
    meta: [
      { title: "Clubs — Stride" },
      { name: "description", content: "Join clubs and train with people who share your goals." },
    ],
  }),
  component: ClubsPage,
});

function ClubsPage() {
  const [joined, setJoined] = useState<Record<string, boolean>>(
    Object.fromEntries(CLUBS.map((c) => [c.id, !!c.joined])),
  );
  const [members, setMembers] = useState<Record<string, number>>(
    Object.fromEntries(CLUBS.map((c) => [c.id, c.members])),
  );

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm text-muted-foreground">Train with your tribe</p>
        <h1 className="text-3xl font-display font-bold tracking-tight mt-1">Clubs</h1>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {CLUBS.map((c) => (
          <article
            key={c.id}
            className="bg-surface border border-border rounded-xl overflow-hidden"
          >
            <Link to="/club/$id" params={{ id: c.id }}>
              <img src={c.cover} alt="" className="w-full h-36 object-cover" />
            </Link>
            <div className="p-4">
              <Link to="/club/$id" params={{ id: c.id }}>
                <h3 className="font-display text-lg font-semibold hover:text-primary">{c.name}</h3>
              </Link>
              <div className="text-xs text-muted-foreground mt-0.5">
                {c.city} · {c.sport}
              </div>
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{c.description}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Users className="h-3 w-3" /> {members[c.id].toLocaleString()}
                </span>
                <button
                  onClick={async () => {
                    const result = await toggleClubJoin(c.id);
                    setJoined((state) => ({ ...state, [c.id]: result.joined }));
                    setMembers((state) => ({ ...state, [c.id]: result.members }));
                  }}
                  className={`text-xs px-3 py-1.5 rounded-md font-medium inline-flex items-center gap-1.5 ${
                    joined[c.id]
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  {joined[c.id] ? (
                    <>
                      <Check className="h-3 w-3" /> Joined
                    </>
                  ) : (
                    "Join"
                  )}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
