import { useState } from "react";
import { usePostHog } from "@posthog/react";
import { BellRing, Heart, Trophy, UserPlus } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, updateNotificationPreference } from "@/lib/api";
import type { NotificationMode, NotificationSummary, NotificationType } from "@/lib/mock-data";

const PREF_ROWS: {
  type: NotificationType;
  label: string;
  description: string;
  icon: typeof Heart;
  countKey: "kudosThisWeek" | "followsThisWeek" | "challengeRemindersThisWeek";
}[] = [
  {
    type: "kudos",
    label: "Kudos",
    description: "When someone gives one of your activities kudos",
    icon: Heart,
    countKey: "kudosThisWeek",
  },
  {
    type: "follow",
    label: "New followers",
    description: "When another athlete starts following you",
    icon: UserPlus,
    countKey: "followsThisWeek",
  },
  {
    type: "challenge_reminder",
    label: "Challenge reminders",
    description: "Progress nudges for challenges you've joined",
    icon: Trophy,
    countKey: "challengeRemindersThisWeek",
  },
];

export function NotificationSettingsSheet({
  open,
  onOpenChange,
  summary,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: NotificationSummary | null;
  onUpdated: (summary: NotificationSummary) => void;
}) {
  const posthog = usePostHog();
  const [savingType, setSavingType] = useState<NotificationType | null>(null);
  const [error, setError] = useState("");

  if (!summary) return null;

  async function handleModeChange(type: NotificationType, mode: NotificationMode | "") {
    if (!mode) return;
    setError("");
    setSavingType(type);
    try {
      const updated = await updateNotificationPreference(type, mode);
      onUpdated(updated);
      posthog.capture("notification_preference_changed", { type, mode });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't save that change. Please try again.",
      );
    } finally {
      setSavingType(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4" />
            <SheetTitle>Notification settings</SheetTitle>
          </div>
          <SheetDescription>
            Choose how you hear about each type — instantly, bundled into a daily digest, or muted
            entirely.
          </SheetDescription>
        </SheetHeader>

        {summary.overThreshold && (
          <div className="mt-4 rounded-md bg-primary/5 px-3 py-2.5 text-xs text-foreground/80">
            You joined {summary.joinedDaysAgo} days ago and you&apos;re already getting a lot of
            these. Switching busy types to <span className="font-medium">Digest</span> keeps you in
            the loop without the constant pings.
          </div>
        )}

        {error && (
          <p className="mt-4 border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-2">
          {PREF_ROWS.map((row) => {
            const Icon = row.icon;
            const count = summary[row.countKey];
            const mode = summary.preferences[row.type];

            return (
              <div
                key={row.type}
                className="flex items-center gap-4 border-b border-border py-4 last:border-b-0"
              >
                <div className="flex flex-1 min-w-0 items-center gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{row.label}</div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {count} this week
                      {row.type === "challenge_reminder" &&
                        count === 0 &&
                        " · no reminders sent yet"}
                    </div>
                    <p className="text-xs text-muted-foreground">{row.description}</p>
                  </div>
                </div>
                <ToggleGroup
                  type="single"
                  value={mode}
                  onValueChange={(value) => handleModeChange(row.type, value as NotificationMode)}
                  disabled={savingType === row.type}
                  className="shrink-0 rounded-md bg-muted p-1"
                >
                  <ToggleGroupItem value="instant" className="h-8 px-3 text-xs">
                    Instant
                  </ToggleGroupItem>
                  <ToggleGroupItem value="digest" className="h-8 px-3 text-xs">
                    Digest
                  </ToggleGroupItem>
                  <ToggleGroupItem value="off" className="h-8 px-3 text-xs">
                    Off
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            );
          })}
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          Digest bundles that type into a single daily email instead of a push per event. Off stops
          the notification entirely — you can always turn it back on here.
        </p>
      </SheetContent>
    </Sheet>
  );
}
