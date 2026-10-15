import { createFileRoute, Link } from "@tanstack/react-router";
import { usePostHog } from "@posthog/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownRight,
  BellOff,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { SportBadge } from "@/components/SportBadge";
import { Stat } from "@/components/Stat";
import { IS_STAFF } from "@/lib/mock-data";
import {
  fetchRetentionQueue,
  recordRetentionAction,
  type RetentionActionInput,
  type RetentionChannel,
  type RetentionEntry,
  type RetentionLastAction,
  type RetentionQueue,
  type RetentionStatus,
} from "@/lib/api";

const WEEKS_SHOWN = 12;
const WINDOW_WEEKS = 8;

export const Route = createFileRoute("/retention")({
  head: () => ({
    meta: [
      { title: "Retention queue — Stride" },
      { name: "description", content: "Premium athletes whose training is fading." },
    ],
  }),
  loader: async (): Promise<{ queue: RetentionQueue | null; error?: string }> => {
    if (!IS_STAFF) return { queue: null };
    try {
      return { queue: await fetchRetentionQueue() };
    } catch (error) {
      return { queue: null, error: error instanceof Error ? error.message : "Request failed" };
    }
  },
  component: RetentionPage,
});

const FILTERS = [
  ["new", "To reach"],
  ["contacted", "Contacted"],
  ["snoozed", "Snoozed"],
  ["dismissed", "Cleared"],
] as const;

const SORTS = {
  window: "Window closing",
  drop: "Steepest drop",
  renewal: "Renews soonest",
} as const;
type SortKey = keyof typeof SORTS;

const CHANNELS: { id: RetentionChannel; icon: typeof Mail }[] = [
  { id: "Email", icon: Mail },
  { id: "In-app", icon: MessageSquare },
  { id: "Coach call", icon: Phone },
];

const DISMISS_REASONS = [
  "Planned off-season",
  "Injury, already in touch",
  "Logging elsewhere",
  "False alarm",
];

const pct = (n: number) => `${Math.round(n * 100)}%`;
const firstName = (name: string) => name.split(" ")[0];
const fmtShort = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
// Queue weeks are computed in UTC on the server, so label them in UTC too.
const fmtWeek = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function compare(sort: SortKey, a: RetentionEntry, b: RetentionEntry) {
  if (sort === "drop") return b.drop - a.drop;
  if (sort === "renewal") {
    return (a.renewsInDays ?? Infinity) - (b.renewsInDays ?? Infinity) || b.drop - a.drop;
  }
  return a.weeksLeft - b.weeksLeft || b.drop - a.drop;
}

type EntryState = { status: RetentionStatus; lastAction: RetentionLastAction | null };

function RetentionPage() {
  const { queue, error } = Route.useLoaderData();

  if (!IS_STAFF) {
    return (
      <AppShell>
        <Notice
          icon={<Lock className="h-5 w-5 text-muted-foreground" />}
          title="Staff only"
          body="The retention queue shows other athletes' training, so it's limited to the Stride team."
        />
      </AppShell>
    );
  }

  if (!queue) {
    return (
      <AppShell>
        <Notice
          icon={<TriangleAlert className="h-5 w-5 text-accent" />}
          title="Couldn't load the queue"
          body={error ?? "Try refreshing the page."}
        />
      </AppShell>
    );
  }

  return <RetentionQueueView queue={queue} />;
}

function Notice({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md border border-border bg-surface px-6 py-14 text-center">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-surface-2">
        {icon}
      </div>
      <div className="mt-3 font-display text-base font-semibold">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">
        Back to feed
      </Link>
    </div>
  );
}

