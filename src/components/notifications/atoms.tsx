/**
 * Small reusable atoms for the notification center, salvaged from the retired
 * variant explorations.
 */
import type { ReactNode } from "react";
import { CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InboxController } from "./shared";

export function MarkAllButton({ inbox }: { inbox: InboxController }) {
  return (
    <button
      onClick={inbox.markAll}
      disabled={inbox.unread === 0}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground"
    >
      <CheckCheck className="h-4 w-4" /> Mark all as read
    </button>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-transparent bg-secondary text-secondary-foreground"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
