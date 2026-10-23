import { useEffect, useState } from "react";
import { usePostHog } from "@posthog/react";
import {
  Camera,
  CircleX,
  Download,
  Link2,
  LoaderCircle,
  MessageSquare,
  Share,
  Trophy,
  X,
} from "lucide-react";
import {
  buildActivitySharedEvent,
  type ShareDestination,
  type ShareSurface,
} from "@/lib/analytics";
import {
  RECAP_CARD_COLORS,
  recapAwardBanner,
  recapCardStats,
  recapEyebrow,
  recapHeadline,
  recapImageFilename,
  recapShareText,
  recapSubhead,
  renderRecapCardPng,
  type RecapAthlete,
} from "@/lib/recap-card";
import { needsImageDownload, shareTargetUrl } from "@/lib/share-targets";
import { shareOrCopy } from "@/lib/share";
import type { WeeklyRecap } from "@/lib/weekly-recap";

/**
 * The share moment, matching the prototype's "Weekly Recap — Power Runner
 * Share" frame (5:106).
 *
 * This is the app's first modal — `src/components/ui/*` is unused scaffolding
 * and no route mounts a dialog, drawer or toast — so focus handling and the
 * Escape key are wired by hand rather than pulling in Radix for one surface.
 */

type Props = {
  recap: WeeklyRecap;
  athlete: RecapAthlete;
  /** Which entry point opened the modal — carried onto every `activity_shared`. */
  surface: ShareSurface;
  onDismiss: () => void;
};

const DESTINATIONS: { id: ShareDestination; label: string; Icon: typeof Camera }[] = [
  { id: "instagram", label: "Instagram", Icon: Camera },
  { id: "whatsapp", label: "WhatsApp", Icon: MessageSquare },
  { id: "x", label: "X", Icon: CircleX },
  { id: "copy_link", label: "Copy link", Icon: Link2 },
  { id: "save_image", label: "Save image", Icon: Download },
];

