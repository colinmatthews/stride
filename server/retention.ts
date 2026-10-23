/* Weekly retention queue — pure rules, no database access.
 *
 * Rule: an active premium athlete is flagged when their sessions in the last 28 days
 * (the last 4 completed weeks) are at most half of the 28 days before. Athletes who went
 * dormant showed this same fade about 8 weeks before they stopped, so the window to reach
 * someone is 8 weeks minus how long their fade has been running.
 */

export const WEEKS_SHOWN = 12;
export const WINDOW_WEEKS = 8;
export const DROP_THRESHOLD = 0.5;
/** A week counts as "fading" when it falls below this share of the athlete's baseline. */
export const FADE_WEEK_SHARE = 0.75;
/** Contacted athletes with no new activity come back to the queue after this many days. */
export const CONTACT_FOLLOW_UP_DAYS = 7;
/** Cleared athletes stay out of the queue for one 28-day cycle. */
export const DISMISS_DAYS = 28;

/** Share of baseline sessions that dormant athletes kept, by week since their fade began. */
export const DORMANT_FADE = [0.7, 0.5, 0.4, 0.3, 0.25, 0.15, 0.1, 0.05];

export const QUEUE_STATUSES = ["new", "contacted", "snoozed", "dismissed"] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const RETENTION_ACTIONS = ["contacted", "snoozed", "dismissed", "reopened"] as const;
export type RetentionAction = (typeof RETENTION_ACTIONS)[number];

export const CHANNELS = ["Email", "In-app", "Coach call"] as const;
export type Channel = (typeof CHANNELS)[number];

export const DISMISS_REASONS = [
  "Planned off-season",
  "Injury, already in touch",
  "Logging elsewhere",
  "False alarm",
] as const;

export type Sport = "Run" | "Ride" | "Swim" | "Hike" | "Walk";

const DAY_MS = 86_400_000;

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** Monday 00:00 UTC of the week containing `date` — matches Postgres date_trunc('week'). */
export function startOfWeekUtc(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return start;
}

/** Start of the oldest of the last WEEKS_SHOWN completed weeks. */
export function windowStart(now: Date) {
  const start = startOfWeekUtc(now);
  start.setUTCDate(start.getUTCDate() - WEEKS_SHOWN * 7);
  return start;
}

/** Monday after `now`, when a snoozed athlete comes back. */
export function nextMonday(now: Date) {
  const start = startOfWeekUtc(now);
  start.setUTCDate(start.getUTCDate() + 7);
  return start;
}

export interface FadeSummary {
  prior28: number;
  last28: number;
  drop: number;
  baseline: number;
  fadeWeeksAgo: number;
  weeksLeft: number;
}

/** `weekly` is sessions per completed week, oldest first, length WEEKS_SHOWN. */
export function summarizeFade(weekly: number[]): FadeSummary {
  if (weekly.length !== WEEKS_SHOWN) {
    throw new Error(`Expected ${WEEKS_SHOWN} weeks of sessions, got ${weekly.length}`);
  }

  const prior28 = sum(weekly.slice(4, 8));
  const last28 = sum(weekly.slice(8, 12));
  const drop = prior28 === 0 ? 0 : 1 - last28 / prior28;
  // Baseline is the average week before the last 28 days.
  const baseline = Math.round((sum(weekly.slice(0, 8)) / 8) * 10) / 10;

  // Count the run of recent weeks below the fade line, newest first.
  let fadeWeeksAgo = 0;
  for (let index = weekly.length - 1; index >= 0; index -= 1) {
    if (weekly[index] < baseline * FADE_WEEK_SHARE) fadeWeeksAgo += 1;
    else break;
  }
  fadeWeeksAgo = Math.min(WINDOW_WEEKS, Math.max(1, fadeWeeksAgo));

  return {
    prior28,
    last28,
    drop,
    baseline,
    fadeWeeksAgo,
    weeksLeft: WINDOW_WEEKS - fadeWeeksAgo,
  };
}

