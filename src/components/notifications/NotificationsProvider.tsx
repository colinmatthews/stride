/**
 * Owns ONE inbox + settings controller instance and shares it via context, so
 * the header bell badge, the bell tray, and the notification-center page all
 * read and mutate the same state — marking something read in any surface
 * updates the others live.
 *
 * Mounted inside AppShell (wrapping the header and page content), so every
 * screen gets a synced bell for free.
 */
import { createContext, useContext, type ReactNode } from "react";
import {
  useInboxController,
  useSettingsController,
  type InboxController,
  type SettingsController,
} from "./shared";

interface NotificationsContextValue {
  inbox: InboxController;
  settings: SettingsController;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const inbox = useInboxController();
  const settings = useSettingsController();
  return (
    <NotificationsContext.Provider value={{ inbox, settings }}>
      {children}
    </NotificationsContext.Provider>
  );
}

function useNotificationsContext(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useInbox/useSettings must be used within a NotificationsProvider");
  }
  return ctx;
}

export function useInbox(): InboxController {
  return useNotificationsContext().inbox;
}

export function useSettings(): SettingsController {
  return useNotificationsContext().settings;
}
