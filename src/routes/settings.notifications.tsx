import { createFileRoute } from "@tanstack/react-router";
import { useState, type ComponentType } from "react";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import { Heart, Trophy, UserPlus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  fetchNotificationPreferences,
  saveNotificationPreferences,
  type NotificationFrequency,
  type NotificationPreferences,
  type NotificationType,
} from "@/lib/api";

export const Route = createFileRoute("/settings/notifications")({
  loader: () => fetchNotificationPreferences(),
  head: () => ({
    meta: [{ title: "Notification settings — Stride" }],
  }),
  component: NotificationSettingsPage,
});

const NOTIFICATION_META: {
  id: NotificationType;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  {
    id: "kudos",
    label: "Kudos",
    description: "When someone gives kudos on one of your activities.",
    icon: Heart,
  },
  {
    id: "follow",
    label: "New followers",
    description: "When another athlete starts following you.",
    icon: UserPlus,
  },
  {
    id: "challenge",
    label: "Challenge reminders",
    description: "Progress nudges for challenges you've joined.",
    icon: Trophy,
  },
];

const FREQUENCY_OPTIONS: { value: NotificationFrequency; label: string }[] = [
  { value: "instant", label: "Instant" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "off", label: "Never" },
];

function NotificationSettingsPage() {
  const initial = Route.useLoaderData();
  const posthog = usePostHog();
  const [preferences, setPreferences] = useState<NotificationPreferences>(initial);
  const [savingType, setSavingType] = useState<NotificationType | null>(null);

  const offCount = NOTIFICATION_META.filter((meta) => preferences[meta.id] === "off").length;

  async function handleFrequencyChange(type: NotificationType, value: string) {
    if (!value || (value as NotificationFrequency) === preferences[type]) {
      return;
    }

    const frequency = value as NotificationFrequency;
    const previous = preferences[type];
    const label = NOTIFICATION_META.find((meta) => meta.id === type)?.label ?? type;

    setPreferences((current) => ({ ...current, [type]: frequency }));
    setSavingType(type);

    try {
      await saveNotificationPreferences({ [type]: frequency });
      posthog.capture("notification_preference_updated", {
        preference_key: type,
        frequency,
      });
      toast.success(
        frequency === "off"
          ? `${label} notifications turned off.`
          : `${label} notifications set to ${frequency}.`,
      );
    } catch (error) {
      setPreferences((current) => ({ ...current, [type]: previous }));
      posthog.captureException(error);
      toast.error("Couldn't save that change. Please try again.");
    } finally {
      setSavingType(null);
    }
  }

  return (
    <AppShell>
      <div className="border-b border-border pb-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Settings
        </div>
        <h1 className="mt-2 font-display text-4xl font-bold leading-tight tracking-[-0.02em]">
          Notifications
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Choose how often you hear from Stride for each type of activity.
        </p>
      </div>

      <div className="mt-8 max-w-2xl divide-y divide-border border-y border-border">
        {NOTIFICATION_META.map((meta) => {
          const Icon = meta.icon;

          return (
            <div key={meta.id} className="flex items-center justify-between gap-6 py-5">
              <div className="flex min-w-0 items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{meta.label}</div>
                  <div className="text-sm text-muted-foreground">{meta.description}</div>
                </div>
              </div>
              <ToggleGroup
                type="single"
                value={preferences[meta.id]}
                onValueChange={(value) => handleFrequencyChange(meta.id, value)}
                disabled={savingType === meta.id}
                className="shrink-0"
                aria-label={`${meta.label} frequency`}
              >
                {FREQUENCY_OPTIONS.map((option) => (
                  <ToggleGroupItem key={option.value} value={option.value} className="px-3 text-xs">
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          );
        })}
      </div>

      {offCount > 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          {offCount} of {NOTIFICATION_META.length} types turned off.
        </p>
      )}
    </AppShell>
  );
}