export function WeeklyRecapModal({ recap, athlete, surface, onDismiss }: Props) {
  const posthog = usePostHog();
  const [busy, setBusy] = useState<ShareDestination | null>(null);
  const [note, setNote] = useState("");

  const banner = recapAwardBanner(recap.tier);
  const stats = recapCardStats(recap);
  const shareUrl = typeof window === "undefined" ? "https://stride.app" : window.location.origin;

  // Escape to dismiss. This is a genuine external-system subscription, which is
  // the one thing useEffect is still for.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onDismiss();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  function captureShared(destination: ShareDestination, hasImage: boolean) {
    const event = buildActivitySharedEvent({
      surface,
      destination,
      tier: recap.tier,
      weekStart: recap.weekStart,
      weekRunCount: recap.runCount,
      weekDistanceKm: recap.distanceKm,
      streakWeeks: recap.streakWeeks,
      hasImage,
    });

    posthog.capture(event.name, event.properties);
  }

  async function downloadCard(): Promise<boolean> {
    const png = await renderRecapCardPng(recap, athlete);

    if (!png) {
      setNote("Couldn't build the image.");
      return false;
    }

    const url = URL.createObjectURL(png);
    const link = document.createElement("a");
    link.href = url;
    link.download = recapImageFilename(recap.weekStart, recap.tier);
    link.click();
    URL.revokeObjectURL(url);

    return true;
  }

  /** The generic CTA — hands the card to the OS sheet, which never says where it went. */
  async function shareCard() {
    setBusy("system_share_sheet");
    setNote("");

    try {
      const png = await renderRecapCardPng(recap, athlete);
      const files = png
        ? [
            new File([png], recapImageFilename(recap.weekStart, recap.tier), {
              type: "image/png",
            }),
          ]
        : undefined;

      const outcome = await shareOrCopy({
        title: recapHeadline(recap, athlete),
        text: recapShareText(recap, athlete),
        url: shareUrl,
        files,
      });

      if (outcome.status === "shared") {
        // shareOrCopy falls back to the clipboard when there is no share sheet;
        // record where it actually landed, not where we aimed.
        captureShared(outcome.destination, outcome.withFiles);
        setNote(outcome.destination === "copy_link" ? "Link copied." : "");
      } else if (outcome.status === "unsupported") {
        setNote("Sharing isn't available here — try Save image.");
      } else if (outcome.status === "failed") {
        posthog.captureException(outcome.error);
        setNote("Couldn't share. Try saving the image.");
      }
      // status === "cancelled" is deliberately silent and uncounted.
    } finally {
      setBusy(null);
    }
  }

  async function sendTo(destination: ShareDestination) {
    setBusy(destination);
    setNote("");

    try {
      if (destination === "copy_link") {
        await navigator.clipboard.writeText(shareUrl);
        captureShared("copy_link", false);
        setNote("Link copied.");
        return;
      }

      // Instagram takes no web intent, so the card has to land on disk first.
      const downloaded = needsImageDownload(destination) ? await downloadCard() : false;

      if (needsImageDownload(destination) && !downloaded) {
        return;
      }

      const target = shareTargetUrl(destination, {
        text: recapShareText(recap, athlete),
        url: shareUrl,
      });

      if (target) {
        window.open(target, "_blank", "noopener,noreferrer");
      }

      captureShared(destination, downloaded);

      if (destination === "instagram") {
        setNote("Card saved — attach it in Instagram.");
      } else if (destination === "save_image") {
        setNote("Card saved.");
      }
    } catch (error) {
      posthog.captureException(error);
      setNote("Couldn't share. Try saving the image.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={banner ? "You unlocked Power Runner" : "Weekly recap"}
        className="w-full max-w-lg rounded-xl border border-border bg-background p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {banner && <Trophy className="h-4 w-4 text-accent" />}
            <h2 className="font-display text-lg font-bold tracking-[-0.01em]">
              {banner ? "You unlocked Power Runner" : "Your week on Stride"}
            </h2>
          </div>
          <button
            onClick={onDismiss}
            aria-label="Close"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Preview of the artefact that actually gets shared. */}
        <div className="mt-5 overflow-hidden rounded-lg">
          {banner && (
            <div
              className="py-2 text-center font-mono text-[10px] uppercase tracking-[0.22em]"
              style={{ backgroundColor: RECAP_CARD_COLORS.accent, color: RECAP_CARD_COLORS.ink }}
            >
              <Trophy className="mr-1.5 inline h-3 w-3" />
              {banner}
            </div>
          )}
          <div style={{ backgroundColor: RECAP_CARD_COLORS.ink }} className="p-6">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {recapEyebrow(recap)}
            </div>

            <h3 className="mt-3 font-display text-2xl font-bold leading-tight tracking-[-0.02em] text-[#FAFAF7]">
              {recapHeadline(recap, athlete)}
            </h3>
            <p className="mt-1.5 text-sm text-[#A79E93]">{recapSubhead(recap)}</p>

            <div className="mt-5 grid grid-cols-3 gap-4 border-t border-white/10 pt-4">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <div
                    className={`stat-num text-2xl leading-none ${
                      stat.emphasis ? "text-primary" : "text-[#FAFAF7]"
                    }`}
                  >
                    {stat.value}
                  </div>
                  <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#A79E93]">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-[#FAFAF7]" />
                <div>
                  <div className="text-sm font-medium text-[#FAFAF7]">{athlete.name}</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#A79E93]">
                    @{athlete.handle}
                  </div>
                </div>
              </div>
              <div className="font-display text-sm font-bold text-[#FAFAF7]">Stride</div>
            </div>
          </div>
        </div>

        <button
          onClick={shareCard}
          disabled={busy !== null}
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
        >
          {busy === "system_share_sheet" ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Share className="h-4 w-4" />
          )}
          Share this card
        </button>

        <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Or send straight to
        </div>

        <div className="mt-2 grid grid-cols-5 gap-2">
          {DESTINATIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => sendTo(id)}
              disabled={busy !== null}
              className="flex flex-col items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-3 text-[11px] text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              {busy === id ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
              {label}
            </button>
          ))}
        </div>

        {note && <p className="mt-3 text-center text-sm text-muted-foreground">{note}</p>}

        <button
          onClick={onDismiss}
          className="mt-4 w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
