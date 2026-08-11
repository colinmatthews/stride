/**
 * Shared building blocks for the notification center.
 *
 * State is lifted here (useInboxController / useSettingsController) and owned by
 * NotificationsProvider, so the header bell, the tray, and the page all read one
 * source of truth. The presentational pieces (NotificationRow, ChannelCards,
 * CategoryMatrix …) are layout-agnostic.
 *
 * Mutations are optimistic and roll back on failure. The prototype fired these
 * without awaiting or catching, which left the UI silently diverged from the
 * server whenever a save failed — the "either I'm missing something obvious or
 * the toggles aren't working" complaint this feature exists to fix.
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  ThumbsUp,
  MessageCircle,
  UserPlus,
  Trophy,
  Mountain,
  Users,
  Sparkles,
  Check,
  Smartphone,
  Mail,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  NOTIFICATIONS,
  NOTIFICATIONS_NEXT_CURSOR,
  NOTIFICATIONS_UNREAD,
  NOTIFICATION_PREFERENCES,
  getAthlete,
  fmtTimeAgo,
  type AppNotification,
  type NotificationChannel,
  type NotificationCategory,
  type NotificationKind,
  type NotificationChannelKey,
} from "@/lib/mock-data";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  updateNotificationPreferences,
} from "@/lib/api";

/* ------------------------------------------------------------------ */
/* Visual maps                                                        */
/* ------------------------------------------------------------------ */

export const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  kudos: ThumbsUp,
  comment: MessageCircle,
  follow: UserPlus,
  challenge: Trophy,
  segment: Mountain,
  club: Users,
  system: Sparkles,
};

// Opaque, high-contrast fills so the small corner icon stays readable on top
// of the actor avatar behind it.
export const KIND_TINT: Record<NotificationKind, string> = {
  kudos: "bg-primary text-primary-foreground",
  comment: "bg-secondary text-secondary-foreground",
  follow: "bg-primary text-primary-foreground",
  challenge: "bg-accent text-accent-foreground",
  segment: "bg-secondary text-secondary-foreground",
  club: "bg-accent text-accent-foreground",
  system: "bg-secondary text-secondary-foreground",
};

export const KIND_LABEL: Record<NotificationKind, string> = {
  kudos: "Kudos",
  comment: "Comments",
  follow: "Follows",
  challenge: "Challenges",
  segment: "Segments",
  club: "Clubs",
  system: "System",
};

export const CHANNEL_ICON: Record<NotificationChannelKey, LucideIcon> = {
  push: Smartphone,
  email: Mail,
};

/* ------------------------------------------------------------------ */
/* Controllers (lifted state)                                         */
/* ------------------------------------------------------------------ */

export interface InboxController {
  items: AppNotification[];
  unread: number;
  hasMore: boolean;
  loadingMore: boolean;
  markOne: (id: string) => void;
  markAll: () => void;
  loadMore: () => void;
}

function sortByNewest(items: AppNotification[]) {
  return [...items].sort((left, right) => +new Date(right.date) - +new Date(left.date));
}

