import { describe, expect, it } from "vitest";
import {
  buildLeaderboard,
  computeProgress,
  daysRemaining,
  isWithinWindow,
  projectPace,
  qualifies,
  splitByStatus,
  sumMetric,
  type CandidateActivity,
  type ChallengeWindow,
} from "./challenge-progress.js";

const WINDOW: ChallengeWindow = {
  sport: "Run",
  metricType: "distance_km",
  goal: 100,
  startsAt: "2026-04-01",
  endsAt: "2026-04-30",
};

function activity(overrides: Partial<CandidateActivity> = {}): CandidateActivity {
  return {
    id: "a1",
    athleteId: "me",
    sport: "Run",
    title: "Morning run",
    date: "2026-04-10T06:00:00.000Z",
    distanceKm: 10,
    elevationM: 100,
    ...overrides,
  };
}

describe("isWithinWindow", () => {
  it("includes both boundary days", () => {
    expect(isWithinWindow("2026-04-01T00:00:00.000Z", WINDOW)).toBe(true);
    expect(isWithinWindow("2026-04-30T23:59:59.000Z", WINDOW)).toBe(true);
  });

  it("excludes days outside the window", () => {
    expect(isWithinWindow("2026-03-31T23:00:00.000Z", WINDOW)).toBe(false);
    expect(isWithinWindow("2026-05-01T00:00:00.000Z", WINDOW)).toBe(false);
  });
});

describe("qualifies", () => {
  it("requires a matching sport", () => {
    expect(qualifies(activity({ sport: "Ride" }), WINDOW)).toBe(false);
    expect(qualifies(activity({ sport: "Run" }), WINDOW)).toBe(true);
  });

  it("rejects in-sport activity outside the window", () => {
    expect(qualifies(activity({ date: "2026-05-02T06:00:00.000Z" }), WINDOW)).toBe(false);
  });
});

describe("splitByStatus", () => {
  const activities = [
    activity({ id: "counted-1" }),
    activity({ id: "pending-1" }),
    activity({ id: "dismissed-1" }),
    activity({ id: "wrong-sport", sport: "Swim" }),
    activity({ id: "outside", date: "2026-05-10T06:00:00.000Z" }),
  ];

  it("treats undecided activities as pending", () => {
    const split = splitByStatus(
      activities,
      [{ activityId: "counted-1", status: "counted" }],
      WINDOW,
    );

    expect(split.counted.map((a) => a.id)).toEqual(["counted-1"]);
    expect(split.pending.map((a) => a.id)).toEqual(["pending-1", "dismissed-1"]);
  });

  it("honours explicit dismissals", () => {
    const split = splitByStatus(
      activities,
      [
        { activityId: "counted-1", status: "counted" },
        { activityId: "dismissed-1", status: "dismissed" },
      ],
      WINDOW,
    );

    expect(split.pending.map((a) => a.id)).toEqual(["pending-1"]);
    expect(split.dismissed.map((a) => a.id)).toEqual(["dismissed-1"]);
  });

  it("drops non-qualifying activities from every bucket", () => {
    const split = splitByStatus(activities, [], WINDOW);
    const all = [...split.counted, ...split.pending, ...split.dismissed].map((a) => a.id);

    expect(all).not.toContain("wrong-sport");
    expect(all).not.toContain("outside");
  });

  it("ignores a confirmation pointing at a non-qualifying activity", () => {
    const split = splitByStatus(activities, [{ activityId: "outside", status: "counted" }], WINDOW);

    expect(split.counted).toHaveLength(0);
  });
});

describe("sumMetric", () => {
  it("sums distance for distance challenges", () => {
    expect(
      sumMetric([activity({ distanceKm: 10.25 }), activity({ distanceKm: 5.1 })], "distance_km"),
    ).toBe(15.4);
  });

  it("sums elevation for climbing challenges", () => {
    expect(
      sumMetric([activity({ elevationM: 320 }), activity({ elevationM: 180 })], "elevation_m"),
    ).toBe(500);
  });

  it("returns zero for an empty list", () => {
    expect(sumMetric([], "distance_km")).toBe(0);
  });
});

describe("computeProgress", () => {
  it("counts only confirmed activities toward the total", () => {
    const split = splitByStatus(
      [activity({ id: "x", distanceKm: 30 }), activity({ id: "y", distanceKm: 25 })],
      [{ activityId: "x", status: "counted" }],
      WINDOW,
    );
    const progress = computeProgress(split, WINDOW);

    expect(progress.countedTotal).toBe(30);
    expect(progress.pendingTotal).toBe(25);
    expect(progress.remaining).toBe(70);
    expect(progress.percentComplete).toBe(30);
  });

  it("caps percentage at 100 when the goal is beaten", () => {
    const split = splitByStatus(
      [activity({ id: "x", distanceKm: 250 })],
      [{ activityId: "x", status: "counted" }],
      WINDOW,
    );
    const progress = computeProgress(split, WINDOW);

    expect(progress.percentComplete).toBe(100);
    expect(progress.remaining).toBe(0);
  });

  it("does not divide by zero on a zero-goal challenge", () => {
    const progress = computeProgress(
      { counted: [], pending: [], dismissed: [] },
      { ...WINDOW, goal: 0 },
    );

    expect(progress.percentComplete).toBe(0);
  });
});

