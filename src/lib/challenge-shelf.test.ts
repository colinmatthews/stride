import { describe, expect, it } from "vitest";
import {
  completedCount,
  emptyShelfCopy,
  pastMonths,
  shelfFor,
  tallyByStatus,
} from "./challenge-shelf";
import type { Challenge, ChallengeStatus } from "./mock-data";

function challenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: Math.random().toString(36).slice(2),
    name: "A Challenge",
    sport: "Run",
    metric: "distance",
    goal: 50,
    unit: "km",
    badge: "ACHA",
    blurb: "",
    startsAt: "2026-08-01",
    endsAt: "2026-08-31",
    monthIdx: 24319,
    status: "active",
    visibility: "private",
    participants: 1,
    joined: true,
    progress: { total: 0, pct: 0, activities: 0, lastDate: null, complete: false },
    createdBy: { name: "Me", handle: "me", isMe: true },
    ...overrides,
  };
}

describe("tallyByStatus", () => {
  it("counts each tab independently", () => {
    const tally = tallyByStatus([
      challenge({ status: "active" }),
      challenge({ status: "active" }),
      challenge({ status: "upcoming" }),
      challenge({ status: "past" }),
    ]);

    expect(tally).toEqual({ active: 2, upcoming: 1, past: 1 });
  });

  it("reports zeroes for an empty shelf rather than undefined", () => {
    expect(tallyByStatus([])).toEqual({ active: 0, upcoming: 0, past: 0 });
  });
});

describe("shelfFor", () => {
  it("shows only the requested tab", () => {
    const shelf = shelfFor(
      [
        challenge({ name: "Now", status: "active" }),
        challenge({ name: "Later", status: "upcoming" }),
      ],
      "active",
    );

    expect(shelf.map((c) => c.name)).toEqual(["Now"]);
  });

  it("puts the newest month first", () => {
    const shelf = shelfFor(
      [
        challenge({ name: "Older", monthIdx: 24310, status: "past" }),
        challenge({ name: "Newer", monthIdx: 24318, status: "past" }),
      ],
      "past",
    );

    expect(shelf.map((c) => c.name)).toEqual(["Newer", "Older"]);
  });

  it("sorts the athlete's own above other people's", () => {
    const mine = { name: "Mine", createdBy: { name: "Me", handle: "me", isMe: true } };
    const theirs = { name: "Theirs", createdBy: { name: "Ada", handle: "ada", isMe: false } };
    const shelf = shelfFor([challenge(theirs), challenge(mine)], "active");

    expect(shelf.map((c) => c.name)).toEqual(["Mine", "Theirs"]);
  });

  it("sorts joined above not-joined within the same author group", () => {
    const author = { name: "Ada", handle: "ada", isMe: false };
    const shelf = shelfFor(
      [
        challenge({ name: "Open", joined: false, createdBy: author }),
        challenge({ name: "Joined", joined: true, createdBy: author }),
      ],
      "active",
    );

    expect(shelf.map((c) => c.name)).toEqual(["Joined", "Open"]);
  });

  it("breaks remaining ties by name, so the order is stable", () => {
    const shelf = shelfFor([challenge({ name: "Zulu" }), challenge({ name: "Alpha" })], "active");

    expect(shelf.map((c) => c.name)).toEqual(["Alpha", "Zulu"]);
  });

  it("does not mutate the input array", () => {
    const input = [challenge({ name: "B" }), challenge({ name: "A" })];
    const before = input.map((c) => c.name);

    shelfFor(input, "active");

    expect(input.map((c) => c.name)).toEqual(before);
  });

  it("returns nothing when the tab is empty", () => {
    expect(shelfFor([challenge({ status: "active" })], "past")).toEqual([]);
  });
});

describe("pastMonths", () => {
  it("lists each month once, newest first", () => {
    expect(
      pastMonths([
        challenge({ monthIdx: 24317 }),
        challenge({ monthIdx: 24319 }),
        challenge({ monthIdx: 24317 }),
      ]),
    ).toEqual([24319, 24317]);
  });
});

describe("completedCount", () => {
  it("counts only challenges the athlete joined and finished", () => {
    const done = { total: 50, pct: 100, activities: 3, lastDate: null, complete: true };
    const partial = { total: 10, pct: 20, activities: 1, lastDate: null, complete: false };

    expect(
      completedCount([
        challenge({ joined: true, progress: done }),
        challenge({ joined: true, progress: partial }),
        // Completed on paper, but they never joined — not theirs to claim.
        challenge({ joined: false, progress: done }),
      ]),
    ).toBe(1);
  });
});

describe("emptyShelfCopy", () => {
  it("asks a brand-new athlete to create their first challenge", () => {
    for (const status of ["active", "upcoming", "past"] as ChallengeStatus[]) {
      const copy = emptyShelfCopy(status, true);

      expect(copy.title).toBe("Make your own challenge");
      expect(copy.showCreate).toBe(true);
    }
  });

  it("explains the specific empty tab once they have challenges elsewhere", () => {
    expect(emptyShelfCopy("active", false).title).toBe("Nothing running this month");
    expect(emptyShelfCopy("upcoming", false).title).toBe("Nothing lined up for next month");
  });

  it("offers no create button on Past, which no action can fill", () => {
    expect(emptyShelfCopy("past", false).showCreate).toBe(false);
  });
});
