import { describe, expect, it } from "vitest";
import {
  MOMENTUM_WINDOW_DAYS,
  isElevationMetric,
  momentumWindowStart,
  pickMomentumChallenge,
  rankBoard,
  selectVisibleRows,
  type BoardInput,
  type BoardRow,
} from "./momentum.js";

type Candidate = {
  id: string;
  sport: string;
  goalKm: number;
  endsAt: string;
  joined: boolean;
};

function candidate(overrides: Partial<Candidate> & { id: string }): Candidate {
  return {
    sport: "Run",
    goalKm: 100,
    endsAt: "2026-04-30",
    joined: false,
    ...overrides,
  };
}

function board(entries: Array<Partial<BoardInput> & { athleteId: string; value: number }>) {
  return entries.map((entry) => ({
    name: entry.athleteId,
    avatar: `${entry.athleteId}.png`,
    ...entry,
  })) as BoardInput[];
}

describe("momentumWindowStart", () => {
  it("looks back a rolling 30 days", () => {
    const now = new Date("2026-08-07T12:00:00.000Z");

    expect(momentumWindowStart(now).toISOString()).toBe("2026-07-08T12:00:00.000Z");
    expect(MOMENTUM_WINDOW_DAYS).toBe(30);
  });
});

describe("isElevationMetric", () => {
  it("only treats elevation_m as an elevation challenge", () => {
    expect(isElevationMetric("elevation_m")).toBe(true);
    expect(isElevationMetric("distance_km")).toBe(false);
  });
});

describe("pickMomentumChallenge", () => {
  const carried = (map: Record<string, number>) => (c: Candidate) => map[c.id] ?? 0;

  it("ignores challenges for a different sport", () => {
    const picked = pickMomentumChallenge(
      [candidate({ id: "ride", sport: "Ride" }), candidate({ id: "run", sport: "Run" })],
      "Run",
      carried({ ride: 400, run: 20 }),
    );

    expect(picked?.id).toBe("run");
  });

  it("prefers the challenge the athlete is furthest through", () => {
    const picked = pickMomentumChallenge(
      [candidate({ id: "far", goalKm: 100 }), candidate({ id: "near", goalKm: 10 })],
      "Run",
      carried({ far: 20, near: 8 }),
    );

    // 8/10 beats 20/100 — the fuller bar is the stronger pitch.
    expect(picked?.id).toBe("near");
  });

  it("puts unjoined challenges ahead of joined ones regardless of progress", () => {
    const picked = pickMomentumChallenge(
      [
        candidate({ id: "joined", goalKm: 10, joined: true }),
        candidate({ id: "open", goalKm: 100 }),
      ],
      "Run",
      carried({ joined: 9, open: 20 }),
    );

    expect(picked?.id).toBe("open");
  });

  it("still returns a joined challenge when nothing is left to convert", () => {
    const picked = pickMomentumChallenge(
      [candidate({ id: "joined", joined: true })],
      "Run",
      carried({ joined: 40 }),
    );

    expect(picked?.id).toBe("joined");
  });

  it("returns nothing when the athlete has no distance to carry", () => {
    expect(pickMomentumChallenge([candidate({ id: "run" })], "Run", carried({}))).toBeUndefined();
  });

  it("breaks ties on the soonest end date", () => {
    const picked = pickMomentumChallenge(
      [
        candidate({ id: "later", endsAt: "2026-06-30" }),
        candidate({ id: "sooner", endsAt: "2026-05-31" }),
      ],
      "Run",
      carried({ later: 20, sooner: 20 }),
    );

    expect(picked?.id).toBe("sooner");
  });

  it("does not divide by a zero goal", () => {
    const picked = pickMomentumChallenge(
      [candidate({ id: "zero", goalKm: 0 })],
      "Run",
      carried({ zero: 20 }),
    );

    expect(picked?.id).toBe("zero");
  });
});

describe("rankBoard", () => {
  it("ranks by value descending and numbers rows from one", () => {
    const ranked = rankBoard(
      board([
        { athleteId: "b", value: 40 },
        { athleteId: "a", value: 90 },
        { athleteId: "c", value: 60 },
      ]),
    );

    expect(ranked.map((entry) => [entry.athleteId, entry.rank])).toEqual([
      ["a", 1],
      ["c", 2],
      ["b", 3],
    ]);
  });

  it("slots the athlete in by distance, so the rank shown is the one they hold", () => {
    const ranked = rankBoard(
      board([
        { athleteId: "a", value: 88.2 },
        { athleteId: "b", value: 74.6 },
        { athleteId: "me", value: 62.4, isMe: true },
        { athleteId: "c", value: 65.5 },
      ]),
    );

    expect(ranked.find((entry) => entry.isMe)?.rank).toBe(4);
  });

  it("breaks ties by name so ordering is stable", () => {
    const ranked = rankBoard(
      board([
        { athleteId: "zoe", value: 10 },
        { athleteId: "abe", value: 10 },
      ]),
    );

    expect(ranked.map((entry) => entry.athleteId)).toEqual(["abe", "zoe"]);
  });

  it("defaults the isMe and isFollowing flags", () => {
    const [entry] = rankBoard(board([{ athleteId: "a", value: 1 }]));

    expect(entry.isMe).toBe(false);
    expect(entry.isFollowing).toBe(false);
  });
});

describe("selectVisibleRows", () => {
  const ranked = (count: number, meRank?: number): BoardRow[] =>
    rankBoard(
      board(
        Array.from({ length: count }, (_, index) => ({
          athleteId: `a${index + 1}`,
          value: count - index,
          isMe: meRank !== undefined && index + 1 === meRank,
        })),
      ),
    );

  it("returns every row when the board already fits", () => {
    expect(selectVisibleRows(ranked(6), 8)).toHaveLength(6);
  });

  it("trims to the leaders when the athlete is near the top", () => {
    const rows = selectVisibleRows(ranked(30, 2), 8);

    expect(rows).toHaveLength(8);
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("keeps the athlete and the rival directly above when they rank far down", () => {
    const rows = selectVisibleRows(ranked(30, 20), 8);

    // Leaders for context, then the athlete's own neighbourhood.
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3, 19, 20, 21]);
    expect(rows.find((row) => row.isMe)?.rank).toBe(20);
  });

  it("keeps the athlete visible when they are last", () => {
    const rows = selectVisibleRows(ranked(30, 30), 8);

    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3, 29, 30]);
    expect(rows.at(-1)?.isMe).toBe(true);
  });

  it("falls back to the leaders when no row is the athlete", () => {
    const rows = selectVisibleRows(ranked(30), 8);

    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
