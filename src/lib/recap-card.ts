import type { RecapTier, WeeklyRecap } from "./weekly-recap";

/**
 * Presentation layer for the Weekly Recap card, matching the prototype's
 * "Recap Tiers — Standard vs Power Runner" spec frame.
 *
 * Copy is deliberately third-person — the spec states the card "is written for
 * the friend receiving it, not the runner" — so headlines read "Alex ran four
 * times this week", never "You ran…".
 *
 * Formatting and layout are pure values so they can be asserted in the
 * node-only vitest setup; only `drawRecapCard` touches a canvas.
 */

/** 4:5 portrait — the aspect most social surfaces accept without re-cropping. */
export const RECAP_CARD_WIDTH = 1080;
export const RECAP_CARD_HEIGHT = 1350;

/**
 * Palette lifted from `src/styles.css` `:root`. Canvas has no access to CSS
 * custom properties, so these are the sRGB equivalents documented in DESIGN.md.
 */
export const RECAP_CARD_COLORS = {
  ink: "#2A241E",
  bone: "#FAFAF7",
  primary: "#E76A2D",
  accent: "#E1B650",
  muted: "#A79E93",
} as const;

export type RecapAthlete = {
  name: string;
  handle: string;
};

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

/** "four" for 4; falls back to digits past ten so copy never reads oddly. */
export function numberWord(value: number): string {
  return NUMBER_WORDS[value] ?? String(value);
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName.trim();
}

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

/**
 * The eyebrow above the headline.
 *
 * The prototype reads "4 RUNS · 7 DAYS", but the agreed window is a Mon–Sun
 * calendar week, so this says THIS WEEK rather than claiming a rolling window
 * the logic does not implement.
 */
export function recapEyebrow(recap: WeeklyRecap): string {
  if (recap.tier === "power_runner") {
    return `${recap.runCount} RUNS · THIS WEEK`;
  }

  return "WEEKLY RECAP";
}

export function recapHeadline(recap: WeeklyRecap, athlete: RecapAthlete): string {
  const who = firstName(athlete.name);

  if (recap.tier === "power_runner") {
    return `${who} ran ${numberWord(recap.runCount)} times this week.`;
  }

  return `${who}'s week on Stride.`;
}

export function recapSubhead(recap: WeeklyRecap): string {
  const distance = formatRecapDistance(recap.distanceKm);
  const runs = `${recap.runCount} ${recap.runCount === 1 ? "run" : "runs"}`;

  if (recap.tier === "power_runner") {
    return `${distance} km on the legs, with a ${recap.streakWeeks}-week streak still alive.`;
  }

  return `${distance} km across ${runs}.`;
}

/** Share copy sent alongside the image. Same third-person voice as the card. */
export function recapShareText(recap: WeeklyRecap, athlete: RecapAthlete): string {
  return `${recapHeadline(recap, athlete)} ${recapSubhead(recap)} Logged with Stride.`;
}

export type RecapCardStat = { label: string; value: string; emphasis: boolean };

/**
 * The three metrics, in render order. The emphasised (orange) stat differs by
 * tier: the standard card leads on distance, Power Runner leads on the run
 * count that unlocked it.
 */
export function recapCardStats(recap: WeeklyRecap): RecapCardStat[] {
  const isPower = recap.tier === "power_runner";

  return [
    {
      label: "KM THIS WEEK",
      value: formatRecapDistance(recap.distanceKm),
      emphasis: !isPower,
    },
    { label: "RUNS", value: String(recap.runCount), emphasis: isPower },
    { label: "WK STREAK", value: String(recap.streakWeeks), emphasis: false },
  ];
}

