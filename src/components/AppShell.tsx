import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Activity,
  ArrowUpRight,
  Compass,
  Trophy,
  Users,
  BarChart3,
  Plus,
  Search,
  Bell,
  Clock3,
  Settings,
} from "lucide-react";
import { ME, clearAppData } from "@/lib/mock-data";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import {
  fetchCommunityChallenge,
  logout,
  updateCommunityNotification,
  type CommunityChallengeData,
} from "@/lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePostHog } from "@posthog/react";

const NAV = [
  { to: "/", label: "Feed", icon: Home },
  { to: "/athletes", label: "Athletes", icon: Users },
  { to: "/training", label: "Training Log", icon: BarChart3 },
  { to: "/segments", label: "Segments", icon: Compass },
  { to: "/challenges", label: "Challenges", icon: Trophy },
  { to: "/clubs", label: "Clubs", icon: Users },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const posthog = usePostHog();
  const { location } = useRouterState();
  const path = location.pathname;
  const [searchQuery, setSearchQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [communityUpdate, setCommunityUpdate] = useState<CommunityChallengeData | null>(null);

  useEffect(() => {
    let active = true;
    void fetchCommunityChallenge().then(
      (result) => {
        if (active) setCommunityUpdate(result);
      },
      () => {
        // The rest of the app should remain usable if notifications are unavailable.
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const notification = communityUpdate?.notification;
  const notificationParticipant = communityUpdate?.participants.find(
    (participant) => participant.id === notification?.anchorContributionId,
  );

  function openCommunityNotification() {
    if (!notification || !communityUpdate) return;
    setCommunityUpdate({
      ...communityUpdate,
      notification: { ...notification, pending: false },
    });
    void updateCommunityNotification(notification.id, "open");
    posthog.capture("community_momentum_notification_opened", {
      challenge_id: communityUpdate.challenge.id,
      local_area: communityUpdate.challenge.localArea,
      notification_policy: "meaningful_cluster",
      bundled_contributions: notification.bundledContributions,
      bundled_distance_km: notification.bundledDistanceKm,
      entry_surface: "app_header",
    });
  }

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
              <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="relative grid h-10 w-10 place-items-center rounded-md hover:bg-muted"
                    aria-label="Notifications"
                    title="Open notifications"
                  >
                    <Bell className="h-4 w-4" />
                    {notification?.pending && (
                      <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" sideOffset={8} className="w-[360px] p-0">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div>
                      <div className="font-display text-sm font-semibold">Notifications</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Local activity updates
                      </div>
                    </div>
                    {notification?.pending && (
                      <span className="rounded-full bg-primary/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-primary">
                        New
                      </span>
                    )}
                  </div>

                  {notification && communityUpdate ? (
                    <Link
                      to="/challenges/$id"
                      params={{ id: communityUpdate.challenge.id }}
                      search={{ state: "returned" }}
                      onClick={openCommunityNotification}
                      className="group block p-4 text-left transition-colors hover:bg-muted/70"
                    >
                      <div className="flex gap-3">
                        <div className="relative shrink-0">
                          {notificationParticipant ? (
                            <img
                              src={notificationParticipant.avatar}
                              alt=""
                              className="h-10 w-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-secondary-foreground">
                              <Trophy className="h-4 w-4" />
                            </div>
                          )}
                          <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-popover bg-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-display text-sm font-semibold leading-5">
                            {communityUpdate.challenge.localArea} just moved{" "}
                            {notification.bundledDistanceKm.toFixed(1)} km
                          </div>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {notificationParticipant?.name.split(" ")[0] ?? "Local athletes"} and{" "}
                            {Math.max(notification.bundledContributions - 1, 0)} others added new
                            badges. See the latest challenge momentum.
                          </p>
                          <div className="mt-2 flex items-center justify-between">
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Clock3 className="h-3 w-3" /> Just now
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                              View challenge
                              <ArrowUpRight className="h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ) : (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      You’re all caught up.
                    </div>
                  )}
                </PopoverContent>
              </Popover>
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
