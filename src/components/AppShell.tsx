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
  Settings,
} from "lucide-react";
import { ME, clearAppData } from "@/lib/mock-data";
import { ReactNode } from "react";
import { logout } from "@/lib/api";

const NAV = [
  { to: "/", label: "Feed", icon: Home },
  { to: "/training", label: "Training Log", icon: BarChart3 },
  { to: "/segments", label: "Segments", icon: Compass },
  { to: "/challenges", label: "Challenges", icon: Trophy },
  { to: "/clubs", label: "Clubs", icon: Users },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { location } = useRouterState();
  const path = location.pathname;

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
            <div className="relative w-full max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search athletes, segments, clubs…"
                className="w-full h-10 pl-10 pr-3 rounded-md bg-surface-2 border border-transparent focus:border-border focus:bg-surface text-sm outline-none"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                className="h-10 w-10 grid place-items-center rounded-md hover:bg-muted relative"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
              </button>
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
