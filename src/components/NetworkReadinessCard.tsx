import { Wifi, WifiOff } from "lucide-react";

export function NetworkReadinessCard({
  online,
  onOpenTroubleshoot,
}: {
  online: boolean;
  onOpenTroubleshoot: () => void;
}) {
  if (online) {
    return (
      <div className="border border-border bg-surface px-3.5 py-3">
        <div className="flex items-center gap-3">
          <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-background">
            <Wifi className="h-4 w-4 text-foreground/80" />
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-primary ring-2 ring-surface" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <span className="font-display text-sm font-semibold leading-tight">
                Connection ready
              </span>
            </div>
            <div className="truncate text-xs leading-5 text-muted-foreground">
              Your activity will sync as soon as you save
            </div>
          </div>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Live
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-destructive/50 bg-destructive/8 px-3.5 py-3">
      <div className="flex items-center gap-3">
        <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-background/80">
          <WifiOff className="h-4 w-4 text-destructive" />
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full bg-destructive ring-2 ring-background" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-destructive" />
            <span className="font-display text-sm font-semibold leading-tight">
              You&rsquo;re offline
            </span>
          </div>
          <div className="truncate text-xs leading-5 text-muted-foreground">
            Activity won&rsquo;t save until you reconnect
          </div>
        </div>
        <button
          onClick={onOpenTroubleshoot}
          className="shrink-0 border border-transparent bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
        >
          Fix this
        </button>
      </div>
    </div>
  );
}
