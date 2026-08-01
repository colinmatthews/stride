import { useEffect, useState } from "react";
import { usePostHog } from "@posthog/react";
import { Bell, CheckCircle2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { NotificationSummary } from "@/lib/mock-data";

export function NotificationBell({
  summary,
  onManage,
}: {
  summary: NotificationSummary | null;
  onManage: () => void;
}) {
  const posthog = usePostHog();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open && summary?.overThreshold) {
      posthog.capture("notification_bell_nudge_shown");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="h-10 w-10 grid place-items-center rounded-md hover:bg-muted relative"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {summary?.overThreshold && (
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="font-display text-sm font-medium">Notifications</span>
        </div>

        {summary?.overThreshold ? (
          <div className="mx-3 mb-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs">
            <p className="leading-5 text-foreground/80">
              That&apos;s a lot of pings for your first two weeks. Mute or digest what you
              don&apos;t need.
            </p>
            <div className="mt-2 flex gap-3">
              <button
                className="font-medium text-primary"
                onClick={() => {
                  setOpen(false);
                  onManage();
                }}
              >
                Manage notifications
              </button>
              <button
                className="text-muted-foreground"
                onClick={() => {
                  setOpen(false);
                  posthog.capture("notification_bell_nudge_dismissed");
                }}
              >
                Not now
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-5 w-5" />
            You&apos;re all caught up.
          </div>
        )}

        <button
          className="flex w-full items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground hover:bg-muted"
          onClick={() => {
            setOpen(false);
            onManage();
          }}
        >
          <Bell className="h-3.5 w-3.5" />
          Notification settings
        </button>
      </PopoverContent>
    </Popover>
  );
}
