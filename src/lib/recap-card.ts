import { fmtDuration } from "./mock-data";
import type { WeeklyRecap } from "./weekly-recap";

/**
 * Presentation layer for the Weekly Recap card.
 *
 * The formatting and the PNG layout are pure values so they can be asserted in
 * the node-only vitest setup; only `drawRecapCard` touches a canvas.
 */

/** 4:5 portrait — the aspect most social surfaces accept without re-cropping. */
export const RECAP_CARD_WIDTH = 1080;
export const RECAP_CARD_HEIGHT = 1350;

/**
 * Palette lifted from `src/styles.css` `:root`. Canvas has no access to CSS
 * custom properties, so these are the sRGB equivalents documented in DESIGN.md.
 */
export const RECAP_CARD_COLORS = {
  ink: "#332E27",
  bone: "#FAFAF7",
  primary: "#E76A2D",
  muted: "#A79E93",
} as const;

/** e.g. "Jan 12 – Jan 18". `weekEnd` is exclusive, so step back a day to label it. */
export function formatWeekRange(weekStart: string, weekEnd: string): string {
  const start = new Date(weekStart);
  const lastDay = new Date(new Date(weekEnd).getTime() - 24 * 60 * 60 * 1000);
  const month: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

  return `${start.toLocaleDateString(undefined, month)} – ${lastDay.toLocaleDateString(undefined, month)}`;
}

/**
 * One decimal is the register the rest of the app uses for weekly aggregates
 * (`training.tsx` uses `.toFixed(1)`); two decimals is for a single activity.
 */
export function formatRecapDistance(distanceKm: number): string {
  return distanceKm.toFixed(1);
}

export function formatStreak(streakWeeks: number): string {
  return `${streakWeeks}w`;
}

/** Share copy. Plain-spoken and faintly competitive, per the DESIGN.md voice. */
export function recapShareText(recap: WeeklyRecap): string {
  const distance = formatRecapDistance(recap.distanceKm);
  const runs = `${recap.runCount} ${recap.runCount === 1 ? "run" : "runs"}`;

  if (recap.streakWeeks > 1) {
    return `${distance} km across ${runs} this week — ${recap.streakWeeks} weeks running. Logged with Stride.`;
  }

  return `${distance} km across ${runs} this week. Logged with Stride.`;
}

export type RecapCardStat = { label: string; value: string };

/** The three metrics, in the order the card renders them. */
export function recapCardStats(recap: WeeklyRecap): RecapCardStat[] {
  return [
    { label: "Runs", value: String(recap.runCount) },
    { label: "Time", value: fmtDuration(recap.movingSeconds) },
    { label: "Streak", value: formatStreak(recap.streakWeeks) },
  ];
}

type CanvasLike = {
  width: number;
  height: number;
  getContext(id: "2d"): CanvasRenderingContext2D | null;
  toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void;
};

/**
 * Paint the recap onto a canvas at share resolution.
 *
 * Drawn rather than rasterised from the DOM: the app's three display faces are
 * remote web fonts, and every html-to-image style rasteriser drops unembedded
 * fonts (or taints the canvas fetching them). Drawing lets us await
 * `document.fonts.ready` and use the real faces, with no new dependency.
 */
export function drawRecapCard(canvas: CanvasLike, recap: WeeklyRecap): void {
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  canvas.width = RECAP_CARD_WIDTH;
  canvas.height = RECAP_CARD_HEIGHT;

  const centre = RECAP_CARD_WIDTH / 2;

  context.fillStyle = RECAP_CARD_COLORS.ink;
  context.fillRect(0, 0, RECAP_CARD_WIDTH, RECAP_CARD_HEIGHT);
  context.textAlign = "center";

  context.fillStyle = RECAP_CARD_COLORS.muted;
  context.font = '500 30px "JetBrains Mono", ui-monospace, monospace';
  context.fillText(
    formatWeekRange(recap.weekStart, recap.weekEnd).toUpperCase(),
    centre,
    RECAP_CARD_HEIGHT * 0.2,
  );

  context.fillStyle = RECAP_CARD_COLORS.primary;
  context.font = '700 260px "Space Grotesk", system-ui, sans-serif';
  context.fillText(formatRecapDistance(recap.distanceKm), centre, RECAP_CARD_HEIGHT * 0.42);

  context.fillStyle = RECAP_CARD_COLORS.bone;
  context.font = '500 44px "JetBrains Mono", ui-monospace, monospace';
  context.fillText("KM", centre, RECAP_CARD_HEIGHT * 0.48);

  const stats = recapCardStats(recap);
  const columnWidth = RECAP_CARD_WIDTH / stats.length;

  stats.forEach((stat, index) => {
    const x = columnWidth * index + columnWidth / 2;

    context.fillStyle = RECAP_CARD_COLORS.muted;
    context.font = '500 26px "JetBrains Mono", ui-monospace, monospace';
    context.fillText(stat.label.toUpperCase(), x, RECAP_CARD_HEIGHT * 0.66);

    context.fillStyle = RECAP_CARD_COLORS.bone;
    context.font = '700 72px "Space Grotesk", system-ui, sans-serif';
    context.fillText(stat.value, x, RECAP_CARD_HEIGHT * 0.72);
  });

  context.fillStyle = RECAP_CARD_COLORS.muted;
  context.font = '500 28px "JetBrains Mono", ui-monospace, monospace';
  context.fillText("STRIDE", centre, RECAP_CARD_HEIGHT * 0.88);
}

/** Render the card to a PNG blob, waiting for the display fonts to load first. */
export async function renderRecapCardPng(recap: WeeklyRecap): Promise<Blob | null> {
  if (typeof document === "undefined") {
    return null;
  }

  // Without this the first render falls back to a system face mid-paint.
  await document.fonts?.ready;

  const canvas = document.createElement("canvas");
  drawRecapCard(canvas, recap);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}