export function recapAwardBanner(tier: RecapTier): string | null {
  return tier === "power_runner" ? "POWER RUNNER ACHIEVED" : null;
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
export function drawRecapCard(canvas: CanvasLike, recap: WeeklyRecap, athlete: RecapAthlete): void {
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  canvas.width = RECAP_CARD_WIDTH;
  canvas.height = RECAP_CARD_HEIGHT;

  const pad = 80;
  const banner = recapAwardBanner(recap.tier);

  context.fillStyle = RECAP_CARD_COLORS.ink;
  context.fillRect(0, 0, RECAP_CARD_WIDTH, RECAP_CARD_HEIGHT);

  // Gold award banner across the top, Power Runner only.
  if (banner) {
    context.fillStyle = RECAP_CARD_COLORS.accent;
    context.fillRect(0, 0, RECAP_CARD_WIDTH, 110);
    context.fillStyle = RECAP_CARD_COLORS.ink;
    context.font = '500 32px "JetBrains Mono", ui-monospace, monospace';
    context.textAlign = "center";
    context.fillText(banner, RECAP_CARD_WIDTH / 2, 70);
  }

  context.textAlign = "left";

  context.fillStyle = RECAP_CARD_COLORS.primary;
  context.font = '500 30px "JetBrains Mono", ui-monospace, monospace';
  context.fillText(recapEyebrow(recap), pad, 300);

  context.fillStyle = RECAP_CARD_COLORS.bone;
  context.font = '700 82px "Space Grotesk", system-ui, sans-serif';
  context.fillText(recapHeadline(recap, athlete), pad, 420);

  context.fillStyle = RECAP_CARD_COLORS.muted;
  context.font = "400 36px Inter, system-ui, sans-serif";
  context.fillText(recapSubhead(recap), pad, 490);

  const stats = recapCardStats(recap);
  const columnWidth = (RECAP_CARD_WIDTH - pad * 2) / stats.length;

  stats.forEach((stat, index) => {
    const x = pad + columnWidth * index;

    context.fillStyle = stat.emphasis ? RECAP_CARD_COLORS.primary : RECAP_CARD_COLORS.bone;
    context.font = '700 96px "Space Grotesk", system-ui, sans-serif';
    context.fillText(stat.value, x, 720);

    context.fillStyle = RECAP_CARD_COLORS.muted;
    context.font = '500 26px "JetBrains Mono", ui-monospace, monospace';
    context.fillText(stat.label, x, 770);
  });

  // Attribution row — name, handle, and the Stride wordmark.
  context.fillStyle = RECAP_CARD_COLORS.bone;
  context.font = "600 34px Inter, system-ui, sans-serif";
  context.fillText(athlete.name, pad, RECAP_CARD_HEIGHT - 110);

  context.fillStyle = RECAP_CARD_COLORS.muted;
  context.font = '500 26px "JetBrains Mono", ui-monospace, monospace';
  context.fillText(`@${athlete.handle.toUpperCase()}`, pad, RECAP_CARD_HEIGHT - 70);

  context.textAlign = "right";
  context.fillStyle = RECAP_CARD_COLORS.bone;
  context.font = '700 34px "Space Grotesk", system-ui, sans-serif';
  context.fillText("Stride", RECAP_CARD_WIDTH - pad, RECAP_CARD_HEIGHT - 110);
}

/** Render the card to a PNG blob, waiting for the display fonts to load first. */
export async function renderRecapCardPng(
  recap: WeeklyRecap,
  athlete: RecapAthlete,
): Promise<Blob | null> {
  if (typeof document === "undefined") {
    return null;
  }

  // Without this the first render falls back to a system face mid-paint.
  await document.fonts?.ready;

  const canvas = document.createElement("canvas");
  drawRecapCard(canvas, recap, athlete);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

/** Filename for the downloaded recap card, e.g. `stride-week-2026-01-12.png`. */
export function recapImageFilename(weekStart: string, tier: RecapTier): string {
  const day = weekStart.slice(0, 10);
  const suffix = tier === "power_runner" ? "power-runner" : "recap";

  return `stride-${suffix}-${day}.png`;
}
