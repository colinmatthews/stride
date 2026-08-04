export type BadgeTone = "orange" | "green" | "amber" | "ink";

/** Shared tint/ring/icon classes for badge tones — used by the Training Log
 * badge carousel and by shared badge posts in the feed, so a badge looks the
 * same everywhere it appears. */
export const BADGE_TONE: Record<
  BadgeTone,
  { icon: string; tint: string; ring: string; bar: string }
> = {
  orange: {
    icon: "text-primary",
    tint: "bg-primary/10",
    ring: "ring-primary/30",
    bar: "bg-primary",
  },
  green: { icon: "text-pr", tint: "bg-pr/10", ring: "ring-pr/30", bar: "bg-pr" },
  amber: { icon: "text-accent", tint: "bg-accent/15", ring: "ring-accent/40", bar: "bg-accent" },
  ink: {
    icon: "text-secondary",
    tint: "bg-secondary/8",
    ring: "ring-secondary/25",
    bar: "bg-secondary",
  },
};

/** Falls back to the ink tone for any unexpected value from the server. */
export function toneFor(tone: string) {
  return BADGE_TONE[(tone as BadgeTone) in BADGE_TONE ? (tone as BadgeTone) : "ink"];
}
