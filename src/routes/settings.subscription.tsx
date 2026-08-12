import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  ME,
  PLAN,
  PREMIUM_BENEFITS,
  BILLING_HISTORY,
  type BillingCharge,
} from "@/lib/mock-data";
import {
  CreditCard,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  Check,
  X,
  ExternalLink,
  AlertCircle,
} from "lucide-react";

export const Route = createFileRoute("/settings/subscription")({
  head: () => ({ meta: [{ title: "Subscription — Stride" }] }),
  component: SubscriptionPage,
});

type Screen = "subscription" | "billing-history" | "cancel-confirm" | "cancel-success" | "report-issue";

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground", className)}>
      {children}
    </p>
  );
}

function StatusBadge({ status }: { status: BillingCharge["status"] }) {
  if (status === "paid") return <Badge variant="success">Paid</Badge>;
  if (status === "refunded") return <Badge variant="outline" className="text-muted-foreground">Refunded</Badge>;
  return <Badge variant="destructive">Failed</Badge>;
}

function ChargeRow({
  charge,
  onSelect,
  selected,
}: {
  charge: BillingCharge;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-colors hover:bg-muted/40",
        selected && "bg-primary/5",
        charge.isDuplicate && "bg-amber-50",
      )}
      onClick={onSelect}
    >
      {charge.isDuplicate ? (
        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
      ) : (
        <div className="w-4 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{charge.description}</p>
          {charge.isDuplicate && (
            <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
              Duplicate
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{charge.date}</p>
      </div>
      <p className="text-sm font-medium tabular-nums">${charge.amount.toFixed(2)}</p>
      <div className="w-20 flex justify-end">
        <StatusBadge status={charge.status} />
      </div>
      <div
        className={cn(
          "w-4 h-4 rounded-full border-2 shrink-0 transition-colors",
          selected ? "border-primary bg-primary" : "border-border",
        )}
      >
        {selected && (
          <div className="w-full h-full rounded-full flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-white" />
          </div>
        )}
      </div>
    </div>
  );
}

function SubscriptionPage() {
  const [screen, setScreen] = useState<Screen>("subscription");
  const [selectedCharge, setSelectedCharge] = useState<BillingCharge | null>(null);

  function handleBack() {
    if (screen === "billing-history") setScreen("subscription");
    else if (screen === "cancel-confirm") setScreen("subscription");
    else if (screen === "cancel-success") setScreen("subscription");
    else if (screen === "report-issue") setScreen("billing-history");
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto">
        {/* Back nav */}
        {screen !== "subscription" && (
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        )}

        {/* ── SCREEN: Subscription ── */}
        {screen === "subscription" && (
          <div className="space-y-8">
            <div>
              <Eyebrow className="mb-1">Account</Eyebrow>
              <h1 className="text-2xl font-display font-bold tracking-tight">Subscription</h1>
            </div>

            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-6 py-5 bg-secondary text-secondary-foreground">
                <div className="flex items-start justify-between">
                  <div>
                    <Eyebrow className="text-secondary-foreground/60 mb-1">Current plan</Eyebrow>
                    <h2 className="font-display text-xl font-bold">{PLAN.name}</h2>
                    <p className="text-secondary-foreground/70 text-sm mt-0.5">
                      ${PLAN.price}/month · renews {PLAN.nextBillingDate}
                    </p>
                  </div>
                  <Badge className="bg-primary text-primary-foreground border-transparent mt-0.5">
                    Active
                  </Badge>
                </div>
              </div>

              <div className="px-6 py-5 space-y-3">
                <Eyebrow className="mb-3">What's included</Eyebrow>
                {PREMIUM_BENEFITS.map((b) => (
                  <div key={b.label} className="flex items-start gap-3">
                    <Check className="h-4 w-4 text-[color:var(--pr)] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{b.label}</p>
                      <p className="text-xs text-muted-foreground">{b.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-surface border border-border rounded-xl divide-y divide-border overflow-hidden">
              <Eyebrow className="px-6 pt-5 pb-3">Manage</Eyebrow>

              <button
                onClick={() => setScreen("billing-history")}
                className="w-full flex items-center gap-3 px-6 py-4 hover:bg-muted/40 transition-colors text-left"
              >
                <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Billing history</p>
                  <p className="text-xs text-muted-foreground">View charges and download receipts</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>

              <Separator />

              <button
                onClick={() => setScreen("cancel-confirm")}
                className="w-full flex items-center gap-3 px-6 py-4 hover:bg-destructive/5 transition-colors text-left group"
              >
                <XCircle className="h-4 w-4 text-muted-foreground group-hover:text-destructive shrink-0 transition-colors" />
                <div className="flex-1">
                  <p className="text-sm font-medium group-hover:text-destructive transition-colors">
                    Cancel subscription
                  </p>
                  <p className="text-xs text-muted-foreground">Access ends {PLAN.accessEndsDate}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Member since {PLAN.memberSince}
            </p>
          </div>
        )}

        {/* ── SCREEN: Billing History ── */}
        {screen === "billing-history" && (
          <div className="space-y-6">
            <div>
              <Eyebrow className="mb-1">Account · Subscription</Eyebrow>
              <h1 className="text-2xl font-display font-bold tracking-tight">Billing history</h1>
            </div>

            {BILLING_HISTORY.some((c) => c.isDuplicate) && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-900">Duplicate charge detected</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    We found two charges from the same day for the same plan. Select a charge below
                    and report the issue to request a refund.
                  </p>
                </div>
              </div>
            )}

            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="bg-muted/40 px-5 py-3 flex items-center gap-4 border-b border-border">
                <div className="w-4" />
                <p className="flex-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Description
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Amount
                </p>
                <p className="w-20 text-right font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Status
                </p>
                <div className="w-4" />
              </div>

              <div className="divide-y divide-border">
                {BILLING_HISTORY.map((charge) => (
                  <ChargeRow
                    key={charge.id}
                    charge={charge}
                    onSelect={() =>
                      setSelectedCharge(selectedCharge?.id === charge.id ? null : charge)
                    }
                    selected={selectedCharge?.id === charge.id}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Showing charges from the last 12 months</p>
              <Button
                variant={selectedCharge ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  if (selectedCharge) setScreen("report-issue");
                }}
                disabled={!selectedCharge}
                className="gap-2"
              >
                <AlertCircle className="h-4 w-4" />
                Report a billing issue
              </Button>
            </div>
          </div>
        )}

        {/* ── SCREEN: Cancel Confirmation ── */}
        {screen === "cancel-confirm" && (
          <div className="space-y-8">
            <div>
              <Eyebrow className="mb-1">Account · Subscription</Eyebrow>
              <h1 className="text-2xl font-display font-bold tracking-tight">Cancel subscription</h1>
            </div>

            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-6 py-5 border-b border-border">
                <p className="text-sm font-medium">Access ends on</p>
                <p className="text-2xl tabular-nums text-foreground mt-1">{PLAN.accessEndsDate}</p>
                <p className="text-sm text-muted-foreground mt-1.5">
                  You'll keep Premium access until this date. After that, your account reverts to
                  the free plan.
                </p>
              </div>

              <div className="px-6 py-5">
                <Eyebrow className="mb-4">You'll lose access to</Eyebrow>
                <div className="space-y-3">
                  {PREMIUM_BENEFITS.map((b) => (
                    <div key={b.label} className="flex items-start gap-3">
                      <X className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <p className="text-sm font-medium text-muted-foreground">{b.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Button
                variant="destructive"
                className="w-full h-11 text-sm font-medium"
                onClick={() => setScreen("cancel-success")}
              >
                Confirm cancellation
              </Button>
              <Button
                variant="outline"
                className="w-full h-11 text-sm"
                onClick={() => setScreen("subscription")}
              >
                Keep my subscription
              </Button>
            </div>
          </div>
        )}

        {/* ── SCREEN: Cancel Success ── */}
        {screen === "cancel-success" && (
          <div className="space-y-8">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-muted">
              <CheckCircle2 className="h-7 w-7 text-[color:var(--pr)]" />
            </div>

            <div>
              <h1 className="text-2xl font-display font-bold tracking-tight">
                Subscription cancelled
              </h1>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                Your cancellation is confirmed. You'll have Premium access until{" "}
                <strong>{PLAN.accessEndsDate}</strong>, then your account reverts to the free plan
                automatically.
              </p>
            </div>

            <div className="bg-surface border border-border rounded-xl px-6 py-5 space-y-3">
              <Eyebrow>Subscription status</Eyebrow>
              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="text-sm font-medium">{PLAN.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Cancelled · access ends {PLAN.accessEndsDate}
                  </p>
                </div>
                <Badge variant="outline" className="text-muted-foreground">
                  Cancelled
                </Badge>
              </div>
            </div>

            <div className="space-y-3">
              <Button className="w-full h-11" onClick={() => setScreen("subscription")}>
                Back to account
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Changed your mind? You can resubscribe any time.
              </p>
            </div>
          </div>
        )}

        {/* ── SCREEN: Report Billing Issue ── */}
        {screen === "report-issue" && selectedCharge && (
          <div className="space-y-8">
            <div>
              <Eyebrow className="mb-1">Billing history</Eyebrow>
              <h1 className="text-2xl font-display font-bold tracking-tight">
                Report a billing issue
              </h1>
            </div>

            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-6 py-4 bg-muted/40 border-b border-border">
                <Eyebrow>Charge details — pre-filled</Eyebrow>
              </div>
              <div className="divide-y divide-border">
                <div className="px-6 py-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">User ID</p>
                  <p className="text-sm font-mono font-medium">{ME.id}</p>
                </div>
                <div className="px-6 py-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Charge date</p>
                  <p className="text-sm tabular-nums">{selectedCharge.date}</p>
                </div>
                <div className="px-6 py-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <p className="text-sm tabular-nums">${selectedCharge.amount.toFixed(2)}</p>
                </div>
                <div className="px-6 py-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Description</p>
                  <p className="text-sm">{selectedCharge.description}</p>
                </div>
                <div className="px-6 py-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Status</p>
                  <StatusBadge status={selectedCharge.status} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Additional details
              </label>
              <textarea
                className="w-full min-h-[100px] rounded-md border border-input bg-surface px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Describe the issue — e.g. 'I was charged twice on the same day and only intended to have one active subscription.'"
              />
            </div>

            <div className="space-y-3">
              <Button
                className="w-full h-11 gap-2"
                onClick={() => {
                  console.log("Open Intercom support thread", {
                    userId: ME.id,
                    chargeId: selectedCharge.id,
                    chargeDate: selectedCharge.date,
                    amount: selectedCharge.amount,
                    description: selectedCharge.description,
                  });
                  alert(
                    "Prototype: In production, this opens an Intercom thread pre-filled with your charge details.",
                  );
                }}
              >
                <ExternalLink className="h-4 w-4" />
                Open support thread
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Your account details are included automatically — no need to re-enter them.
              </p>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
