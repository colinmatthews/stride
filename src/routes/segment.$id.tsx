import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ATHLETES, SEGMENTS, fmtDuration, getSegment, ME } from "@/lib/mock-data";
import { AppShell } from "@/components/AppShell";
import { RouteMap } from "@/components/RouteMap";
import { SportBadge } from "@/components/SportBadge";
import { Stat } from "@/components/Stat";
import { Trophy, Star } from "lucide-react";

export const Route = createFileRoute("/segment/$id")({
  loader: ({ params }) => {
    const segment = getSegment(params.id);
    if (!segment) throw notFound();
    return { segment };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.segment.name} — Stride Segment` },
          { name: "description", content: `${loaderData.segment.distanceKm} km · ${loaderData.segment.avgGrade}% grade` },
        ]
      : [],
  }),
  component: SegmentDetail,
});

function SegmentDetail() {
  const { segment } = Route.useLoaderData() as { segment: import("@/lib/mock-data").Segment };
  // fake leaderboard
  const leaderboard = ATHLETES.filter((a) => a.id !== "me").slice(0, 8).map((a, i) => ({
    rank: i + 1,
    athlete: a,
    timeSec: segment.korSec + i * (30 + segment.routeSeed),
  }));
  if (segment.myBestSec) {
    leaderboard.push({ rank: leaderboard.length + 8, athlete: ME, timeSec: segment.myBestSec });
  }

  return (
    <AppShell>
      <Link to="/segments" className="text-sm text-muted-foreground hover:text-foreground">← All segments</Link>
      <div className="mt-3 flex items-start gap-3">
        <div className="flex-1">
          <SportBadge sport={segment.sport} />
          <h1 className="text-4xl font-display font-bold tracking-tight mt-2">{segment.name}</h1>
          <p className="text-muted-foreground mt-1">{segment.location}</p>
        </div>
        <button className="h-10 px-4 rounded-md border border-border text-sm flex items-center gap-2 hover:bg-muted">
          <Star className="h-4 w-4" /> Star segment
        </button>
      </div>

      <div className="grid grid-cols-5 gap-6 my-8">
        <Stat label="Distance" value={segment.distanceKm.toFixed(1)} unit="km" emphasis />
        <Stat label="Avg grade" value={segment.avgGrade.toFixed(1)} unit="%" />
        <Stat label="Elevation" value={segment.elevationM} unit="m" />
        <Stat label="Attempts" value={segment.attempts.toLocaleString()} />
        <Stat label="Athletes" value={segment.athletes.toLocaleString()} />
      </div>

      <div className="grid grid-cols-[1fr_360px] gap-8">
        <div>
          <section className="rounded-xl overflow-hidden border border-border">
            <RouteMap seed={segment.routeSeed} width={1000} height={380} className="w-full h-[360px]" variant="dark" />
          </section>

          <h2 className="text-lg font-display font-semibold mt-8 mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" /> Leaderboard
          </h2>
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3 w-14">Rank</th>
                  <th className="text-left font-medium px-4 py-3">Athlete</th>
                  <th className="text-right font-medium px-4 py-3">Time</th>
                  <th className="text-right font-medium px-4 py-3">Pace</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, i) => {
                  const pace = Math.round(row.timeSec / segment.distanceKm);
                  const m = Math.floor(pace / 60);
                  const s = pace % 60;
                  const isMe = row.athlete.id === "me";
                  return (
                    <tr key={row.athlete.id} className={`border-t border-border ${isMe ? "bg-primary/5" : ""}`}>
                      <td className="px-4 py-3 font-mono">
                        {i === 0 ? <span className="text-primary font-bold">🏆 {row.rank}</span> : row.rank}
                      </td>
                      <td className="px-4 py-3">
                        <Link to="/athlete/$id" params={{ id: row.athlete.id }} className="flex items-center gap-2 hover:text-primary">
                          <img src={row.athlete.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                          <span className={isMe ? "font-semibold" : ""}>{row.athlete.name}{isMe && " (you)"}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{fmtDuration(row.timeSec)}</td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">{m}:{s.toString().padStart(2, "0")}/km</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="space-y-5">
          <div className="bg-secondary text-secondary-foreground rounded-xl p-5">
            <div className="text-xs uppercase tracking-[0.14em] opacity-70">Course record</div>
            <div className="stat-num text-3xl text-primary mt-2">{fmtDuration(segment.korSec)}</div>
            <div className="text-sm opacity-80 mt-1">by {segment.korAthlete}</div>
          </div>
          {segment.myBestSec && (
            <div className="bg-surface border border-border rounded-xl p-5">
              <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Your PR</div>
              <div className="stat-num text-3xl mt-2">{fmtDuration(segment.myBestSec)}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {fmtDuration(segment.myBestSec - segment.korSec)} behind KOM
              </div>
            </div>
          )}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-3">Similar segments</h3>
            <ul className="space-y-2">
              {SEGMENTS.filter((s) => s.id !== segment.id && s.sport === segment.sport).slice(0, 3).map((s) => (
                <li key={s.id}>
                  <Link to="/segment/$id" params={{ id: s.id }} className="block hover:bg-muted -mx-2 px-2 py-2 rounded">
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.distanceKm.toFixed(1)} km · {s.avgGrade.toFixed(1)}%</div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
