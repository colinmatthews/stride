export interface Tier {
  name: string;
  min: number;
  icon: string;
  blurb: string;
}

export const TIERS: Tier[] = [
  {
    name: "Getting started",
    min: 0,
    icon: "🌱",
    blurb: "Every athlete starts here. Log your first few efforts.",
  },
  {
    name: "Building momentum",
    min: 5,
    icon: "🔥",
    blurb: "You're showing up more than once a week. Keep it going.",
  },
  {
    name: "Consistent",
    min: 10,
    icon: "⚡",
    blurb: "Regular enough that Stride can start spotting real trends in your training.",
  },
  {
    name: "Committed",
    min: 18,
    icon: "🏅",
    blurb: "You've logged more than most athletes ever do. Segments start to feel like home turf.",
  },
  {
    name: "Elite",
    min: 28,
    icon: "🏆",
    blurb: "Top tier of logged training. Nothing left to prove — just keep training.",
  },
];

export function tierIndexFor(count: number): number {
  let idx = 0;
  for (let i = 0; i < TIERS.length; i += 1) {
    if (count >= TIERS[i].min) idx = i;
  }
  return idx;
}

export interface TierProgress {
  count: number;
  currentIdx: number;
  current: Tier;
  next: Tier | undefined;
  progressPct: number;
}

/**
 * count must be the athlete's true total activity count, not the number of
 * activities currently loaded client-side. A paginated/partial count would
 * under-report the tier and make the progress bar jump when more pages load.
 */
export function getTierProgress(count: number): TierProgress {
  const currentIdx = tierIndexFor(count);
  const current = TIERS[currentIdx];
  const next = TIERS[currentIdx + 1];
  const progressPct = next
    ? Math.min(100, Math.max(0, ((count - current.min) / (next.min - current.min)) * 100))
    : 100;

  return { count, currentIdx, current, next, progressPct };
}
