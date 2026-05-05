import { RefreshCw } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";

const STEPS = [
  {
    n: 1,
    title: "Check your Wi-Fi or cellular connection",
    body: "Open your network settings and confirm you’re connected. If you’re on Wi-Fi, try toggling it off and back on.",
  },
  {
    n: 2,
    title: "Disable any VPN or proxy",
    body: "VPNs and corporate proxies sometimes block the requests Stride needs to save your activity.",
  },
  {
    n: 3,
    title: "Refresh this page",
    body: "If you’re back online but the indicator hasn’t cleared, a refresh will pick up the new status.",
  },
];

export function NetworkTroubleshootSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-2xl border-t-0 p-0">
        <div className="mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-border" />
        <div className="px-6 pb-6 pt-2">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Troubleshoot
            </span>
          </div>
          <h2 className="mt-3 font-display text-2xl font-bold leading-tight tracking-[-0.02em]">
            Reconnect to save your activity
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Stride can’t reach the server right now. Walk through these steps to bring the
            connection back.
          </p>

          <ol className="mt-5 space-y-3">
            {STEPS.map((step) => (
              <li key={step.n} className="flex gap-3 border border-border bg-surface px-3 py-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center bg-secondary font-display text-sm font-semibold text-secondary-foreground">
                  {step.n}
                </span>
                <div>
                  <div className="font-display text-sm font-semibold tracking-tight">
                    {step.title}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{step.body}</div>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-5 flex items-center gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="inline-flex h-11 items-center justify-center border border-border bg-surface px-4 text-sm font-medium text-foreground"
            >
              Skip
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
