import type { Challenge, ChallengeStatus } from "./mock-data";

/**
 * Shelf arrangement for the challenges page.
 *
 * Kept out of the route component so it can be tested directly — the app has
 * no component-test setup, and this is the part with actual branching in it.
 */

export const STATUS_TABS: { key: ChallengeStatus; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
];

export function tallyByStatus(challenges: Challenge[]): Record<ChallengeStatus, number> {
  const tally: Record<ChallengeStatus, number> = { active: 0, upcoming: 0, past: 0 };

  for (const challenge of challenges) {
    tally[challenge.status] += 1;
  }

  return tally;
}

/**
 * The challenges to show for one tab: newest month first, then the athlete's
 * own, then the ones they've joined. Yours sorting above other people's is
 * what keeps your own shelf at the top once the list gets long.
 */
export function shelfFor(challenges: Challenge[], status: ChallengeStatus): Challenge[] {
  return challenges
    .filter((challenge) => challenge.status === status)
    .sort((a, b) => {
      if (a.monthIdx !== b.monthIdx) {
        return b.monthIdx - a.monthIdx;
      }

      if (a.createdBy.isMe !== b.createdBy.isMe) {
        return a.createdBy.isMe ? -1 : 1;
      }

      if (a.joined !== b.joined) {
        return a.joined ? -1 : 1;
      }

      return a.name.localeCompare(b.name);
    });
}

/** The months a Past view should group into, newest first. */
export function pastMonths(challenges: Challenge[]): number[] {
  return [...new Set(challenges.map((challenge) => challenge.monthIdx))].sort((a, b) => b - a);
}

export function completedCount(challenges: Challenge[]): number {
  return challenges.filter((challenge) => challenge.joined && challenge.progress.complete).length;
}

export interface EmptyShelfCopy {
  title: string;
  body: string;
  /** Past is history — there is no action that fills it in. */
  showCreate: boolean;
}

const PER_STATUS: Record<ChallengeStatus, { title: string; body: string }> = {
  active: {
    title: "Nothing running this month",
    body: "Set yourself a target for the rest of the month. Your activities start counting towards it straight away.",
  },
  upcoming: {
    title: "Nothing lined up for next month",
    body: "Plan next month's target now and it starts counting on the 1st.",
  },
  past: {
    title: "No finished challenges yet",
    body: "Once a challenge's month is over it moves here, with what you managed against the goal.",
  },
};

/**
 * Nothing seeds the shelf, so empty is where every new athlete starts. The
 * first-run case asks for the one action that fixes it instead of reporting
 * that a particular tab happens to be empty.
 */
export function emptyShelfCopy(status: ChallengeStatus, firstRun: boolean): EmptyShelfCopy {
  if (firstRun) {
    return {
      title: "Make your own challenge",
      body: "Name a target, pick a sport and a month, and decide who can see it. Progress is counted from the activities you already record.",
      showCreate: true,
    };
  }

  return { ...PER_STATUS[status], showCreate: status !== "past" };
}
