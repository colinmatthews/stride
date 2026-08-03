import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronRight, RefreshCw, Watch, Bluetooth, WifiOff } from "lucide-react";
import {
  DEVICE_CONNECTIONS,
  fmtDuration,
  type Activity,
  type DeviceConnection,
  type Sport,
} from "@/lib/mock-data";
import { fetchActivities, reauthorizeDeviceConnection, retryDeviceSync } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { SportBadge } from "@/components/SportBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/training")({
  head: () => ({
    meta: [
      { title: "Training Log — Stride" },
      { name: "description", content: "All your activities, week by week." },
    ],
  }),
  loader: async () => fetchActivities({ athleteId: "me", limit: 100 }),
  component: Training,
});

const SPORT_COLORS: Record<Sport, string> = {
  Run: "var(--primary)",
  Ride: "var(--accent)",
  Swim: "oklch(0.6 0.18 230)",
  Hike: "oklch(0.55 0.15 145)",
  Walk: "oklch(0.7 0.05 80)",
};

function Training() {
  const initialPage = Route.useLoaderData() as { activities: Activity[]; nextCursor?: string };
  const [my, setMy] = useState(initialPage.activities);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const weeks = useMemo(() => weeklyStatsForActivities(my), [my]);
  const [sport, setSport] = useState<"All" | Sport>("All");

  const sportBreakdown = useMemo(() => {
    const map = new Map<Sport, number>();
    my.forEach((a) => map.set(a.sport, (map.get(a.sport) ?? 0) + a.distanceKm));
    return Array.from(map.entries()).map(([s, km]) => ({
      name: s,
      value: Math.round(km * 10) / 10,
    }));
  }, [my]);

  const filtered = sport === "All" ? my : my.filter((a) => a.sport === sport);
  const totals = filtered.reduce(
    (acc, a) => ({
      km: acc.km + a.distanceKm,
      time: acc.time + a.movingSeconds,
      elev: acc.elev + a.elevationM,
      count: acc.count + 1,
    }),
    { km: 0, time: 0, elev: 0, count: 0 },
  );
  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchActivities({ athleteId: "me", cursor: nextCursor, limit: 100 });
      setMy((current) => [...current, ...page.activities]);
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm text-muted-foreground">Every effort, logged.</p>
        <h1 className="text-3xl font-display font-bold tracking-tight mt-1">Training log</h1>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <Card label="Activities" value={totals.count} />
        <Card label="Distance" value={`${totals.km.toFixed(1)} km`} />
        <Card label="Time" value={fmtDuration(totals.time)} />
        <Card label="Elevation" value={`${totals.elev.toLocaleString()} m`} />
      </div>

      <ConnectedDevicesSection />

      <div className="grid grid-cols-3 gap-6 mb-10">
        <section className="bg-surface border border-border rounded-xl p-5 col-span-2">
          <h2 className="text-base font-display font-semibold mb-4">Weekly volume (km)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
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
                <Bar dataKey="km" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="bg-surface border border-border rounded-xl p-5">
          <h2 className="text-base font-display font-semibold mb-4">Sport breakdown</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sportBreakdown}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  {sportBreakdown.map((entry) => (
                    <Cell key={entry.name} fill={SPORT_COLORS[entry.name as Sport]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display font-semibold">All activities</h2>
        <div className="flex gap-1 bg-surface-2 rounded-md p-1">
          {(["All", "Run", "Ride", "Swim", "Hike", "Walk"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSport(s)}
              className={`px-3 py-1.5 text-xs rounded ${
                sport === s
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-3">Date</th>
              <th className="text-left font-medium px-4 py-3">Activity</th>
              <th className="text-left font-medium px-4 py-3">Sport</th>
              <th className="text-right font-medium px-4 py-3">Distance</th>
              <th className="text-right font-medium px-4 py-3">Time</th>
              <th className="text-right font-medium px-4 py-3">Elev</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id} className="border-t border-border hover:bg-surface-2">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {new Date(a.date).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <a href={`/activity/${a.id}`} className="hover:text-primary font-medium">
                    {a.title}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <SportBadge sport={a.sport} />
                </td>
                <td className="px-4 py-3 text-right font-mono">{a.distanceKm.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-mono">{fmtDuration(a.movingSeconds)}</td>
                <td className="px-4 py-3 text-right font-mono">{a.elevationM} m</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  No activities for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {nextCursor && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </AppShell>
  );
}

function weeklyStatsForActivities(activities: Activity[]) {
  const weeks: { label: string; km: number; time: number; elev: number }[] = [];
  const now = new Date();

  for (let index = 7; index >= 0; index -= 1) {
    const start = new Date(now);
    start.setDate(now.getDate() - index * 7 - 6);
    const end = new Date(now);
    end.setDate(now.getDate() - index * 7);

    const weekActivities = activities.filter((activity) => {
      const date = new Date(activity.date);
      return date >= start && date <= end;
    });

    weeks.push({
      label: `W${8 - index}`,
      km:
        Math.round(weekActivities.reduce((sum, activity) => sum + activity.distanceKm, 0) * 10) /
        10,
      time: weekActivities.reduce((sum, activity) => sum + activity.movingSeconds, 0),
      elev: weekActivities.reduce((sum, activity) => sum + activity.elevationM, 0),
    });
  }

  return weeks;
}

function deviceIcon(type: string) {
  if (type === "watch") return Watch;
  if (type === "bike") return Bluetooth;
  if (type === "strap") return RefreshCw;
  return WifiOff;
}

function statusTone(status: DeviceConnection["status"]) {
  if (status === "error")
    return {
      border: "border-destructive/40",
      bg: "bg-destructive/8",
      text: "text-destructive",
      dot: "bg-destructive",
      label: "Sync failing",
    };
  if (status === "warning")
    return {
      border: "border-[color:var(--accent)]/40",
      bg: "bg-[color:var(--accent)]/8",
      text: "text-[color:var(--accent)]",
      dot: "bg-[color:var(--accent)]",
      label: "Degraded",
    };
  return {
    border: "border-border",
    bg: "bg-surface-2",
    text: "text-muted-foreground",
    dot: "bg-[color:var(--pr)]",
    label: "Healthy",
  };
}

function lastSyncLabel(minutes: number) {
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / (60 * 24))}d ago`;
}

function ConnectedDevicesSection() {
  const [devices, setDevices] = useState(DEVICE_CONNECTIONS);
  const [openId, setOpenId] = useState<string | null>(
    devices.find((d) => d.status === "error")?.id ?? null,
  );
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  if (devices.length === 0) return null;

  const runAction = async (
    connectionId: string,
    action: (id: string) => Promise<DeviceConnection>,
  ) => {
    setPendingAction(connectionId);
    try {
      const updated = await action(connectionId);
      setDevices((current) => current.map((d) => (d.id === updated.id ? updated : d)));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <section className="mb-10 rounded-xl border border-border bg-surface overflow-hidden">
      <header className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="text-base font-display font-semibold">Connected devices</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Activities flow from your devices into the log below.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="destructive">
            {devices.filter((d) => d.status === "error").length} failing
          </Badge>
          <Badge variant="outline">
            {devices.filter((d) => d.status === "warning").length} degraded
          </Badge>
        </div>
      </header>
      <ul className="divide-y divide-border">
        {devices.map((d) => {
          const tone = statusTone(d.status);
          const Icon = deviceIcon(d.type);
          const open = openId === d.id;
          const busy = pendingAction === d.id;
          return (
            <li key={d.id} className={tone.bg}>
              <button
                onClick={() => setOpenId(open ? null : d.id)}
                className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-background/40 transition-colors"
              >
                <div
                  className={`grid h-10 w-10 place-items-center rounded-md bg-background/60 border ${tone.border}`}
                >
                  <Icon className={`h-4 w-4 ${tone.text}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{d.name}</span>
                    <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                    <span className={`font-mono text-[10px] uppercase tracking-[0.18em] ${tone.text}`}>
                      {tone.label}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {d.model} · last sync {lastSyncLabel(d.lastSyncMinutesAgo)}
                    {d.pendingActivities > 0 && (
                      <span className="ml-2 text-destructive font-medium">
                        {d.pendingActivities} pending
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight
                  className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
                />
              </button>
              {open && (
                <div className="px-5 pb-5 -mt-1">
                  <div className="rounded-md border border-border bg-background p-4">
                    <p className="text-sm">{d.detail}</p>
                    {d.fix && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        <span className="font-mono uppercase tracking-[0.18em] text-foreground/80">
                          Next step
                        </span>{" "}
                        — {d.fix}
                      </p>
                    )}
                    {d.status !== "ok" && (
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => runAction(d.id, reauthorizeDeviceConnection)}
                        >
                          Re-authorize
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => runAction(d.id, retryDeviceSync)}
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Retry now
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="stat-num text-2xl mt-1">{value}</div>
    </div>
  );
}