function RetentionQueueView({ queue }: { queue: RetentionQueue }) {
  const posthog = usePostHog();
  const [states, setStates] = useState<Record<string, EntryState>>(() =>
    Object.fromEntries(
      queue.entries.map((e) => [e.id, { status: e.status, lastAction: e.lastAction }]),
    ),
  );
  const [filter, setFilter] = useState<RetentionStatus>("new");
  const [sort, setSort] = useState<SortKey>("window");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<RetentionStatus, number> = { new: 0, contacted: 0, snoozed: 0, dismissed: 0 };
    Object.values(states).forEach((s) => (c[s.status] += 1));
    return c;
  }, [states]);

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    posthog?.capture("retention_queue_viewed", {
      flagged: queue.flagged,
      active_premium: queue.activePremium,
      to_reach: counts.new,
    });
  }, [posthog, queue, counts.new]);

  const visible = useMemo(
    () =>
      queue.entries
        .filter((e) => states[e.id].status === filter)
        .sort((a, b) => compare(sort, a, b)),
    [queue.entries, states, filter, sort],
  );

  const selected =
    (selectedId && queue.entries.find((e) => e.id === selectedId)) || visible[0] || null;
  const closingSoon = queue.entries.filter(
    (e) => e.weeksLeft <= 2 && states[e.id].status === "new",
  ).length;
  const reachable = queue.flagged - counts.dismissed;

  async function act(entry: RetentionEntry, input: RetentionActionInput, success: string) {
    setPendingId(entry.id);
    setFlash(null);
    try {
      const result = await recordRetentionAction(entry.id, input);
      setStates((prev) => ({ ...prev, [entry.id]: result }));
      setFlash({ tone: "ok", text: success });

      const props = { athlete_id: entry.id, weeks_left: entry.weeksLeft, drop: entry.drop };
      if (input.action === "contacted") {
        posthog?.capture("retention_outreach_logged", { ...props, channel: input.channel });
      } else if (input.action === "snoozed") {
        posthog?.capture("retention_athlete_snoozed", props);
      } else if (input.action === "dismissed") {
        posthog?.capture("retention_athlete_cleared", { ...props, reason: input.note });
      } else {
        posthog?.capture("retention_athlete_reopened", props);
      }

      if (input.action === "reopened") {
        setFilter("new");
        setSelectedId(entry.id);
      } else {
        // Advance to the next athlete still waiting in the current view.
        const next = visible.find((x) => x.id !== entry.id);
        setSelectedId(next ? next.id : null);
      }
    } catch (error) {
      setFlash({
        tone: "error",
        text: `Couldn't save that for ${firstName(entry.name)}: ${
          error instanceof Error ? error.message : "request failed"
        }. Nothing changed — try again.`,
      });
      posthog?.captureException(error);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-8 flex items-end justify-between gap-6 border-b border-border pb-8">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Internal · Retention · Week of {fmtWeek(queue.weekOf)}
          </div>
          <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-[-0.02em]">
            Retention queue
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Premium athletes whose last 28 days are half of the 28 before. Dormant athletes showed
            this fade about {WINDOW_WEEKS} weeks before they stopped, so reach them while the window
            is open.
          </p>
        </div>
        {closingSoon > 0 && (
          <div className="shrink-0 bg-secondary px-4 py-3 text-secondary-foreground">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/60">
              Window closing
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="stat-num text-2xl text-primary">{closingSoon}</span>
              <span className="text-xs text-secondary-foreground/75">≤ 2 weeks left</span>
            </div>
          </div>
        )}
      </div>

      {/* Stat strip */}
      <div className="mb-8 grid grid-cols-4 border border-border bg-surface">
        <StatCell>
          <Stat label="Active premium" value={queue.activePremium} />
        </StatCell>
        <StatCell border>
          <Stat
            label="Flagged this week"
            value={queue.flagged}
            unit={`· ${pct(queue.flagged / Math.max(1, queue.activePremium))}`}
            emphasis
          />
        </StatCell>
        <StatCell border>
          <Stat label="Median drop" value={`−${pct(queue.medianDrop)}`} unit="sessions" />
        </StatCell>
        <StatCell border>
          <Stat label="Reached" value={`${counts.contacted}`} unit={`/ ${reachable}`} />
          <div className="mt-2 h-1 overflow-hidden bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: pct(counts.contacted / Math.max(1, reachable)) }}
            />
          </div>
        </StatCell>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-6">
        {/* Queue */}
        <section className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex gap-1 rounded-md bg-surface-2 p-1">
              {FILTERS.map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => {
                    setFilter(id);
                    setSelectedId(null);
                    setFlash(null);
                  }}
                  className={`rounded px-3 py-1.5 text-sm transition-colors ${
                    filter === id
                      ? "bg-surface text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                  <span className="num ml-1.5 text-xs text-muted-foreground">{counts[id]}</span>
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-8 rounded-md border border-border bg-surface px-2 font-body text-xs normal-case tracking-normal text-foreground outline-none focus:border-foreground/40"
              >
                {Object.entries(SORTS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {flash && (
            <div
              role="status"
              className={`mb-3 flex items-center gap-2 border px-3 py-2 text-sm ${
                flash.tone === "ok" ? "border-pr/40 bg-pr/10" : "border-primary/40 bg-primary/10"
              }`}
            >
              {flash.tone === "ok" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-pr" />
              ) : (
                <TriangleAlert className="h-4 w-4 shrink-0 text-primary" />
              )}
              {flash.text}
            </div>
          )}

          <div className="border border-border bg-surface">
            <div className="grid grid-cols-[minmax(0,1fr)_84px_64px_72px] items-center gap-3 border-b border-border bg-surface-2 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span>Athlete</span>
              <span>12 wks</span>
              <span className="text-right">28d</span>
              <span className="text-right">Window</span>
            </div>
            {visible.length === 0 ? (
              <EmptyState filter={filter} noneFlagged={queue.flagged === 0} />
            ) : (
              <ul>
                {visible.map((e) => (
                  <QueueRow
                    key={e.id}
                    entry={e}
                    active={selected?.id === e.id}
                    onSelect={() => {
                      setSelectedId(e.id);
                      setFlash(null);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Detail */}
        <aside className="min-w-0">
          {selected ? (
            <DetailPanel
              key={selected.id}
              entry={selected}
              state={states[selected.id]}
              pending={pendingId === selected.id}
              onLog={(channel, message) =>
                act(
                  selected,
                  { action: "contacted", channel, message },
                  `${channel === "Coach call" ? "Call logged for" : "Check-in logged for"} ${selected.name}.`,
                )
              }
              onSnooze={() =>
                act(selected, { action: "snoozed" }, `${selected.name} snoozed until next Monday.`)
              }
              onDismiss={(note) =>
                act(
                  selected,
                  { action: "dismissed", note },
                  `${selected.name} cleared from the queue.`,
                )
              }
              onReopen={() =>
                act(
                  selected,
                  { action: "reopened" },
                  `${firstName(selected.name)} is back in the queue.`,
                )
              }
            />
          ) : (
            <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Select an athlete to see their fade and reach out.
            </div>
          )}
        </aside>
      </div>
    </AppShell>
  );
}

/* ===== Queue ===== */

function StatCell({ children, border }: { children: React.ReactNode; border?: boolean }) {
  return <div className={`p-4 ${border ? "border-l border-border" : ""}`}>{children}</div>;
}

function QueueRow({
  entry: e,
  active,
  onSelect,
}: {
  entry: RetentionEntry;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        onClick={onSelect}
        className={`grid w-full grid-cols-[minmax(0,1fr)_84px_64px_72px] items-center gap-3 border-b border-border/70 px-4 py-3 text-left transition-colors last:border-0 ${
          active ? "bg-surface-2 shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-surface-2/60"
        }`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <img src={e.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{e.name}</span>
              <SportBadge sport={e.sport} className="!px-1.5 !py-0.5 !text-[10px]" />
            </div>
            <div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Premium · {e.city}
              {e.renewsInDays !== null && e.renewsInDays <= 30 && (
                <span className="text-primary"> · renews {e.renewsInDays}d</span>
              )}
            </div>
          </div>
        </div>
        <Sparkline weekly={e.weekly} />
        <div className="text-right">
          <div className="stat-num text-base font-bold text-primary">−{pct(e.drop)}</div>
          <div className="num text-[10px] text-muted-foreground">
            {e.prior28}→{e.last28}
          </div>
        </div>
        <WindowPill weeksLeft={e.weeksLeft} />
      </button>
    </li>
  );
}

function Sparkline({ weekly }: { weekly: number[] }) {
  const max = Math.max(...weekly, 1);
  return (
    <svg viewBox="0 0 84 28" className="h-7 w-[84px]" aria-label="Sessions per week, last 12 weeks">
      {weekly.map((v, i) => {
        const h = Math.max(1.5, (v / max) * 26);
        const recent = i >= WEEKS_SHOWN - 4;
        return (
          <rect
            key={i}
            x={i * 7}
            y={28 - h}
            width={5}
            height={h}
            fill={recent ? "var(--primary)" : "currentColor"}
            className={recent ? "" : "text-foreground/20"}
          />
        );
      })}
    </svg>
  );
}

function WindowPill({ weeksLeft }: { weeksLeft: number }) {
  const urgent = weeksLeft <= 2;
  return (
    <div className="text-right">
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${
          urgent ? "bg-secondary text-secondary-foreground" : "bg-surface-2 text-foreground/80"
        }`}
      >
        ~{weeksLeft} wk
      </span>
    </div>
  );
}

