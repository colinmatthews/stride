import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SEGMENTS, fmtDuration, type Sport } from "@/lib/mock-data";
import { AppShell } from "@/components/AppShell";
import { SportBadge } from "@/components/SportBadge";
import { Mountain, Search } from "lucide-react";

export const Route = createFileRoute("/segments")({
  head: () => ({ meta: [{ title: "Segments — Stride" }, { name: "description", content: "Find segments and chase records." }] }),
  component: SegmentsPage,
});

const SPORT_FILTERS: ("All" | Sport)[] = ["All", "Run", "Ride"];

function SegmentsPage() {
  const [sport, setSport] = useState<"All" | Sport>("All");
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () =>
      SEGMENTS.filter((s) => (sport === "All" || s.sport === sport) && (q ? s.name.toLowerCase().includes(q.toLowerCase()) : true)),
    [sport, q]
  );
  return (
    <AppShell>
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="text-sm text-muted-foreground">Compete with the world</p>
          <h1 className="text-3xl font-display font-bold tracking-tight mt-1">Segments</h1>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search segments…"
            className="w-full h-10 pl-10 pr-3 rounded-md bg-surface-2 border border-transparent focus:border-border focus:bg-surface text-sm outline-none"
          />
        </div>
        <div className="flex gap-1 bg-surface-2 rounded-md p-1">
          {SPORT_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setSport(f)}
              className={`px-3 py-1.5 text-sm rounded ${
                sport === f ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-3">Segment</th>
              <th className="text-left font-medium px-4 py-3">Sport</th>
              <th className="text-right font-medium px-4 py-3">Distance</th>
              <th className="text-right font-medium px-4 py-3">Avg grade</th>
              <th className="text-right font-medium px-4 py-3">Elev</th>
              <th className="text-right font-medium px-4 py-3">KOM/QOM</th>
              <th className="text-right font-medium px-4 py-3">Your PR</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-t border-border hover:bg-surface-2 transition-colors">
                <td className="px-4 py-3">
                  <Link to="/segment/$id" params={{ id: s.id }} className="font-medium hover:text-primary flex items-center gap-2">
                    <Mountain className="h-3.5 w-3.5 text-muted-foreground" />
                    {s.name}
                    <span className="text-xs text-muted-foreground font-normal">· {s.location}</span>
                  </Link>
                </td>
                <td className="px-4 py-3"><SportBadge sport={s.sport} /></td>
                <td className="px-4 py-3 text-right font-mono">{s.distanceKm.toFixed(1)} km</td>
                <td className="px-4 py-3 text-right font-mono">{s.avgGrade.toFixed(1)}%</td>
                <td className="px-4 py-3 text-right font-mono">{s.elevationM} m</td>
                <td className="px-4 py-3 text-right font-mono text-primary">{fmtDuration(s.korSec)}</td>
                <td className="px-4 py-3 text-right font-mono">{s.myBestSec ? fmtDuration(s.myBestSec) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
