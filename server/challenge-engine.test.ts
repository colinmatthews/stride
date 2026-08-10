import { describe, expect, it } from "vitest";
import {
  HISTORY_MONTHS,
  HORIZON_MONTHS,
  SEEDED_SERIES,
  firstDay,
  goalFor,
  lastDay,
  mintShelf,
  monthIndex,
  monthIndexOf,
  mintMonth,
  participantsFor,
  progressFor,
  shelfMonths,
  statusOf,
  todayISO,
  type EffortBucket,
} from "./challenge-engine.js";

const AUGUST_2026 = monthIndex(2026, 7);

describe("month arithmetic", () => {
  it("round-trips an ISO date through a month index", () => {
    expect(monthIndexOf("2026-08-10")).toBe(AUGUST_2026);
  });

  it("spans the whole calendar month", () => {
    expect(firstDay(AUGUST_2026)).toBe("2026-08-01");
    expect(lastDay(AUGUST_2026)).toBe("2026-08-31");
  });

  it("handles short months and leap years", () => {
    expect(lastDay(monthIndex(2026, 1))).toBe("2026-02-28");
    expect(lastDay(monthIndex(2028, 1))).toBe("2028-02-29");
    expect(lastDay(monthIndex(2026, 3))).toBe("2026-04-30");
  });

  it("rolls the year over at December", () => {
    expect(firstDay(monthIndex(2026, 11) + 1)).toBe("2027-01-01");
  });
});

describe("the shelf refills itself", () => {
  it("mints a full set of editions for every month in range", () => {
    const shelf = mintShelf("2026-08-10");
    const months = new Set(shelf.map((edition) => edition.monthIdx));

    expect(months.size).toBe(HISTORY_MONTHS + HORIZON_MONTHS + 1);

    // The claim this whole feature rests on: no month is ever short.
    for (const month of months) {
      const editions = shelf.filter((edition) => edition.monthIdx === month);
      expect(editions).toHaveLength(SEEDED_SERIES.length);
    }
  });

  it("mints exactly one month ahead and no further", () => {
    const months = shelfMonths("2026-08-10");

    expect(Math.max(...months)).toBe(AUGUST_2026 + 1);
    expect(months).not.toContain(AUGUST_2026 + 2);
  });

  it("keeps refilling as the clock advances — no month is ever empty", () => {
    // This is what the prototype's "jump to next month" button demonstrated.
    for (const day of ["2026-08-10", "2026-09-01", "2026-10-15", "2027-01-01"]) {
      const shelf = mintShelf(day);
      const current = monthIndexOf(day);

      expect(shelf.filter((edition) => edition.monthIdx === current)).toHaveLength(
        SEEDED_SERIES.length,
      );
      expect(shelf.filter((edition) => edition.monthIdx === current + 1)).toHaveLength(
        SEEDED_SERIES.length,
      );
    }
  });

  it("gives September's editions September's dates and names", () => {
    const september = monthIndex(2026, 8);
    const [edition] = mintMonth(september, september, [SEEDED_SERIES[0]]);

    expect(edition.name).toBe("September Distance Run");
    expect(edition.startsAt).toBe("2026-09-01");
    expect(edition.endsAt).toBe("2026-09-30");
  });

  it("mints stable ids so re-seeding never duplicates an edition", () => {
    const first = mintShelf("2026-08-10").map((edition) => edition.id);
    const second = mintShelf("2026-08-10").map((edition) => edition.id);

    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(first.length);
  });
});

describe("goals", () => {
  it("is deterministic — a goal an athlete started chasing never moves", () => {
    for (const series of SEEDED_SERIES) {
      expect(goalFor(series, AUGUST_2026)).toBe(goalFor(series, AUGUST_2026));
    }
  });

  it("lands inside the series band on a readable step", () => {
    for (const series of SEEDED_SERIES) {
      for (let offset = 0; offset < 24; offset += 1) {
        const goal = goalFor(series, AUGUST_2026 + offset);

        expect(goal).toBeGreaterThanOrEqual(series.goalMin);
        expect(goal).toBeLessThanOrEqual(series.goalMax);
        expect((goal - series.goalMin) % series.goalStep).toBe(0);
      }
    }
  });

  it("varies month to month, so a series is a fresh ask", () => {
    const goals = new Set(
      Array.from({ length: 12 }, (_, offset) => goalFor(SEEDED_SERIES[0], AUGUST_2026 + offset)),
    );

    expect(goals.size).toBeGreaterThan(1);
  });

  it("keeps every reach-tier goal under 100", () => {
    for (const series of SEEDED_SERIES.filter((entry) => entry.tier === "reach")) {
      expect(series.goalMax).toBeLessThan(100);
    }
  });
});