function EmptyState({ filter, noneFlagged }: { filter: RetentionStatus; noneFlagged: boolean }) {
  const copy: Record<RetentionStatus, [string, string]> = {
    new: noneFlagged
      ? [
          "No one is fading this week",
          "No active premium athlete halved their sessions in the last 28 days.",
        ]
      : [
          "Queue cleared for this week",
          "Every flagged athlete has been reached, snoozed or cleared.",
        ],
    contacted: ["No one reached yet", "Log a check-in from the To reach list."],
    snoozed: ["Nothing snoozed", "Snoozed athletes come back next Monday."],
    dismissed: [
      "Nothing cleared",
      "Clear athletes who aren't really at risk, like a planned break.",
    ],
  };
  const [title, body] = copy[filter];
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-pr/15">
        <Check className="h-5 w-5 text-pr" />
      </div>
      <div className="mt-3 font-display text-base font-semibold">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

/* ===== Detail ===== */

function DetailPanel({
  entry: e,
  state,
  pending,
  onLog,
  onSnooze,
  onDismiss,
  onReopen,
}: {
  entry: RetentionEntry;
  state: EntryState;
  pending: boolean;
  onLog: (channel: RetentionChannel, message: string) => void;
  onSnooze: () => void;
  onDismiss: (note: string) => void;
  onReopen: () => void;
}) {
  const [channel, setChannel] = useState<RetentionChannel>("Email");
  const [message, setMessage] = useState(e.drafts.Email);
  const [dismissing, setDismissing] = useState(false);
  const [copied, setCopied] = useState(false);

  const dormantBy = new Date(Date.now() + e.weeksLeft * 7 * 86_400_000);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the text is still selectable in the box.
    }
  }

  return (
    <div className="scrollbar-thin sticky top-24 max-h-[calc(100vh-7rem)] space-y-4 overflow-y-auto">
      {/* Who */}
      <section className="border border-border bg-surface p-5">
        <div className="flex items-start gap-3">
          <img src={e.avatar} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
          <div className="min-w-0 flex-1">
            <Link
              to="/athlete/$id"
              params={{ id: e.id }}
              className="block truncate font-display text-xl font-bold leading-tight hover:underline"
            >
              {e.name}
            </Link>
            <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <MapPin className="h-3 w-3" /> {e.city} · @{e.handle}
            </div>
          </div>
          <SportBadge sport={e.sport} />
        </div>
        <dl className="mt-4 grid grid-cols-3 border-t border-border/70 pt-3 text-xs">
          <Meta label="Plan" value="Premium" />
          <Meta label="Member" value={`${e.memberMonths} mo`} />
          <Meta
            label="Renews"
            value={e.renewsInDays === null ? "—" : `${e.renewsInDays} d`}
            highlight={e.renewsInDays !== null && e.renewsInDays <= 30}
          />
        </dl>
      </section>

      {/* Window */}
      <section className="bg-secondary p-5 text-secondary-foreground">
        <div className="flex items-baseline justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/60">
            Window to reach
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-secondary-foreground/60">
            Fade wk {e.fadeWeeksAgo} of {WINDOW_WEEKS}
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="stat-num text-4xl text-primary">~{e.weeksLeft}</span>
          <span className="text-sm text-secondary-foreground/80">weeks left</span>
        </div>
        <div className="mt-3 grid grid-cols-8 gap-1">
          {Array.from({ length: WINDOW_WEEKS }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 ${i < e.fadeWeeksAgo ? "bg-primary" : "bg-secondary-foreground/15"}`}
            />
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-secondary-foreground/70">
          If {firstName(e.name)} follows the dormant pattern, they stop around{" "}
          <span className="text-secondary-foreground">{fmtShort(dormantBy)}</span>.
        </p>
      </section>

      {/* Fade chart */}
      <section className="border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold">Sessions per week</h3>
          <div className="flex items-center gap-1 text-sm font-semibold text-primary">
            <ArrowDownRight className="h-4 w-4" />
            <span className="stat-num">−{pct(e.drop)}</span>
          </div>
        </div>
        <FadeChart entry={e} />
        <div className="mt-2 flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 bg-primary" /> Last 28d
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 bg-foreground/20" /> Before
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-px w-3 border-t border-dashed border-foreground" /> Dormant path
          </span>
        </div>
        {e.signals.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-border/70 pt-4">
            {e.signals.map((s) => (
              <li key={s} className="flex items-start gap-2 text-sm">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                {s}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Action */}
      {state.status === "new" ? (
        <section className="border border-border bg-surface p-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Reach out
          </div>
          <div className="mt-3 grid grid-cols-3 border border-border">
            {CHANNELS.map(({ id, icon: Icon }, i) => (
              <button
                key={id}
                onClick={() => {
                  setChannel(id);
                  setMessage(e.drafts[id]);
                }}
                className={`inline-flex items-center justify-center gap-1.5 py-2 text-xs transition-colors ${
                  i > 0 ? "border-l border-border" : ""
                } ${
                  channel === id
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {id}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <label
              htmlFor="retention-message"
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
            >
              {channel === "Coach call" ? "Call notes" : "Message"}
            </label>
            {channel !== "Coach call" && (
              <button
                onClick={copyMessage}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
            )}
          </div>
          <textarea
            id="retention-message"
            value={message}
            onChange={(ev) => setMessage(ev.target.value)}
            rows={channel === "Coach call" ? 4 : 7}
            className="mt-1.5 w-full resize-none rounded-md border border-border bg-transparent p-3 text-sm leading-6 outline-none focus:border-foreground/40"
          />
          {channel !== "Coach call" && (
            <p className="mt-1 text-xs text-muted-foreground">
              Stride doesn't send this for you. Send it from Intercom or email, then log it here.
            </p>
          )}
          <button
            onClick={() => onLog(channel, message)}
            disabled={!message.trim() || pending}
            className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-95 disabled:opacity-50"
          >
            {channel === "Coach call" ? (
              <Phone className="h-4 w-4" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {pending ? "Saving…" : channel === "Coach call" ? "Log call" : "Log check-in"}
          </button>

          {dismissing ? (
            <div className="mt-3 border-t border-border/70 pt-3">
              <div className="text-xs text-muted-foreground">
                Why isn't {firstName(e.name)} at risk?
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DISMISS_REASONS.map((reason) => (
                  <button
                    key={reason}
                    disabled={pending}
                    onClick={() => onDismiss(reason)}
                    className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={onSnooze}
                disabled={pending}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border text-xs hover:bg-muted disabled:opacity-50"
              >
                <BellOff className="h-3.5 w-3.5" /> Snooze 1 week
              </button>
              <button
                onClick={() => setDismissing(true)}
                disabled={pending}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <ShieldCheck className="h-3.5 w-3.5" /> Not at risk
              </button>
            </div>
          )}
        </section>
      ) : (
        <HandledCard entry={e} state={state} pending={pending} onReopen={onReopen} />
      )}
    </div>
  );
}

function Meta({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className={`mt-0.5 font-medium ${highlight ? "text-primary" : ""}`}>{value}</dd>
    </div>
  );
}

function FadeChart({ entry: e }: { entry: RetentionEntry }) {
  const data = e.weekly.map((sessions, i) => ({
    label: i === WEEKS_SHOWN - 1 ? "Last" : `−${WEEKS_SHOWN - 1 - i}`,
    sessions,
    dormant: e.dormantPath[i],
  }));
  return (
    <div className="mt-3 h-40">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            interval={1}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v, name) => [v, name === "sessions" ? "Sessions" : "Dormant path"]}
          />
          <Bar dataKey="sessions" radius={[2, 2, 0, 0]}>
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={i >= WEEKS_SHOWN - 4 ? "var(--primary)" : "var(--foreground)"}
                fillOpacity={i >= WEEKS_SHOWN - 4 ? 1 : 0.2}
              />
            ))}
          </Bar>
          <Line
            dataKey="dormant"
            type="monotone"
            stroke="var(--foreground)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function HandledCard({
  entry: e,
  state,
  pending,
  onReopen,
}: {
  entry: RetentionEntry;
  state: EntryState;
  pending: boolean;
  onReopen: () => void;
}) {
  const first = firstName(e.name);
  const last = state.lastAction;
  const when = last ? fmtShort(new Date(last.createdAt)) : "";
  const by = last ? ` by ${last.actorName}` : "";
  const copy: Record<
    Exclude<RetentionStatus, "new">,
    { icon: typeof Mail; title: string; body: string }
  > = {
    contacted: {
      icon:
        last?.channel === "Coach call" ? Phone : last?.channel === "In-app" ? MessageSquare : Mail,
      title: `Reached via ${last?.channel?.toLowerCase() ?? "check-in"} · ${when}`,
      body: `Logged${by}. Watching for ${first}'s next session. If nothing is logged in 7 days, they come back to the queue.`,
    },
    snoozed: {
      icon: CalendarClock,
      title: `Snoozed · ${when}`,
      body: `Snoozed${by}. ${first} comes back to the queue next Monday.`,
    },
    dismissed: {
      icon: ShieldCheck,
      title: `Cleared · ${when}`,
      body: last?.note
        ? `Cleared${by}. Reason: ${last.note}`
        : `${first} won't be flagged again this cycle.`,
    },
  };
  const { icon: Icon, title, body } = copy[state.status as Exclude<RetentionStatus, "new">];
  return (
    <section className="border border-border bg-surface p-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
      <button
        onClick={onReopen}
        disabled={pending}
        className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <RotateCcw className="h-3.5 w-3.5" /> Move back to queue
      </button>
    </section>
  );
}
