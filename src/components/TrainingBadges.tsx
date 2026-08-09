import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePostHog } from "@posthog/react";
import { Trophy, Lock, Sparkles, Check, type LucideIcon } from "lucide-react";
import { BADGES, fmtDate, type Badge } from "@/lib/mock-data";
import { fetchBadges, markBadgesSeen } from "@/lib/api";
import { fireConfetti } from "@/lib/confetti";
import { toneFor } from "@/lib/badge-tone";
import { iconFor } from "@/lib/badge-icons";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  type CarouselApi,
} from "@/components/ui/carousel";

/**
 * Milestone badges for the top of the Training Log. Earned badges render in
 * their tone color; unearned badges preview as a grayed-out lock with a hover
 * tooltip explaining how to earn them (and, where relevant, live progress).
 *
 * Earned/progress state comes from the server (GET /api/badges) — the client
 * only celebrates freshly-unlocked badges and, in dev, can simulate an unlock.
 */

function pct(p?: { current: number; target: number }) {
  if (!p) return 0;
  return Math.min(100, Math.round((p.current / p.target) * 100));
}

// Tracks which "new" badges have already celebrated this session, so navigating
// back to the Training Log doesn't replay the burst.
const CELEBRATED = new Set<string>();

let toastSeq = 0;

type ToastItem = {
  id: number;
  icon: LucideIcon;
  tone: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
};

/**
 * Centre of a rendered badge tile, so a burst reads as coming from the badge.
 * Returns undefined when the tile is scrolled out of view in the carousel, so
 * the confetti falls back to its default (upper-centre) origin.
 */
function tileOrigin(id: string): { x: number; y: number } | undefined {
  if (typeof document === "undefined") return undefined;
  const el = document.querySelector<HTMLElement>(`[data-badge-id="${id}"]`);
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) return undefined;
  return { x, y };
}

export function TrainingBadges() {
  const posthog = usePostHog();
  const [serverBadges, setServerBadges] = useState<Badge[]>(() => BADGES);
  const [simulated, setSimulated] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState<Badge | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [api, setApi] = useState<CarouselApi | null>(null);

  // Refresh from the server on mount so unlocks earned elsewhere (e.g. after
  // recording an activity) show up when the athlete lands on the Training Log.
  useEffect(() => {
    fetchBadges()
      .then(setServerBadges)
      .catch(() => {
        /* keep whatever was hydrated at bootstrap */
      });
  }, []);

  // Fold this session's dev-simulated unlocks into the earned state.
  const badges: Badge[] = serverBadges.map((b) => {
    const fresh = simulated.has(b.id);
    const earned = b.earned || fresh;
    return { ...b, earned, isNew: fresh || b.isNew, progress: earned ? undefined : b.progress };
  });

  // Surface earned badges first (stable within each group, preserving the
  // server's catalog order) so the athlete sees their milestones up front.
  const orderedBadges = useMemo(
    () => [...badges.filter((b) => b.earned), ...badges.filter((b) => !b.earned)],
    [badges],
  );

  const nextLocked = badges.find((b) => !b.earned);

  const openBadge = (badge: Badge) => {
    posthog.capture("badge_detail_viewed", {
      badge_id: badge.id,
      badge_name: badge.name,
      earned: badge.earned,
    });
    setOpen(badge);
  };

  const dismissToast = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (item: Omit<ToastItem, "id">) => {
      toastSeq += 1;
      const id = toastSeq;
      setToasts((list) => [...list, { ...item, id }]);
      window.setTimeout(() => dismissToast(id), 4500);
    },
    [dismissToast],
  );

  const celebrate = useCallback(
    (badge: Badge, origin?: { x: number; y: number }) => {
      fireConfetti({ origin });
      pushToast({
        icon: iconFor(badge.icon),
        tone: badge.tone,
        eyebrow: "Badge unlocked",
        title: badge.name,
      });
    },
    [pushToast],
  );

  // Celebrate any server badge that arrives flagged new — once per session —
  // then mark them seen so the burst never replays on the next load.
  useEffect(() => {
    const newbies = serverBadges.filter((b) => b.earned && b.isNew && !CELEBRATED.has(b.id));
    if (newbies.length === 0) return;
    newbies.forEach((b) => {
      CELEBRATED.add(b.id);
      posthog.capture("badge_unlocked", { badge_id: b.id, badge_name: b.name });
    });
    const timer = setTimeout(() => {
      newbies.forEach((b) => celebrate(b, tileOrigin(b.id)));
    }, 500);
    markBadgesSeen().catch(() => {
      /* best-effort; server still returns isNew until it succeeds */
    });
    return () => clearTimeout(timer);
  }, [serverBadges, celebrate, posthog]);

  // Dev-only affordance: fake-unlock the next locked badge (client-side only,
  // not persisted) so the celebration flow can be demoed without real data.
  const simulateUnlock = () => {
    if (!nextLocked) {
      pushToast({
        icon: Trophy,
        tone: "orange",
        title: "All badges unlocked",
        subtitle: "You've earned every milestone 🎉",
      });
      return;
    }
    const id = nextLocked.id;
    const index = orderedBadges.findIndex((b) => b.id === id);
    if (index >= 0) api?.scrollTo(index);
    setSimulated((prev) => new Set(prev).add(id));
    window.setTimeout(
      () => celebrate({ ...nextLocked, earned: true, isNew: true }, tileOrigin(id)),
      350,
    );
  };

  return (
    <section className="mb-8">
      <TooltipProvider delayDuration={120}>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Milestones
            </div>
            <h2 className="mt-1.5 font-display text-lg font-semibold tracking-tight">
              Your badges
            </h2>
          </div>
          {import.meta.env.DEV && (
            <button
              onClick={simulateUnlock}
              disabled={!nextLocked}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {nextLocked ? "Simulate unlock" : "All unlocked"}
            </button>
          )}
        </div>

        <Carousel opts={{ align: "start", containScroll: "trimSnaps" }} setApi={setApi}>
          <div className="rounded-xl border border-border bg-surface px-5">
            <CarouselContent className="py-5">
              {orderedBadges.map((badge) => (
                <CarouselItem key={badge.id} className="basis-1/4 sm:basis-1/6 lg:basis-[12.5%]">
                  <BadgeTile badge={badge} onOpen={() => openBadge(badge)} />
                </CarouselItem>
              ))}
            </CarouselContent>
          </div>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </TooltipProvider>

      <BadgeDialog key={open?.id ?? "none"} badge={open} onClose={() => setOpen(null)} />

      {typeof document !== "undefined" &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 top-4 z-[9998] flex flex-col items-center gap-2 px-4">
            {toasts.map((t) => (
              <BadgeToast key={t.id} item={t} onDismiss={() => dismissToast(t.id)} />
            ))}
          </div>,
          document.body,
        )}
    </section>
  );
}

