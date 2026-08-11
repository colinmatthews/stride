/**
 * Pure logic behind the post-run challenge nudge.
 *
 * The insight: athletes log activities almost immediately but effectively
 * never discover challenges, because the join ask arrives cold on a separate
 * page with an empty progress bar. So instead of "join a challenge?", the
 * post-run surface asks "keep the progress you already have?" — the run just
 * logged is credited retroactively, and the athlete sees the rank they would
 * already hold.
 *
 * Nothing here touches the database, so the selection and ranking rules can
 * be unit tested directly. The query side lives in data.ts.
 */

/**
 * Progress is scored over a rolling window rather than the challenge's own
 * calendar period. That is deliberate: the surface's promise to the athlete
 * is "your last 30 days already count", which is a rolling claim, and it
 * keeps the credit stable rather than collapsing to near-zero for anyone who
 * logs a run on the first of the month.
 */
export const MOMENTUM_WINDOW_DAYS = 30;

/** Standings stay glanceable — the point is the athlete's own row, not a full table. */
export const MAX_BOARD_ROWS = 8;

export type ChallengeMetric = "distance_km" | "elevation_m";

export type ChallengeLike = {
  id: string;
  sport: string;
  goalKm: number;
  endsAt: string;
  joined: boolean;
};

export function momentumWindowStart(now: Date, days: number = MOMENTUM_WINDOW_DAYS) {
  return new Date(now.getTime() - days * 86_400_000);
}

export function isElevationMetric(metricType: string): boolean {
  return metricType === "elevation_m";
}

/**
 * Days remaining, counting the final day as one — `endsAt` is inclusive, which
 * is how it reads to an athlete ("ends April 30" means April 30 still counts).
 * Zero or negative means the challenge is over.
 */
export function daysUntilEnd(endsAt: string, now: Date): number {
  return Math.ceil((new Date(`${endsAt}T23:59:59.999Z`).getTime() - now.getTime()) / 86_400_000);
}

/** Guards against an unparseable date resolving to NaN and slipping through. */
export function isChallengeOpen(endsAt: string, now: Date): boolean {
  return daysUntilEnd(endsAt, now) > 0;
}

/**
 * Picks the challenge with the strongest pitch for the activity just logged.
 *
 * Unjoined challenges come first — the surface exists to convert — but a
 * joined one is still returned as a fallback so the card stays coherent when
 * the page is revisited after the athlete has opted in. Among those, the
 * challenge the athlete is furthest through wins: a bar that is already
 * two-thirds full is the whole argument.
 *
 * Challenges that have already ended are never pitched. Their standings are
 * frozen, so "keep this progress" would be a promise the challenge can't keep
 * — the athlete would join something they can no longer move in.
 */
export function pickMomentumChallenge<T extends ChallengeLike>(
  candidates: T[],
  sport: string,
  carriedFor: (challenge: T) => number,
  now: Date,
): T | undefined {
  const eligible = candidates.filter(
    (candidate) =>
      candidate.sport === sport &&
      isChallengeOpen(candidate.endsAt, now) &&
      carriedFor(candidate) > 0,
  );

  return [...eligible].sort((a, b) => {
    if (a.joined !== b.joined) {
      return a.joined ? 1 : -1;
    }

    const ratioA = a.goalKm > 0 ? carriedFor(a) / a.goalKm : 0;
    const ratioB = b.goalKm > 0 ? carriedFor(b) / b.goalKm : 0;

    if (ratioA !== ratioB) {
      return ratioB - ratioA;
    }

    return a.endsAt.localeCompare(b.endsAt);
  })[0];
}

export type BoardInput = {
  athleteId: string;
  name: string;
  avatar: string;
  value: number;
  isMe?: boolean;
  isFollowing?: boolean;
};

export type BoardRow = {
  athleteId: string;
  name: string;
  avatar: string;
  value: number;
  isMe: boolean;
  isFollowing: boolean;
  rank: number;
};

/** Ranks every athlete with qualifying distance, highest first. */
export function rankBoard(entries: BoardInput[]): BoardRow[] {
  return [...entries]
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .map((entry, index) => ({
      athleteId: entry.athleteId,
      name: entry.name,
      avatar: entry.avatar,
      value: entry.value,
      isMe: entry.isMe === true,
      isFollowing: entry.isFollowing === true,
      rank: index + 1,
    }));
}

/**
 * Trims the board to something readable while guaranteeing the athlete can
 * see their own row and the rival directly above it — the gap to that rival
 * is the reason to keep going after joining.
 *
 * Rows keep their true rank, so a caller can detect the jump and render a
 * break between the leaders and the athlete's neighbourhood.
 */
export function selectVisibleRows(
  ranked: BoardRow[],
  maxRows: number = MAX_BOARD_ROWS,
): BoardRow[] {
  if (ranked.length <= maxRows) {
    return ranked;
  }

  const meIndex = ranked.findIndex((entry) => entry.isMe);

  if (meIndex === -1 || meIndex < maxRows) {
    return ranked.slice(0, maxRows);
  }

  const leaders = ranked.slice(0, 3);
  const neighbourhood = ranked.slice(Math.max(3, meIndex - 1), meIndex + 2);

  return [...leaders, ...neighbourhood];
}
