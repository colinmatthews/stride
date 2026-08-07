import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Activity,
  Compass,
  Trophy,
  Users,
  BarChart3,
  Plus,
  Search,
  Bell,
  BellRing,
  BellPlus,
  Clock,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { usePostHog } from "@posthog/react";
import { fmtTimeAgo, ME, clearAppData, type ChallengeNotification } from "@/lib/mock-data";
import { FormEvent, ReactNode, useState } from "react";
import { fetchChallengeNotifications, logout } from "@/lib/api";
import { subscribeToPush } from "@/lib/push";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const NAV = [
  { to: "/", label: "Feed", icon: Home },
  { to: "/athletes", label: "Athletes", icon: Users },
  { to: "/training", label: "Training Log", icon: BarChart3 },
  { to: "/segments", label: "Segments", icon: Compass },
  { to: "/challenges", label: "Challenges", icon: Trophy },
  { to: "/clubs", label: "Clubs", icon: Users },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { location } = useRouterState();
  const path = location.pathname;
  const [searchQuery, setSearchQuery] = useState("");

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();
    if (query) window.location.href = `/search?q=${encodeURIComponent(query)}`;
  }

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // server may already have cleared the session — clear client state anyway
    }
    clearAppData();
    window.location.href = "/auth";
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-border bg-surface flex flex-col sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-border">
          <Link to="/" className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-sm bg-secondary font-display text-base font-bold text-secondary-foreground">
              S
            </div>
            <div className="leading-tight">
              <div className="font-display text-lg font-semibold tracking-tight">Stride</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Endurance
              </div>
            </div>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-secondary text-secondary-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
          <div className="pt-4 mt-4 border-t border-border">
            <Link
              to="/record"
              className="flex items-center gap-2 mx-2 px-3 py-2.5 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:opacity-95 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              Record activity
            </Link>
          </div>
        </nav>
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2">
            <Link
              to="/athlete/$id"
              params={{ id: "me" }}
              className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2 rounded-md hover:bg-muted"
            >
              <img src={ME.avatar} alt={ME.name} className="h-9 w-9 rounded-full object-cover" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{ME.name}</div>
                <div className="text-xs text-muted-foreground truncate">@{ME.handle}</div>
              </div>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </Link>
            <button
              onClick={handleLogout}
              className="rounded-md px-2 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Log out
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 bg-background/85 backdrop-blur border-b border-border">
          <div className="flex h-16 items-center gap-4 px-8">
            <form onSubmit={handleSearch} className="relative w-full max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                type="text"
                placeholder="Search athletes, segments, clubs…"
                aria-label="Search athletes"
                className="w-full h-10 pl-10 pr-3 rounded-md bg-surface-2 border border-transparent focus:border-border focus:bg-surface text-sm outline-none"
              />
            </form>
            <div className="ml-auto flex items-center gap-2">
              <NotificationsMenu />
              <Link
                to="/record"
                className="hidden md:inline-flex items-center gap-2 h-10 px-3 rounded-md border border-border text-sm hover:bg-muted"
              >
                <Activity className="h-4 w-4" /> Record
              </Link>
            </div>
          </div>
        </header>
        <main className="max-w-[1280px] mx-auto px-8 py-8">{children}</main>
      </div>
    </div>
  );
}

function fmtEndsIn(dateOnly: string): string {
  const end = new Date(`${dateOnly}T23:59:59.999Z`);
  const days = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  if (days <= 0) return "Ends today";
  if (days === 1) return "Ends tomorrow";
  return `Ends in ${days} days`;
}

function unitFor(metricType: string) {
  return metricType === "elevation_m" ? "m" : "km";
}

function NotificationsMenu() {
  const posthog = usePostHog();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<ChallengeNotification[] | null>(null);
  const [pushEnabled, setPushEnabled] = useState(
    () => typeof Notification !== "undefined" && Notification.permission === "granted",
  );

  async function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (nextOpen && notifications === null) {
      try {
        setNotifications(await fetchChallengeNotifications());
      } catch {
        setNotifications([]);
      }
    }
  }

  async function handleEnableNotifications() {
    if (pushEnabled) {
      toast("Notifications are already on", {
        description: "You'll get a push when you complete a challenge.",
      });
      return;
    }

    const result = await subscribeToPush();

    if (result === "subscribed") {
      setPushEnabled(true);
      toast("Notifications enabled", {
        description: "We'll ping you the moment you complete a challenge.",
      });
    } else if (result === "denied") {
      toast("Notifications blocked", {
        description: "Enable notifications for this site in your browser settings to turn this on.",
      });
    } else {
      toast("Not supported in this browser", {
        description: "Try a recent version of Chrome, Edge, or Firefox.",
      });
    }

    posthog.capture("push_notifications_opt_in_attempted", { result });
  }

  const hasNotifications = (notifications?.length ?? 0) > 0;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="h-10 w-10 grid place-items-center rounded-md hover:bg-muted relative"
          aria-label="Notifications"
        >
          {pushEnabled ? <BellRing className="h-4 w-4 text-primary" /> : <Bell className="h-4 w-4" />}
          {hasNotifications && (
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-display text-sm font-semibold">Notifications</h3>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications === null ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            <ul>
              {notifications.map((notification) => {
                const unit = unitFor(notification.metricType);

                return (
                  <li
                    key={`${notification.type}-${notification.challengeId}`}
                    className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0"
                  >
                    {notification.type === "completed" ? (
                      <Trophy className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                    ) : (
                      <Clock className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm">
                        {notification.type === "completed" ? (
                          <>
                            You completed{" "}
                            <span className="font-medium">
                              {notification.badge} {notification.name}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="font-medium">
                              {notification.badge} {notification.name}
                            </span>{" "}
                            ends soon — you're at{" "}
                            {Math.round((notification.myProgressKm / notification.goalKm) * 100)}%
                          </>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {notification.type === "completed"
                          ? fmtTimeAgo(notification.at)
                          : fmtEndsIn(notification.endsAt)}
                        {notification.type === "ending_soon" &&
                          ` · ${notification.myProgressKm.toFixed(1)} / ${notification.goalKm} ${unit}`}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-border p-2">
          <button
            onClick={handleEnableNotifications}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground hover:bg-muted"
          >
            {pushEnabled ? (
              <BellRing className="h-4 w-4 text-primary" />
            ) : (
              <BellPlus className="h-4 w-4" />
            )}
            {pushEnabled ? "Push notifications on" : "Enable push notifications"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