describe("participants", () => {
  it("shows only pre-joins on an edition that hasn't started", () => {
    const series = SEEDED_SERIES[0];
    const started = participantsFor(series, AUGUST_2026, false);
    const future = participantsFor(series, AUGUST_2026, true);

    expect(future).toBeLessThan(started);
  });
});

describe("status", () => {
  it("splits the shelf into past, active and upcoming", () => {
    expect(statusOf(AUGUST_2026 - 1, "2026-08-10")).toBe("past");
    expect(statusOf(AUGUST_2026, "2026-08-10")).toBe("active");
    expect(statusOf(AUGUST_2026 + 1, "2026-08-10")).toBe("upcoming");
  });

  it("flips an edition from upcoming to active when the month turns", () => {
    const september = AUGUST_2026 + 1;

    expect(statusOf(september, "2026-08-31")).toBe("upcoming");
    expect(statusOf(september, "2026-09-01")).toBe("active");
  });
});

describe("progress", () => {
  const bucket = (overrides: Partial<EffortBucket> = {}): EffortBucket => ({
    distanceKm: 0,
    elevationM: 0,
    activities: 0,
    lastDate: null,
    ...overrides,
  });

  const runEdition = {
    sport: "Run" as const,
    metric: "distance" as const,
    goal: 65,
    monthIdx: AUGUST_2026,
  };

  it("sums the athlete's effort inside the window", () => {
    const buckets = new Map([
      [`Run:${AUGUST_2026}`, bucket({ distanceKm: 31.6, activities: 4, lastDate: "2026-08-05" })],
    ]);
    const progress = progressFor(runEdition, buckets);

    expect(progress.total).toBe(31.6);
    expect(progress.activities).toBe(4);
    expect(progress.lastDate).toBe("2026-08-05");
    expect(progress.complete).toBe(false);
  });

  it("ignores effort from another month — the window is the whole point", () => {
    const buckets = new Map([[`Run:${AUGUST_2026 - 1}`, bucket({ distanceKm: 400 })]]);

    expect(progressFor(runEdition, buckets).total).toBe(0);
  });

  it("ignores another sport's effort", () => {
    const buckets = new Map([[`Ride:${AUGUST_2026}`, bucket({ distanceKm: 400 })]]);

    expect(progressFor(runEdition, buckets).total).toBe(0);
  });

  it("counts metres for an elevation goal, not kilometres", () => {
    const buckets = new Map([
      [`Hike:${AUGUST_2026}`, bucket({ distanceKm: 40, elevationM: 4200 })],
    ]);
    const progress = progressFor(
      { sport: "Hike", metric: "elevation", goal: 4000, monthIdx: AUGUST_2026 },
      buckets,
    );

    expect(progress.total).toBe(4000);
    expect(progress.complete).toBe(true);
  });

  it("stops at the goal — a challenge completes once", () => {
    const buckets = new Map([[`Run:${AUGUST_2026}`, bucket({ distanceKm: 247.3 })]]);
    const progress = progressFor(runEdition, buckets);

    expect(progress.total).toBe(65);
    expect(progress.pct).toBe(100);
    expect(progress.complete).toBe(true);
  });

  it("reports zero for an athlete with no activities yet", () => {
    const progress = progressFor(runEdition, new Map());

    expect(progress.total).toBe(0);
    expect(progress.pct).toBe(0);
    expect(progress.activities).toBe(0);
    expect(progress.lastDate).toBeNull();
    expect(progress.complete).toBe(false);
  });
});

describe("todayISO", () => {
  it("returns a UTC calendar date", () => {
    expect(todayISO(new Date("2026-08-10T23:30:00Z"))).toBe("2026-08-10");
  });
});