function BadgeToast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const tone = toneFor(item.tone);
  const Icon = item.icon;
  return (
    <div
      onClick={onDismiss}
      className="pointer-events-auto flex w-[340px] max-w-full cursor-pointer items-center gap-3 rounded-md border border-border bg-background p-3 shadow-lg duration-300 animate-in fade-in slide-in-from-top-2"
    >
      <div
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ${tone.tint} ${tone.ring}`}
      >
        <Icon className={`h-5 w-5 ${tone.icon}`} strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        {item.eyebrow && (
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3 w-3" /> {item.eyebrow}
          </div>
        )}
        <div className="mt-0.5 truncate font-display text-sm font-semibold">{item.title}</div>
        {item.subtitle && (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{item.subtitle}</div>
        )}
      </div>
    </div>
  );
}

function BadgeTile({ badge, onOpen }: { badge: Badge; onOpen: () => void }) {
  const tone = toneFor(badge.tone);
  const Icon = iconFor(badge.icon);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onOpen}
          data-badge-id={badge.id}
          className="group flex flex-col items-center gap-2 text-center outline-none"
          aria-label={`${badge.name} — ${badge.earned ? "earned" : "locked"}`}
        >
          <div
            className={`relative grid h-14 w-14 place-items-center rounded-xl ring-1 transition-transform group-hover:-translate-y-0.5 group-focus-visible:-translate-y-0.5 ${
              badge.earned ? `${tone.tint} ${tone.ring}` : "bg-surface-2 ring-border"
            }`}
          >
            <Icon
              className={`h-6 w-6 ${badge.earned ? tone.icon : "text-muted-foreground/40"}`}
              strokeWidth={1.75}
            />
            {!badge.earned && (
              <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border border-border bg-background">
                <Lock className="h-2.5 w-2.5 text-muted-foreground" />
              </span>
            )}
            {badge.earned && badge.isNew && (
              <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                ✦
              </span>
            )}
          </div>
          <div
            className={`text-[11px] font-medium leading-tight ${
              badge.earned ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {badge.name}
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        className="max-w-[220px] bg-secondary text-secondary-foreground"
      >
        <div className="space-y-1 py-0.5">
          <div className="flex items-center gap-1.5 font-medium">
            {badge.earned ? <Check className="h-3 w-3 text-pr" /> : <Lock className="h-3 w-3" />}
            {badge.name}
          </div>
          <p className="text-secondary-foreground/70">
            {badge.earned
              ? `Earned${badge.earnedDate ? ` ${fmtDate(badge.earnedDate)}` : ""}.`
              : badge.howTo}
          </p>
          {!badge.earned && badge.progress && (
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
              {badge.progress.current} / {badge.progress.target} {badge.progress.unit}
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function BadgeDialog({ badge, onClose }: { badge: Badge | null; onClose: () => void }) {
  if (!badge) return null;
  const tone = toneFor(badge.tone);
  const Icon = iconFor(badge.icon);
  const progressPct = pct(badge.progress);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div
              className={`grid h-12 w-12 place-items-center rounded-xl ring-1 ${
                badge.earned ? `${tone.tint} ${tone.ring}` : "bg-surface-2 ring-border"
              }`}
            >
              <Icon
                className={`h-6 w-6 ${badge.earned ? tone.icon : "text-muted-foreground/50"}`}
                strokeWidth={1.75}
              />
            </div>
            <div className="min-w-0">
              <div className="font-display text-lg font-semibold tracking-tight">{badge.name}</div>
              <div
                className={`font-mono text-[10px] uppercase tracking-[0.18em] ${
                  badge.earned ? "text-pr" : "text-muted-foreground"
                }`}
              >
                {badge.earned ? "Earned" : "Locked"}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">{badge.howTo}</p>

        {badge.earned ? (
          <div className="flex items-center gap-2 rounded-md bg-surface-2 p-3 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>
              Unlocked{badge.earnedDate ? ` on ${fmtDate(badge.earnedDate)}` : ""}. Nice work.
            </span>
          </div>
        ) : badge.progress ? (
          <div className="space-y-2">
            <Progress value={progressPct} />
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <span>
                {badge.progress.current} / {badge.progress.target} {badge.progress.unit}
              </span>
              <span>{progressPct}%</span>
            </div>
          </div>
        ) : (
          <div className="rounded-md bg-surface-2 p-3 text-sm text-muted-foreground">
            Keep training to unlock this badge.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
