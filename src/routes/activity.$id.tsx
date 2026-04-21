import { createFileRoute, Link, useRouter, notFound } from "@tanstack/react-router";
import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";
import {
  Heart,
  MessageCircle,
  Trophy,
  Share2,
  Flag,
  MapPin,
  Mountain,
  Clock,
  Zap,
} from "lucide-react";
import {
  ACTIVITIES,
  fmtDate,
  fmtDuration,
  fmtPace,
  getActivity,
  getActivityPhoto,
  getAthlete,
  getSegment,
  elevationProfile,
} from "@/lib/mock-data";
import { AppShell } from "@/components/AppShell";
import { RouteMap } from "@/components/RouteMap";
import { SportBadge } from "@/components/SportBadge";
import { Stat } from "@/components/Stat";
import { addActivityComment, toggleActivityKudo } from "@/lib/api";

export const Route = createFileRoute("/activity/$id")({
  loader: ({ params }) => {
    const activity = getActivity(params.id);
    if (!activity) throw notFound();
    return { activity };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.activity.title} — Stride` },
          {
            name: "description",
            content: `${loaderData.activity.sport} · ${loaderData.activity.distanceKm.toFixed(2)} km`,
          },
        ]
      : [],
  }),
  component: ActivityDetail,
  notFoundComponent: () => (
    <AppShell>
      <div className="text-center py-24">
        <h1 className="text-2xl font-display font-bold">Activity not found</h1>
        <Link to="/" className="text-primary mt-2 inline-block">
          Back to feed
        </Link>
      </div>
    </AppShell>
  ),
});

function ActivityDetail() {
  const { activity } = Route.useLoaderData() as { activity: import("@/lib/mock-data").Activity };
  const router = useRouter();
  const ath = getAthlete(activity.athleteId);
  const [kudoed, setKudoed] = useState(activity.kudoed ?? false);
  const [kudosCount, setKudosCount] = useState(activity.kudos);
  const [comment, setComment] = useState("");
  type Comment = { id: string; athleteId: string; text: string };
  const [comments, setComments] = useState<Comment[]>(activity.comments);

  const elev = elevationProfile(activity.routeSeed);
  const splits = activity.splits ?? [];

  const submitComment = async () => {
    if (!comment.trim()) return;
    const c = await addActivityComment(activity.id, comment.trim());
    setComments((cs) => [...cs, c]);
    setComment("");
  };

  const toggleKudos = async () => {
    const result = await toggleActivityKudo(activity.id);
    setKudoed(result.kudoed);
    setKudosCount(result.kudos);
  };

  return (
    <AppShell>
      <div className="grid grid-cols-[1fr_360px] gap-8">
        <div className="min-w-0">
          {/* Header */}
          <div className="flex items-start gap-4 mb-6">
            <Link to="/athlete/$id" params={{ id: ath.id }}>
              <img
                src={ath.avatar}
                alt={ath.name}
                className="h-12 w-12 rounded-full object-cover"
              />
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Link
                  to="/athlete/$id"
                  params={{ id: ath.id }}
                  className="font-medium hover:underline"
                >
                  {ath.name}
                </Link>
                <SportBadge sport={activity.sport} />
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                {fmtDate(activity.date)} · <MapPin className="h-3 w-3 ml-1" /> {ath.city}
              </div>
            </div>
            <button
              onClick={() => navigator.share?.({ title: activity.title }).catch(() => {})}
              className="h-9 px-3 rounded-md border border-border text-sm flex items-center gap-2 hover:bg-muted"
            >
              <Share2 className="h-4 w-4" /> Share
            </button>
          </div>

          <h1 className="text-4xl font-display font-bold tracking-tight text-balance">
            {activity.title}
          </h1>
          {activity.description && (
            <p className="text-muted-foreground mt-3 max-w-2xl">{activity.description}</p>
          )}

          {/* Hero stats */}
          <div className="grid grid-cols-4 gap-6 my-8 pb-8 border-b border-border">
            <Stat label="Distance" value={activity.distanceKm.toFixed(2)} unit="km" emphasis />
            <Stat label="Time" value={fmtDuration(activity.movingSeconds)} />
            {activity.sport === "Ride" ? (
              <Stat label="Avg speed" value={activity.avgSpeedKmh?.toFixed(1) ?? "—"} unit="km/h" />
            ) : (
              <Stat
                label="Pace"
                value={
                  activity.avgPaceSecPerKm
                    ? fmtPace(activity.avgPaceSecPerKm).replace("/km", "")
                    : "—"
                }
                unit="/km"
              />
            )}
            <Stat label="Elevation" value={activity.elevationM} unit="m" />
          </div>

          {/* Map + photo */}
          <section className="rounded-xl overflow-hidden border border-border">
            <RouteMap
              seed={activity.routeSeed}
              width={1000}
              height={420}
              className="w-full h-[380px]"
              distanceKm={activity.distanceKm}
            />
          </section>
          {activity.photo && (
            <img
              src={getActivityPhoto(activity)}
              alt={activity.title}
              className="w-full h-[380px] object-cover border border-border mt-4"
            />
          )}

          {/* Elevation */}
          <section className="mt-8">
            <h2 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
              <Mountain className="h-4 w-4 text-primary" /> Elevation
            </h2>
            <div className="bg-surface rounded-xl border border-border p-4">
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={elev}>
                    <defs>
                      <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="x"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      dataKey="elev"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fill="url(#elevGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Splits */}
          {splits.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" /> Splits
              </h2>
              <div className="bg-surface rounded-xl border border-border p-4">
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={splits}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="km"
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(v) => fmtPace(Number(v))}
                      />
                      <Bar dataKey="paceSec" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 max-h-56 overflow-auto scrollbar-thin">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                      <tr className="text-left">
                        <th className="py-2 font-medium">Km</th>
                        <th className="py-2 font-medium">Pace</th>
                        <th className="py-2 font-medium">HR</th>
                        <th className="py-2 font-medium text-right">Elev</th>
                      </tr>
                    </thead>
                    <tbody>
                      {splits.map((s) => (
                        <tr key={s.km} className="border-t border-border">
                          <td className="py-2 font-mono">{s.km}</td>
                          <td className="py-2 font-mono">
                            {fmtPace(s.paceSec).replace("/km", "")}
                          </td>
                          <td className="py-2 font-mono">{s.hr}</td>
                          <td className="py-2 font-mono text-right">
                            {s.elev > 0 ? `+${s.elev}` : s.elev}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* Segments */}
          {activity.segments && activity.segments.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
                <Flag className="h-4 w-4 text-primary" /> Segment efforts
              </h2>
              <ul className="space-y-2">
                {activity.segments.map((eff) => {
                  const seg = getSegment(eff.id);
                  if (!seg) return null;
                  return (
                    <li key={eff.id}>
                      <Link
                        to="/segment/$id"
                        params={{ id: seg.id }}
                        className="flex items-center justify-between bg-surface border border-border rounded-lg p-3 hover:border-primary transition-colors"
                      >
                        <div>
                          <div className="font-medium text-sm">{seg.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {seg.distanceKm.toFixed(1)} km · {seg.avgGrade.toFixed(1)}%
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="stat-num text-base">#{eff.rank}</div>
                          <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
                            your rank
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* HR chart for fun */}
          {activity.avgHr && splits.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg font-display font-semibold mb-3">Heart rate</h2>
              <div className="bg-surface rounded-xl border border-border p-4 h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={splits}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="km"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      width={36}
                      domain={["dataMin - 5", "dataMax + 5"]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Line dataKey="hr" stroke="var(--destructive)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* Kudos & comments */}
          <section id="comments" className="mt-10 pt-8 border-t border-border">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleKudos}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-md border transition-colors ${
                  kudoed
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                <Heart className={`h-4 w-4 ${kudoed ? "fill-primary-foreground" : ""}`} />
                Give kudos · <span className="num">{kudosCount}</span>
              </button>
              {activity.achievements > 0 && (
                <span className="inline-flex items-center gap-2 px-3 py-2 text-sm text-pr">
                  <Trophy className="h-4 w-4" /> {activity.achievements} achievements
                </span>
              )}
            </div>

            <h3 className="text-base font-display font-semibold mt-8 mb-3 flex items-center gap-2">
              <MessageCircle className="h-4 w-4" /> Comments ({comments.length})
            </h3>
            <ul className="space-y-3">
              {comments.map((c) => {
                const a = getAthlete(c.athleteId);
                return (
                  <li key={c.id} className="flex gap-3">
                    <img
                      src={a.avatar}
                      alt=""
                      className="h-8 w-8 rounded-full object-cover shrink-0"
                    />
                    <div className="bg-surface-2 rounded-lg px-3 py-2 text-sm flex-1">
                      <span className="font-medium mr-2">{a.name}</span>
                      <span className="text-muted-foreground">{c.text}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex gap-3">
              <img
                src={getAthlete("me").avatar}
                alt=""
                className="h-8 w-8 rounded-full object-cover shrink-0"
              />
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitComment()}
                placeholder="Add a comment…"
                className="flex-1 h-10 px-3 rounded-md bg-surface-2 border border-transparent focus:border-border focus:bg-surface text-sm outline-none"
              />
              <button
                onClick={submitComment}
                className="h-10 px-4 rounded-md bg-secondary text-secondary-foreground text-sm font-medium"
              >
                Post
              </button>
            </div>
          </section>
        </div>

        {/* Right rail */}
        <aside className="space-y-5">
          <div className="bg-surface rounded-xl border border-border p-5">
            <h3 className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-3">
              Effort
            </h3>
            <div className="space-y-3">
              <Row label="Avg HR" value={activity.avgHr ? `${activity.avgHr} bpm` : "—"} />
              <Row
                label="Calories"
                value={`${Math.round((activity.movingSeconds / 60) * 10)} kcal`}
              />
              <Row
                label="Relative effort"
                value={`${Math.min(100, Math.round(activity.movingSeconds / 60 + activity.elevationM / 10))}`}
              />
            </div>
          </div>
          <div className="bg-surface rounded-xl border border-border p-5">
            <h3 className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-3">
              Other activities
            </h3>
            <ul className="space-y-3">
              {ACTIVITIES.filter((a) => a.id !== activity.id)
                .slice(0, 4)
                .map((a) => (
                  <li key={a.id}>
                    <button
                      onClick={() => router.navigate({ to: "/activity/$id", params: { id: a.id } })}
                      className="w-full text-left flex items-center gap-3 hover:bg-muted -mx-2 px-2 py-1.5 rounded"
                    >
                      <img
                        src={getAthlete(a.athleteId).avatar}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{a.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {a.distanceKm.toFixed(1)} km · {fmtDuration(a.movingSeconds)}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