describe("daysRemaining", () => {
  it("counts today as a remaining day", () => {
    expect(daysRemaining(WINDOW, new Date("2026-04-30T09:00:00.000Z"))).toBe(1);
    expect(daysRemaining(WINDOW, new Date("2026-04-25T09:00:00.000Z"))).toBe(6);
  });

  it("floors at zero once the challenge has closed", () => {
    expect(daysRemaining(WINDOW, new Date("2026-05-05T09:00:00.000Z"))).toBe(0);
  });
});

describe("projectPace", () => {
  it("reports on pace when the recent average clears the required rate", () => {
    const split = splitByStatus(
      [activity({ id: "x", distanceKm: 80 })],
      [{ activityId: "x", status: "counted" }],
      WINDOW,
    );
    const pace = projectPace(
      computeProgress(split, WINDOW),
      WINDOW,
      new Date("2026-04-25T09:00:00.000Z"),
    );

    // 20 km left over 6 days = 3.3/day required; 80 km over 25 elapsed days = 3.2/day.
    expect(pace.dailyTarget).toBe(3.3);
    expect(pace.averagePerDay).toBe(3.2);
    expect(pace.onPace).toBe(false);
  });

  it("drops the daily target to zero after the challenge closes", () => {
    const pace = projectPace(
      computeProgress({ counted: [], pending: [], dismissed: [] }, WINDOW),
      WINDOW,
      new Date("2026-05-05T09:00:00.000Z"),
    );

    expect(pace.daysLeft).toBe(0);
    expect(pace.dailyTarget).toBe(0);
  });
});

describe("buildLeaderboard", () => {
  const now = new Date("2026-04-25T09:00:00.000Z");
  const field = [
    activity({ id: "r1", athleteId: "rival", distanceKm: 50, date: "2026-04-02T06:00:00.000Z" }),
    activity({ id: "r2", athleteId: "rival", distanceKm: 30, date: "2026-04-24T06:00:00.000Z" }),
    activity({ id: "o1", athleteId: "other", distanceKm: 20, date: "2026-04-05T06:00:00.000Z" }),
    activity({ id: "m1", athleteId: "me", distanceKm: 40, date: "2026-04-20T06:00:00.000Z" }),
  ];

  it("ranks by total descending and includes the current user", () => {
    const board = buildLeaderboard(field, WINDOW, { selfId: "me", selfTotal: 40, now });

    expect(board.map((row) => row.athleteId)).toEqual(["rival", "me", "other"]);
    expect(board[0].total).toBe(80);
  });

  it("uses the confirmation-gated total for the current user, not raw activity", () => {
    const board = buildLeaderboard(field, WINDOW, { selfId: "me", selfTotal: 0, now });
    const me = board.find((row) => row.athleteId === "me");

    expect(me?.total).toBe(0);
    expect(me?.rank).toBe(3);
  });

  it("includes the current user at zero when they have no qualifying activity", () => {
    const board = buildLeaderboard(
      field.filter((a) => a.athleteId !== "me"),
      WINDOW,
      { selfId: "me", selfTotal: 0, now },
    );

    expect(board.find((row) => row.athleteId === "me")).toMatchObject({ total: 0 });
  });

  it("derives rank delta from 7-day form against overall standing", () => {
    const board = buildLeaderboard(field, WINDOW, { selfId: "me", selfTotal: 40, now });
    const other = board.find((row) => row.athleteId === "other");

    // "other" only logged outside the 7-day window, so its weekly rank trails.
    expect(other?.weeklyTotal).toBe(0);
    expect(other?.rankDelta).toBeLessThanOrEqual(0);
  });

  it("excludes activity from outside the window", () => {
    const board = buildLeaderboard(
      [
        activity({
          id: "old",
          athleteId: "rival",
          distanceKm: 999,
          date: "2026-03-01T06:00:00.000Z",
        }),
      ],
      WINDOW,
      { selfId: "me", selfTotal: 0, now },
    );

    expect(board.find((row) => row.athleteId === "rival")).toBeUndefined();
  });

  it("breaks ties deterministically", () => {
    const tied = [
      activity({ id: "t1", athleteId: "zoe", distanceKm: 10 }),
      activity({ id: "t2", athleteId: "abe", distanceKm: 10 }),
    ];
    const board = buildLeaderboard(tied, WINDOW, { selfId: "me", selfTotal: 0, now });

    expect(board.slice(0, 2).map((row) => row.athleteId)).toEqual(["abe", "zoe"]);
  });
});
