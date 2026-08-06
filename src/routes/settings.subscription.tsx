import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { User, Bell, Shield, CreditCard, Crown, Check, ShieldCheck, Loader2 } from "lucide-react";
import { SUBSCRIPTION, type Subscription } from "@/lib/mock-data";
import { ApiError, cancelSubscription, reactivateSubscription } from "@/lib/api";

export const Route = createFileRoute("/settings/subscription")({
  head: () => ({
    meta: [{ title: "Account & Billing — Stride" }],
  }),
  component: SubscriptionSettingsPage,
});

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

const fmtTimestamp = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/* ===== Shared page chrome ===== */

function SettingsShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <Toaster position="bottom-right" />
      <div className="border-b border-border pb-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Settings
        </div>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.02em]">
          Account & Billing
        </h1>
      </div>

      <div className="mt-8 grid grid-cols-[220px_1fr] gap-8">
        <SettingsNav />
        <div className="min-w-0 max-w-2xl space-y-6">{children}</div>
      </div>
    </AppShell>
  );
}

function SettingsNav() {
  const items = [
    { icon: User, label: "Profile" },
    { icon: Bell, label: "Notifications" },
    { icon: Shield, label: "Privacy" },
    { icon: CreditCard, label: "Account & Billing", active: true },
  ];
  return (
    <nav className="space-y-1">
      {items.map((item) => (
        <div
          key={item.label}
          className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${
            item.active
              ? "bg-secondary text-secondary-foreground font-medium"
              : "text-muted-foreground"
          }`}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </div>
      ))}
    </nav>
  );
}

function PlanCardHeader({ billing }: { billing: Subscription }) {
  const cancelled = billing.status === "cancelled";
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        Current plan
      </div>
      <div className="mt-2 flex items-center gap-2.5">
        <Crown className="h-4 w-4 text-primary" />
        <span className="font-display text-xl font-bold tracking-tight">{billing.plan}</span>
        <span className="text-sm text-muted-foreground">${billing.priceUsd}/mo</span>
        {cancelled && (
          <Badge
            variant="outline"
            className="ml-1 text-[color:var(--pr)] border-[color:var(--pr)]/40"
          >
            Cancelled
          </Badge>
        )}
      </div>
      <div className="mt-1.5 text-xs text-muted-foreground">
        {cancelled
          ? `Access until ${fmtDate(billing.currentPeriodEnd)} · then moves to Stride Free · no further charges`
          : `Renews ${fmtDate(billing.currentPeriodEnd)} · billed to ${billing.paymentBrand} ····${billing.paymentLast4}`}
      </div>
    </div>
  );
}

function BillingSyncedBanner({ billing }: { billing: Subscription }) {
  if (billing.status !== "cancelled" || !billing.billingSyncedAt) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-[color:var(--pr)]/30 bg-[color:var(--pr)]/6 p-3.5 text-xs text-foreground/85">
      <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-[color:var(--pr)]" />
      <div>
        <div className="font-medium">Billing system updated</div>
        <div className="mt-0.5 text-muted-foreground">
          Synced {fmtTimestamp(billing.billingSyncedAt)} · {billing.paymentBrand} ····
          {billing.paymentLast4} will not be charged again.
        </div>
      </div>
    </div>
  );
}

function PaymentCard({ billing }: { billing: Subscription }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
        Payment method
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-12 rounded-md bg-background border border-border grid place-items-center font-mono text-xs">
            {billing.paymentBrand.slice(0, 4).toUpperCase()}
          </div>
          <div className="text-sm font-medium">
            {billing.paymentBrand} ····{billing.paymentLast4}
          </div>
        </div>
        <Button variant="outline" size="sm" disabled title="Coming soon">
          Update card
        </Button>
      </div>
    </section>
  );
}

function LoseAccessList() {
  return (
    <ul className="space-y-1 text-muted-foreground">
      <li>· Heart rate zones & relative effort</li>
      <li>· Segment leaderboard rankings</li>
      <li>· Unlimited training history</li>
    </ul>
  );
}

/* ===== Page ===== */

function SubscriptionSettingsPage() {
  const [billing, setBilling] = useState<Subscription>(() => ({ ...SUBSCRIPTION }));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  async function handleReactivate() {
    setReactivating(true);
    try {
      const updated = await reactivateSubscription();
      setBilling(updated);
      toast.success("Subscription reactivated");
    } catch {
      toast.error("Couldn't reactivate your subscription — try again.");
    } finally {
      setReactivating(false);
    }
  }

  return (
    <SettingsShell>
      <section className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="flex items-center justify-between p-5">
          <PlanCardHeader billing={billing} />
          {billing.status === "cancelled" ? (
            <Button variant="outline" size="sm" onClick={handleReactivate} disabled={reactivating}>
              {reactivating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Reactivate"}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              Cancel subscription
            </Button>
          )}
        </div>
      </section>

      <BillingSyncedBanner billing={billing} />
      <PaymentCard billing={billing} />

      <CancelDialog
        billing={billing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCancelled={setBilling}
      />
    </SettingsShell>
  );
}

/* ===== Cancel confirmation dialog ===== */

type DialogStep = "confirm" | "cancelling" | "done";

function CancelDialog({
  billing,
  open,
  onOpenChange,
  onCancelled,
}: {
  billing: Subscription;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled: (billing: Subscription) => void;
}) {
  const [step, setStep] = useState<DialogStep>("confirm");
  const [error, setError] = useState<string | null>(null);

  function handleClose(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setTimeout(() => {
        setStep("confirm");
        setError(null);
      }, 200);
    }
  }

  async function handleConfirmCancel() {
    setStep("cancelling");
    setError(null);
    try {
      const updated = await cancelSubscription();
      setStep("done");
      onCancelled(updated);
      toast.success("Billing synced — no further charges will be applied", {
        description: `${updated.paymentBrand} ····${updated.paymentLast4} · ${fmtTimestamp(
          updated.billingSyncedAt!,
        )}`,
      });
    } catch (err) {
      setStep("confirm");
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong cancelling your subscription — try again.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {step !== "done" ? (
          <>
            <DialogHeader>
              <DialogTitle>Cancel your {billing.plan} subscription?</DialogTitle>
              <DialogDescription>
                You will not be charged again. You'll keep full access until{" "}
                <span className="font-medium text-foreground">
                  {fmtDate(billing.currentPeriodEnd)}
                </span>
                , then your account moves to Stride Free.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-1 rounded-md bg-surface-2 p-3.5 text-xs">
              <div className="font-medium text-foreground mb-1.5">You'll lose access to:</div>
              <LoseAccessList />
            </div>

            {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleClose(false)}
                disabled={step === "cancelling"}
              >
                Keep {billing.plan}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleConfirmCancel}
                disabled={step === "cancelling"}
              >
                {step === "cancelling" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Cancelling…
                  </>
                ) : (
                  "Cancel subscription"
                )}
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[color:var(--pr)]/12">
                <Check className="h-5 w-5 text-[color:var(--pr)]" />
              </div>
              <DialogTitle className="text-center mt-3">You're all set</DialogTitle>
              <DialogDescription className="text-center">
                Your subscription is cancelled.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 space-y-3 text-sm text-center">
              <p className="text-foreground font-medium">You will not be charged again.</p>
              <p className="text-muted-foreground">
                You'll keep full access until{" "}
                <span className="text-foreground font-medium">
                  {fmtDate(billing.currentPeriodEnd)}
                </span>
                , then your account moves to Stride Free automatically.
              </p>
            </div>

            <Separator className="my-4" />

            <Button className="mt-1 w-full" size="sm" onClick={() => handleClose(false)}>
              Done
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
