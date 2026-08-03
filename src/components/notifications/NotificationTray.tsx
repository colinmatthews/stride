/**
 * The bell tray: a Popover anchored to the header bell. Shows the 5 most recent
 * notifications for a quick glance, plus footer actions that leave the tray for
 * the full notification-center page. Settings is never rendered inside the tray.
 */
import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, Settings, ChevronRight } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { NotificationRow, EmptyInbox } from "./shared";
import { useInbox } from "./NotificationsProvider";

const TRAY_LIMIT = 5;

export function NotificationTray() {
  const [open, setOpen] = useState(false);
  const inbox = useInbox();
  const { location } = useRouterState();
  const onNotificationsPage = location.pathname.startsWith("/notifications");

  const recent = [...inbox.items]
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .slice(0, TRAY_LIMIT);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "h-10 w-10 grid place-items-center rounded-md relative text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground",
            onNotificationsPage && "bg-muted text-foreground",
          )}
          aria-label={inbox.unread > 0 ? `Notifications, ${inbox.unread} unread` : "Notifications"}
        >
          <Bell className="h-4 w-4" />
          {inbox.unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
              {inbox.unread > 9 ? "9+" : inbox.unread}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-96 p-0">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          {inbox.unread > 0 && <Badge className="h-5 min-w-5 px-1">{inbox.unread}</Badge>}
          <button
            onClick={inbox.markAll}
            disabled={inbox.unread === 0}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground"
          >
            Mark all as read
          </button>
        </div>

        {/* Body: 5 most recent */}
        {recent.length === 0 ? (
          <EmptyInbox />
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((n) => (
              <li key={n.id}>
                <NotificationRow n={n} onMarkRead={inbox.markOne} compact />
              </li>
            ))}
          </ul>
        )}

        {/* Footer: settings on the left; primary (with right arrow) on the right */}
        <div className="flex items-center gap-2 border-t border-border p-2">
          <Link
            to="/notifications"
            search={{ view: "settings" }}
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Settings className="h-4 w-4" /> Settings
          </Link>
          <Link
            to="/notifications"
            search={{ view: undefined }}
            onClick={() => setOpen(false)}
            className="group flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-95"
          >
            See all notifications
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
