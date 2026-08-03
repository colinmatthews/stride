import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";

export const Route = createFileRoute("/notifications")({
  // First search-param route in the app. `view=settings` opens the settings
  // view; anything else (absent/unknown) normalizes to the inbox and keeps the
  // URL clean by omitting the param.
  validateSearch: (search: Record<string, unknown>): { view?: "settings" } => ({
    view: search.view === "settings" ? "settings" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Notifications — Stride" },
      { name: "description", content: "Your notification center and channel settings." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  return (
    <AppShell>
      <NotificationCenter />
    </AppShell>
  );
}
