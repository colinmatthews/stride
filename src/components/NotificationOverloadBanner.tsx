import { useEffect, useState } from "react";
import { usePostHog } from "@posthog/react";
import { BellRing, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { NotificationSummary } from "@/lib/mock-data";

function dismissedKey(userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  return `stride:notif-banner-dismissed:${userId}:${today}`;
}

export function NotificationOverloadBanner({
  userId,
  summary,
  onManage,
}: {
  userId: string;
  summary: NotificationSummary | null;
  onManage: () => void;
}) {
  const posthog = usePostHog();
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(dismissedKey(userId)) === "1",
  );

  const visible = Boolean(summary?.overThreshold) && !dismissed;

  useEffect(() => {
    if (visible) {
      posthog.capture("notification_overload_banner_shown");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!summary || !visible) return null;

  function dismiss() {
    localStorage.setItem(dismissedKey(userId), "1");
    setDismissed(true);
    posthog.capture("notification_overload_banner_dismissed");
  }

  return (
    <Card className="mx-8 mt-4 border-primary/30 p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10">
          <BellRing className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-display text-base font-medium tracking-tight">
              That&apos;s a lot of notifications for week two
            </p>
            <button
              aria-label="Dismiss"
              onClick={dismiss}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            You joined {summary.joinedDaysAgo} days ago and you&apos;re already past our healthy
            threshold of {summary.threshold} — choose how you want to hear about each type so Stride
            stays motivating, not noisy.
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-6 border-t border-border pt-5">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Kudos
          </div>
          <div className="font-display text-2xl">{summary.kudosThisWeek}</div>
        </div>
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Follows
          </div>
          <div className="font-display text-2xl">{summary.followsThisWeek}</div>
        </div>
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Reminders
          </div>
          <div className="font-display text-2xl">{summary.challengeRemindersThisWeek}</div>
        </div>
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Total this week
          </div>
          <div className="font-display text-2xl text-primary">{summary.totalThisWeek}</div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <Button onClick={onManage}>Manage notifications</Button>
        <button className="text-sm text-muted-foreground" onClick={dismiss}>
          Not now
        </button>
      </div>
    </Card>
  );
}