/** Sessions per week a dormant athlete would have logged on the same timeline, for the chart. */
export function dormantPath(baseline: number, fadeWeeksAgo: number) {
  const fadeStart = WEEKS_SHOWN - fadeWeeksAgo;
  return Array.from({ length: WEEKS_SHOWN }, (_, index) =>
    index < fadeStart ? baseline : Math.round(baseline * DORMANT_FADE[index - fadeStart] * 10) / 10,
  );
}

export function isFlagged(weekly: number[]) {
  const { prior28, last28 } = summarizeFade(weekly);
  return prior28 > 0 && last28 <= prior28 * DROP_THRESHOLD;
}

export interface LatestAction {
  action: RetentionAction;
  channel: string | null;
  note: string | null;
  snoozedUntil: Date | null;
  createdAt: Date;
}

/** Where a flagged athlete sits in the queue, given the team's latest action. */
export function resolveQueueStatus(
  latest: LatestAction | null,
  lastActivityAt: Date | null,
  now: Date,
): QueueStatus {
  if (!latest || latest.action === "reopened") return "new";

  const ageDays = (now.getTime() - latest.createdAt.getTime()) / DAY_MS;

  switch (latest.action) {
    case "snoozed":
      return latest.snoozedUntil && latest.snoozedUntil > now ? "snoozed" : "new";
    case "dismissed":
      return ageDays < DISMISS_DAYS ? "dismissed" : "new";
    case "contacted": {
      const activeSince = lastActivityAt !== null && lastActivityAt > latest.createdAt;
      return activeSince || ageDays < CONTACT_FOLLOW_UP_DAYS ? "contacted" : "new";
    }
  }
}

export function buildSignals(input: {
  plan: string;
  renewsInDays: number | null;
  lastActiveDaysAgo: number | null;
  lastKudoGivenDaysAgo: number | null;
  clubCount: number;
}): string[] {
  const signals: string[] = [];
  if (input.renewsInDays !== null && input.renewsInDays <= 45) {
    signals.push(`Premium renews in ${input.renewsInDays} days`);
  }
  if (input.lastActiveDaysAgo === null) {
    signals.push("No activity logged in the last 12 weeks");
  } else if (input.lastActiveDaysAgo >= 7) {
    signals.push(`No activity in ${input.lastActiveDaysAgo} days`);
  }
  if (input.lastKudoGivenDaysAgo !== null && input.lastKudoGivenDaysAgo >= 21) {
    signals.push(`Stopped giving kudos ${Math.floor(input.lastKudoGivenDaysAgo / 7)} weeks ago`);
  }
  if (input.clubCount === 0) {
    signals.push("Not in any club");
  }
  return signals;
}

const SPORT_PLURAL: Record<Sport, string> = {
  Run: "runs",
  Ride: "rides",
  Swim: "swims",
  Hike: "hikes",
  Walk: "walks",
};

export function draftMessage(
  athlete: { name: string; city: string; sport: Sport; baseline: number; lastWeek: number },
  channel: Channel,
): string {
  const first = athlete.name.split(" ")[0];
  const activity = SPORT_PLURAL[athlete.sport] ?? "sessions";
  if (channel === "Coach call") {
    return `Call ${first} (${athlete.city}). Opener: their ${activity} dropped from ~${athlete.baseline}/wk to ${athlete.lastWeek} last week. Ask what changed — injury, schedule, motivation — and offer a 3-week rebuild block or a plan pause.`;
  }
  return `Hi ${first} — we noticed your ${activity} have been quieter the last few weeks. That's completely normal, and we'd love to help you get back into a rhythm.\n\nWant us to set up a lighter 3-week rebuild block? Or if life's busy right now, reply and we'll pause your plan so nothing piles up.\n\n— The Stride coaching team`;
}

export const SORTS = ["window", "drop", "renewal"] as const;
export type SortKey = (typeof SORTS)[number];

export function compareQueue(
  sort: SortKey,
  a: { weeksLeft: number; drop: number; renewsInDays: number | null },
  b: { weeksLeft: number; drop: number; renewsInDays: number | null },
) {
  if (sort === "drop") return b.drop - a.drop;
  if (sort === "renewal") {
    return (a.renewsInDays ?? Infinity) - (b.renewsInDays ?? Infinity) || b.drop - a.drop;
  }
  return a.weeksLeft - b.weeksLeft || b.drop - a.drop;
}