export function useInboxController(): InboxController {
  // Seeded from the module store, which /api/bootstrap hydrates, so the tray is
  // populated on first paint and survives the per-route remount of AppShell.
  const [items, setItems] = useState(() => NOTIFICATIONS.map((n) => ({ ...n })));
  // The count comes from the server rather than being derived from `items`: the
  // inbox holds one page, and the badge must reflect every unread notification.
  const [unread, setUnread] = useState(NOTIFICATIONS_UNREAD);
  // Bootstrap returns the first page plus its cursor; anything older is fetched
  // on demand. Without this the inbox would be permanently capped at that first
  // page while the badge counted every unread notification.
  const [cursor, setCursor] = useState<string | undefined>(NOTIFICATIONS_NEXT_CURSOR);
  const [loadingMore, setLoadingMore] = useState(false);

  async function markOne(id: string) {
    const target = items.find((n) => n.id === id);

    if (!target || target.read) {
      return;
    }

    setItems((state) => state.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((state) => Math.max(state - 1, 0));

    try {
      const result = await markNotificationRead(id);
      setUnread(result.unread);
    } catch {
      // Revert only this row. Restoring a whole-array snapshot would also undo
      // any other read that succeeded while this request was in flight.
      setItems((state) => state.map((n) => (n.id === id ? { ...n, read: false } : n)));
      setUnread((state) => state + 1);
      toast.error("Couldn't mark that as read. Please try again.");
    }
  }

  async function markAll() {
    const previousUnreadIds = new Set(items.filter((n) => !n.read).map((n) => n.id));
    const previousUnread = unread;

    setItems((state) => state.map((n) => ({ ...n, read: true })));
    setUnread(0);

    try {
      await markAllNotificationsRead();
    } catch {
      // Restore by id, so rows that arrived mid-flight keep their own state.
      setItems((state) =>
        state.map((n) => (previousUnreadIds.has(n.id) ? { ...n, read: false } : n)),
      );
      setUnread(previousUnread);
      toast.error("Couldn't mark everything as read. Please try again.");
    }
  }

  async function loadMore() {
    if (!cursor || loadingMore) {
      return;
    }

    setLoadingMore(true);

    try {
      const page = await fetchNotifications({ cursor });

      setItems((state) => {
        const byId = new Map(state.map((n) => [n.id, n]));
        for (const notification of page.notifications) {
          byId.set(notification.id, notification);
        }
        return sortByNewest(Array.from(byId.values()));
      });
      setCursor(page.nextCursor);
      setUnread(page.unread);
    } catch {
      toast.error("Couldn't load older notifications. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  return {
    items,
    unread,
    hasMore: Boolean(cursor),
    loadingMore,
    markOne,
    markAll,
    loadMore,
  };
}

export interface SettingsController {
  channels: NotificationChannel[];
  categories: NotificationCategory[];
  channelEnabled: Record<NotificationChannelKey, boolean>;
  toggleChannel: (key: NotificationChannelKey) => void;
  toggleCategory: (kind: NotificationKind, key: NotificationChannelKey) => void;
}

export function useSettingsController(): SettingsController {
  const [channels, setChannels] = useState(() =>
    NOTIFICATION_PREFERENCES.channels.map((c) => ({ ...c })),
  );
  const [categories, setCategories] = useState(() =>
    NOTIFICATION_PREFERENCES.categories.map((c) => ({ ...c, channels: { ...c.channels } })),
  );
  // Each save returns the full recomputed state. Without sequencing, a slow
  // response from an earlier toggle would land last and flip a newer one back.
  const latestSave = useRef(0);

  const channelEnabled = useMemo(
    () =>
      Object.fromEntries(channels.map((c) => [c.key, c.enabled])) as Record<
        NotificationChannelKey,
        boolean
      >,
    [channels],
  );

  async function toggleChannel(key: NotificationChannelKey) {
    const previous = channels;
    const next = !channels.find((c) => c.key === key)?.enabled;
    const seq = ++latestSave.current;

    setChannels((state) => state.map((c) => (c.key === key ? { ...c, enabled: next } : c)));

    try {
      // Absolute value, not a toggle: the request carries the state the UI is
      // already showing, so a retry cannot land on the opposite value.
      const saved = await updateNotificationPreferences({ channels: { [key]: next } });

      if (seq !== latestSave.current) {
        return;
      }

      setChannels(saved.channels);
      setCategories(saved.categories);
    } catch {
      setChannels(previous);
      toast.error("Couldn't save that setting. Please try again.");
    }
  }

  async function toggleCategory(kind: NotificationKind, key: NotificationChannelKey) {
    const previous = categories;
    const next = !categories.find((c) => c.kind === kind)?.channels[key];
    const seq = ++latestSave.current;

    setCategories((state) =>
      state.map((c) => (c.kind === kind ? { ...c, channels: { ...c.channels, [key]: next } } : c)),
    );

    try {
      const saved = await updateNotificationPreferences({
        categories: [{ kind, channels: { [key]: next } }],
      });

      if (seq !== latestSave.current) {
        return;
      }

      setChannels(saved.channels);
      setCategories(saved.categories);
    } catch {
      setCategories(previous);
      toast.error("Couldn't save that setting. Please try again.");
    }
  }

  return { channels, categories, channelEnabled, toggleChannel, toggleCategory };
}

/* ------------------------------------------------------------------ */
/* Time grouping (used by variants that group content by recency)     */
/* ------------------------------------------------------------------ */

export interface NotificationGroup {
  label: string;
  items: AppNotification[];
}

export function groupByRecency(items: AppNotification[]): NotificationGroup[] {
  const now = Date.now();
  const DAY = 86400000;
  const buckets: Record<string, AppNotification[]> = {
    Today: [],
    "This week": [],
    Earlier: [],
  };
  for (const n of items) {
    const age = now - new Date(n.date).getTime();
    if (age < DAY) buckets.Today.push(n);
    else if (age < 7 * DAY) buckets["This week"].push(n);
    else buckets.Earlier.push(n);
  }
  return Object.entries(buckets)
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => ({ label, items: list }));
}

/* ------------------------------------------------------------------ */
/* Presentational atoms                                               */
/* ------------------------------------------------------------------ */

/**
 * Renders the row's content as a link to whatever the notification references.
 *
 * TanStack Router's Link is aggressively generic, so spreading union-typed props
 * fights the type checker. Switching on the target type and returning a concrete
 * Link per branch keeps `to`/`params` pairings checked at compile time — a wrong
 * pairing becomes a build error rather than a runtime 404.
 */
function NotificationLink({
  n,
  className,
  onNavigate,
  children,
}: {
  n: AppNotification;
  className: string;
  onNavigate?: () => void;
  children: ReactNode;
}) {
  const shared = { className, onClick: onNavigate };

  switch (n.target?.type) {
    case "activity":
      return (
        <Link
          to="/activity/$id"
          params={{ id: n.target.id! }}
          // The comment thread is a presentation detail of the activity page,
          // so the hash is derived here rather than carried in the payload.
          hash={n.kind === "comment" ? "comments" : undefined}
          {...shared}
        >
          {children}
        </Link>
      );
    case "athlete":
      return (
        <Link to="/athlete/$id" params={{ id: n.target.id! }} {...shared}>
          {children}
        </Link>
      );
    case "club":
      return (
        <Link to="/club/$id" params={{ id: n.target.id! }} {...shared}>
          {children}
        </Link>
      );
    case "segment":
      return (
        <Link to="/segment/$id" params={{ id: n.target.id! }} {...shared}>
          {children}
        </Link>
      );
    case "challenge":
      return (
        <Link to="/challenges" {...shared}>
          {children}
        </Link>
      );
    case "training":
      return (
        <Link to="/training" {...shared}>
          {children}
        </Link>
      );
    default:
      // Nothing worth linking to — render inert, with no cursor or hover.
      return <div className={className}>{children}</div>;
  }
}

export function NotificationRow({
  n,
  onMarkRead,
  onNavigate,
  compact = false,
}: {
  n: AppNotification;
  onMarkRead?: (id: string) => void;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const Icon = KIND_ICON[n.kind];
  const actor = n.actorId ? getAthlete(n.actorId) : null;
  const avatarSize = compact ? "h-8 w-8" : "h-10 w-10";
  const clickable = Boolean(n.target);

  // Opening a notification is the clearest signal it has been seen. markOne
  // already no-ops on an already-read row and keeps unread server-authoritative.
  function handleNavigate() {
    if (!n.read) {
      onMarkRead?.(n.id);
    }
    onNavigate?.();
  }

  return (
    <div
      className={cn(
        "flex items-start transition-colors",
        compact ? "px-3 py-3" : "px-5 py-4",
        !n.read && "bg-primary/[0.04]",
        clickable && "hover:bg-muted/40",
      )}
    >
      {/* Only the avatar and text are inside the link. The Read button stays a
          sibling: a <button> nested in an <a> is invalid HTML and gives the row
          two competing click targets. */}
      <NotificationLink
        n={n}
        onNavigate={handleNavigate}
        className={cn("flex min-w-0 flex-1 items-start", compact ? "gap-3" : "gap-4")}
      >
        <div className="relative shrink-0">
          {actor ? (
            <Avatar className={avatarSize}>
              <AvatarImage src={actor.avatar} alt={actor.name} />
              <AvatarFallback>{actor.name.slice(0, 2)}</AvatarFallback>
            </Avatar>
          ) : (
            <div className={cn("grid place-items-center rounded-full bg-muted", avatarSize)}>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <span
            className={cn(
              "absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full ring-2 ring-card",
              KIND_TINT[n.kind],
            )}
          >
            <Icon className="h-3 w-3" />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className={cn("font-medium leading-snug", compact ? "text-[13px]" : "text-sm")}>
              {n.title}
            </p>
            {!n.read && (
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
                aria-label="Unread"
              />
            )}
          </div>
          {!compact && <p className="text-sm text-muted-foreground mt-0.5">{n.body}</p>}
          <p className="text-xs text-muted-foreground mt-1.5">{fmtTimeAgo(n.date)}</p>
        </div>
      </NotificationLink>

      {!n.read && onMarkRead && (
        <button
          onClick={() => onMarkRead(n.id)}
          className="ml-3 shrink-0 self-center inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Check className="h-3.5 w-3.5" />
          {!compact && "Read"}
        </button>
      )}
    </div>
  );
}

export function EmptyInbox({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid place-items-center gap-2 px-6 py-16 text-center text-muted-foreground",
        className,
      )}
    >
      <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
        <Bell className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-foreground">You’re all caught up</p>
      <p className="text-xs">New kudos, comments and follows will show up here.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Settings atoms                                                     */
/* ------------------------------------------------------------------ */

export function ChannelCards({ settings }: { settings: SettingsController }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {settings.channels.map((c) => {
        const Icon = CHANNEL_ICON[c.key];
        return (
          <Card key={c.key} className={cn(!c.enabled && "bg-surface-2 shadow-none")}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="grid h-9 w-9 place-items-center rounded-md bg-muted">
                  <Icon className="h-4 w-4" />
                </div>
                <Switch checked={c.enabled} onCheckedChange={() => settings.toggleChannel(c.key)} />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm font-medium">{c.label}</span>
                <Badge variant={c.enabled ? "secondary" : "outline"}>
                  {c.enabled ? "On" : "Off"}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{c.description}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function CategoryMatrix({ settings }: { settings: SettingsController }) {
  const { channels, categories, channelEnabled } = settings;
  return (
    <Card className="overflow-hidden py-0">
      <div className="hidden sm:grid grid-cols-[1fr_repeat(2,4rem)] items-center gap-2 px-5 py-3 border-b border-border bg-surface-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Type
        </span>
        {channels.map((c) => (
          <span
            key={c.key}
            className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {c.label}
          </span>
        ))}
      </div>
      <div className="divide-y divide-border">
        {categories.map((cat) => (
          <div
            key={cat.kind}
            className="grid grid-cols-[1fr_repeat(2,4rem)] items-center gap-2 px-5 py-4"
          >
            <div className="min-w-0 col-span-full sm:col-span-1">
              <div className="text-sm font-medium">{cat.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{cat.description}</div>
            </div>
            {channels.map((c) => {
              const on = cat.channels[c.key] && channelEnabled[c.key];
              return (
                <div key={c.key} className="flex items-center justify-center">
                  <div className="flex flex-col items-center gap-1">
                    <span className="sm:hidden text-[10px] uppercase tracking-wide text-muted-foreground">
                      {c.label}
                    </span>
                    <Switch
                      checked={on}
                      disabled={!channelEnabled[c.key]}
                      onCheckedChange={() => settings.toggleCategory(cat.kind, c.key)}
                      aria-label={`${cat.label} via ${c.label}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** A convenience block: channel masters above the per-type matrix. */
export function SettingsBlock({ settings }: { settings: SettingsController }) {
  return (
    <div className="space-y-8">
      <section>
        <h3 className="font-display text-lg font-semibold">Channels</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Turn a whole channel off to silence it everywhere.
        </p>
        <div className="mt-4">
          <ChannelCards settings={settings} />
        </div>
      </section>
      <section>
        <h3 className="font-display text-lg font-semibold">What you get notified about</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Fine-tune each type of notification per channel.
        </p>
        <div className="mt-4">
          <CategoryMatrix settings={settings} />
        </div>
      </section>
    </div>
  );
}

export type { AppNotification, NotificationKind };
