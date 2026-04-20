import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ACTIVITIES, ATHLETES, CLUBS, fmtTimeAgo, getAthlete } from "@/lib/mock-data";
import { AppShell } from "@/components/AppShell";
import { ActivityCard } from "@/components/ActivityCard";
import { Users, Check, MapPin } from "lucide-react";

export const Route = createFileRoute("/club/$id")({
  loader: ({ params }) => {
    const club = CLUBS.find((c) => c.id === params.id);
    if (!club) throw notFound();
    return { club };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.club.name} — Stride Club` },
          { name: "description", content: loaderData.club.description },
          { property: "og:image", content: loaderData.club.cover },
        ]
      : [],
  }),
  component: ClubDetail,
});

function ClubDetail() {
  const { club } = Route.useLoaderData();
  const [joined, setJoined] = useState(!!club.joined);
  const members = ATHLETES.filter((a) => a.id !== "me").slice(0, 6);
  const feed = ACTIVITIES.slice(0, 6);

  return (
    <AppShell>
      <Link to="/clubs" className="text-sm text-muted-foreground hover:text-foreground">← All clubs</Link>

      <div className="mt-4 rounded-xl overflow-hidden border border-border">
        <img src={club.cover} alt="" className="w-full h-56 object-cover" />
      </div>

      <div className="mt-6 flex items-start gap-6">
        <div className="flex-1">
          <h1 className="text-4xl font-display font-bold tracking-tight">{club.name}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-2">
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {club.city}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {club.members.toLocaleString()} members</span>
            <span>·</span>
            <span>{club.sport}</span>
          </div>
          <p className="text-muted-foreground mt-4 max-w-2xl">{club.description}</p>
        </div>
        <button
          onClick={() => setJoined((j) => !j)}
          className={`h-10 px-5 rounded-md text-sm font-medium inline-flex items-center gap-2 ${
            joined ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground"
          }`}
        >
          {joined ? <><Check className="h-4 w-4" /> Joined</> : "Join club"}
        </button>
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-8 mt-10">
        <div className="min-w-0">
          <h2 className="text-lg font-display font-semibold mb-4">Recent activity</h2>
          <div className="space-y-5">
            {feed.map((a) => (
              <ActivityCard key={a.id} activity={a} />
            ))}
          </div>
        </div>
        <aside className="space-y-5">
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-3">Members</h3>
            <ul className="space-y-3">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-3">
                  <Link to="/athlete/$id" params={{ id: m.id }}>
                    <img src={m.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link to="/athlete/$id" params={{ id: m.id }} className="text-sm font-medium hover:underline truncate block">
                      {m.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">@{m.handle}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-3">Upcoming events</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <div className="font-medium">Saturday long run</div>
                <div className="text-xs text-muted-foreground">{fmtTimeAgo(new Date(Date.now() + 86400e3 * 2).toISOString())} · 7:00 AM</div>
              </li>
              <li>
                <div className="font-medium">Tempo Tuesday</div>
                <div className="text-xs text-muted-foreground">{fmtTimeAgo(new Date(Date.now() + 86400e3 * 5).toISOString())} · 6:30 PM</div>
              </li>
            </ul>
          </div>
          {void getAthlete}
        </aside>
      </div>
    </AppShell>
  );
}
