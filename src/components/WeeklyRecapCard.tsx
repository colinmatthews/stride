import { useState } from "react";
import { usePostHog } from "@posthog/react";
import { ArrowRight, Download, LoaderCircle, Share2 } from "lucide-react";
import { buildActivitySharedEvent, type ShareDestination } from "@/lib/analytics";
import {
  formatRecapDistance,
  formatWeekRange,
  recapCardStats,
  recapShareText,
  renderRecapCardPng,
} from "@/lib/recap-card";
import { recapImageFilename, shareOrCopy } from "@/lib/share";
import type { WeeklyRecap } from "@/lib/weekly-recap";

/**
 * The share moment for the 4th run of a Mon–Sun week.
 *
 * Rendered in-flow rather than in a modal: the app has no dialog, drawer, toast
 * or portal in use anywhere (`src/components/ui/*` is unused scaffolding), and
 * the `{finished && …}` reveal in `record.tsx` is its established idiom for a
 * post-action moment. Deep-ink panel with orange numerals matches the
 * celebratory register already used by the timer hero and the feed's week rail
 * — DESIGN.md forbids large primary-orange fills.
 */

type Props = {
  recap: WeeklyRecap;
  /** Continue to the activity that triggered the recap. */
  onDismiss: () => void;
};

export function WeeklyRecapCard({ recap, onDismiss }: Props) {
  const posthog = usePostHog();
  const [busy, setBusy] = useState<ShareDestination | null>(null);
  const [note, setNote] = useState("");

  const stats = recapCardStats(recap);

  function captureShared(destination: ShareDestination, hasImage: boolean) {
    const event = buildActivitySharedEvent({
      surface: "weekly_recap",
      destination,
      weekStart: recap.weekStart,
      weekRunCount: recap.runCount,
      weekDistanceKm: recap.distanceKm,
      streakWeeks: recap.streakWeeks,
      hasImage,
    });

    posthog.capture(event.name, event.properties);
  }

  async function share() {
    setBusy("system_share_sheet");
    setNote("");

    try {
      const png = await renderRecapCardPng(recap);
      const files = png
        ? [new File([png], recapImageFilename(recap.weekStart), { type: "image/png" })]
        : undefined;

      const outcome = await shareOrCopy({
        title: `${formatRecapDistance(recap.distanceKm)} km this week`,
        text: recapShareText(recap),
        url: window.location.origin,
        files,
      });

      // Only a completed share counts. A dismissed OS sheet rejects with
      // AbortError and must not inflate the share rate.
      if (outcome.status === "shared") {
        captureShared(outcome.destination, outcome.withFiles);
        setNote(outcome.destination === "clipboard" ? "Link copied." : "");
      } else if (outcome.status === "unsupported") {
        setNote("Sharing isn't available here — save the image instead.");
      } else if (outcome.status === "failed") {
        posthog.captureException(outcome.error);
        setNote("Couldn't share. Try saving the image.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function saveImage() {
    setBusy("image_download");
    setNote("");

    try {
      const png = await renderRecapCardPng(recap);

      if (!png) {
        setNote("Couldn't build the image.");
        return;
      }

      const url = URL.createObjectURL(png);
      const link = document.createElement("a");
      link.href = url;
      link.download = recapImageFilename(recap.weekStart);
      link.click();
      URL.revokeObjectURL(url);

      captureShared("image_download", true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-8 border border-border">
      <div className="bg-secondary p-10 text-center text-secondary-foreground">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/70">
          Week of {formatWeekRange(recap.weekStart, recap.weekEnd)}
        </div>

        <div className="stat-num mt-4 text-7xl text-primary">
          {formatRecapDistance(recap.distanceKm)}
          <span className="ml-2 font-body text-2xl font-normal text-secondary-foreground/70">
            km
          </span>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-6">
          {stats.map((stat) => (
            <div key={stat.label}>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-secondary-foreground/70">
                {stat.label}
              </div>
              <div className="stat-num mt-1 text-2xl font-bold">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-surface p-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Four runs logged
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          That&rsquo;s the week most runners never finish. Take the card with you.
        </p>

        {note && <p className="mt-3 text-sm text-foreground">{note}</p>}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            onClick={onDismiss}
            className="h-10 border border-border bg-surface px-4 text-sm text-foreground transition-colors hover:bg-muted"
          >
            Not now
          </button>
          <button
            onClick={saveImage}
            disabled={busy !== null}
            className="inline-flex h-10 items-center gap-2 border border-border bg-surface px-4 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {busy === "image_download" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Save image
          </button>
          <button
            onClick={share}
            disabled={busy !== null}
            className="inline-flex h-10 items-center gap-2 bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy === "system_share_sheet" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Share2 className="h-4 w-4" />
            )}
            Share recap
          </button>
        </div>

        <button
          onClick={onDismiss}
          className="mt-4 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground"
        >
          View activity <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </section>
  );
}
