import { describe, expect, it } from "vitest";
import {
  HORIZON_MONTHS,
  badgeFor,
  blurbFor,
  canView,
  firstDay,
  lastDay,
  monthIndex,
  monthIndexOf,
  parseChallengeDraft,
  progressFor,
  statusOf,
  todayISO,
  type EffortBucket,
} from "./challenges.js";

const TODAY = "2026-08-10";
const AUGUST = monthIndex(2026, 7);

describe("month arithmetic", () => {
  it("round-trips an ISO date through a month index", () => {
    expect(monthIndexOf(TODAY)).toBe(AUGUST);
  });

  it("spans the whole calendar month", () => {
    expect(firstDay(AUGUST)).toBe("2026-08-01");
    expect(lastDay(AUGUST)).toBe("2026-08-31");
  });

  it("handles short months and leap years", () => {
    expect(lastDay(monthIndex(2026, 1))).toBe("2026-02-28");
    expect(lastDay(monthIndex(2028, 1))).toBe("2028-02-29");
    expect(lastDay(monthIndex(2026, 3))).toBe("2026-04-30");
  });

  it("rolls the year over at December", () => {
    expect(firstDay(monthIndex(2026, 11) + 1)).toBe("2027-01-01");
    expect(lastDay(monthIndex(2026, 11) + 1)).toBe("2027-01-31");
  });

  it("reads today as a UTC calendar date", () => {
    expect(todayISO(new Date("2026-08-10T23:30:00Z"))).toBe("2026-08-10");
  });
});

describe("the Active / Upcoming / Past filter", () => {
  it("sorts a challenge by the month it runs in", () => {
    expect(statusOf(AUGUST - 1, TODAY)).toBe("past");
    expect(statusOf(AUGUST, TODAY)).toBe("active");
    expect(statusOf(AUGUST + 1, TODAY)).toBe("upcoming");
  });

  it("keeps a challenge active until its last day", () => {
    expect(statusOf(AUGUST, "2026-08-01")).toBe("active");
    expect(statusOf(AUGUST, "2026-08-31")).toBe("active");
  });

  it("moves it to past the day the month turns", () => {
    expect(statusOf(AUGUST, "2026-09-01")).toBe("past");
  });

  it("promotes next month's challenge to active on the 1st", () => {
    expect(statusOf(AUGUST + 1, "2026-08-31")).toBe("upcoming");
    expect(statusOf(AUGUST + 1, "2026-09-01")).toBe("active");
  });

  it("handles a December challenge viewed from January", () => {
    const december = monthIndex(2026, 11);

    expect(statusOf(december, "2026-12-15")).toBe("active");
    expect(statusOf(december, "2027-01-01")).toBe("past");
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

  const runChallenge = {
    sport: "Run" as const,
    metric: "distance" as const,
    goal: 65,
    monthIdx: AUGUST,
  };

  it("sums the athlete's effort inside the window", () => {
    const buckets = new Map([
      [`Run:${AUGUST}`, bucket({ distanceKm: 31.6, activities: 4, lastDate: "2026-08-05" })],
    ]);
    const progress = progressFor(runChallenge, buckets);

    expect(progress.total).toBe(31.6);
    expect(progress.activities).toBe(4);
    expect(progress.lastDate).toBe("2026-08-05");
    expect(progress.complete).toBe(false);
  });

  it("ignores effort from another month — the window is the whole point", () => {
    const buckets = new Map([[`Run:${AUGUST - 1}`, bucket({ distanceKm: 400 })]]);

    expect(progressFor(runChallenge, buckets).total).toBe(0);
  });

  it("ignores another sport's effort", () => {
    const buckets = new Map([[`Ride:${AUGUST}`, bucket({ distanceKm: 400 })]]);

    expect(progressFor(runChallenge, buckets).total).toBe(0);
  });

  it("counts metres for an elevation goal, not kilometres", () => {
    const buckets = new Map([[`Hike:${AUGUST}`, bucket({ distanceKm: 40, elevationM: 4200 })]]);
    const progress = progressFor(
      { sport: "Hike", metric: "elevation", goal: 4000, monthIdx: AUGUST },
      buckets,
    );

    expect(progress.total).toBe(4000);
    expect(progress.complete).toBe(true);
  });

  it("stops at the goal — a challenge completes once", () => {
    const buckets = new Map([[`Run:${AUGUST}`, bucket({ distanceKm: 247.3 })]]);
    const progress = progressFor(runChallenge, buckets);

    expect(progress.total).toBe(65);
    expect(progress.pct).toBe(100);
    expect(progress.complete).toBe(true);
  });

  it("completes on exactly hitting the goal", () => {
    const buckets = new Map([[`Run:${AUGUST}`, bucket({ distanceKm: 65 })]]);

    expect(progressFor(runChallenge, buckets).complete).toBe(true);
  });

  it("reports zero for an athlete with no activities yet", () => {
    const progress = progressFor(runChallenge, new Map());

    expect(progress.total).toBe(0);
    expect(progress.pct).toBe(0);
    expect(progress.activities).toBe(0);
    expect(progress.lastDate).toBeNull();
    expect(progress.complete).toBe(false);
  });
});

describe("creating a challenge", () => {
  const valid = {
    name: "Sunrise Crew 75K",
    sport: "Run",
    metric: "distance",
    goal: 75,
    monthIdx: AUGUST,
    visibility: "friends",
  };

  function parse(overrides: Record<string, unknown> = {}) {
    return parseChallengeDraft({ ...valid, ...overrides }, TODAY);
  }

  it("accepts a well-formed draft", () => {
    const result = parse();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.name).toBe("Sunrise Crew 75K");
      expect(result.draft.goal).toBe(75);
    }
  });

  it("trims the name", () => {
    const result = parse({ name: "  Dawn Patrol  " });

    expect(result.ok && result.draft.name).toBe("Dawn Patrol");
  });

  it("rejects a name that is blank, too short, or too long", () => {
    for (const name of ["", " ", "a", "  x  ", "z".repeat(81)]) {
      expect(parse({ name }).ok).toBe(false);
    }
  });

  it("accepts a name at the length limit", () => {
    expect(parse({ name: "z".repeat(80) }).ok).toBe(true);
  });

  it("rejects a name that isn't a string", () => {
    for (const name of [null, undefined, 42, {}, []]) {
      expect(parse({ name }).ok).toBe(false);
    }
  });

  it("rejects an unknown sport", () => {
    for (const sport of ["Ski", "", null, "run"]) {
      expect(parse({ sport }).ok).toBe(false);
    }
  });

  it("rejects an unknown metric", () => {
    for (const metric of ["pace", "", null, "Distance"]) {
      expect(parse({ metric }).ok).toBe(false);
    }
  });

  it("rejects a goal that isn't a usable number", () => {
    for (const goal of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, "abc", null, 100_001]) {
      expect(parse({ goal }).ok).toBe(false);
    }
  });

  it("accepts a numeric string goal, as the form sends it", () => {
    const result = parse({ goal: "42" });

    expect(result.ok && result.draft.goal).toBe(42);
  });

  it("rejects an unknown visibility", () => {
    for (const visibility of ["everyone", "", null, "Public"]) {
      expect(parse({ visibility }).ok).toBe(false);
    }
  });

  it("allows this month and next, and nothing else", () => {
    expect(parse({ monthIdx: AUGUST }).ok).toBe(true);
    expect(parse({ monthIdx: AUGUST + HORIZON_MONTHS }).ok).toBe(true);
    expect(parse({ monthIdx: AUGUST - 1 }).ok).toBe(false);
    expect(parse({ monthIdx: AUGUST + HORIZON_MONTHS + 1 }).ok).toBe(false);
  });

  it("rejects a month that isn't a whole number", () => {
    for (const monthIdx of [AUGUST + 0.5, Number.NaN, "August", null]) {
      expect(parse({ monthIdx }).ok).toBe(false);
    }
  });

  it("explains why it refused", () => {
    const result = parse({ monthIdx: AUGUST + 5 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("A challenge can only run this month or next");
    }
  });

  it("derives a four-letter badge, with a fallback", () => {
    expect(badgeFor("Sunrise Crew 75K")).toBe("SUNR");
    expect(badgeFor("Go")).toBe("GO");
    expect(badgeFor("   ")).toBe("MINE");
  });

  it("describes the audience in the blurb", () => {
    expect(blurbFor("private")).toBe("Just for you.");
    expect(blurbFor("friends")).toBe("Open to people you follow.");
    expect(blurbFor("public")).toBe("Open to anyone on Stride.");
  });
});

describe("who can see a challenge", () => {
  const author = "athlete-1";
  const stranger = "athlete-2";
  const follower = "athlete-3";
  const followedByFollower = new Set([author]);
  const nobody = new Set<string>();

  it("shows a public challenge to anyone", () => {
    const challenge = { visibility: "public", createdBy: author };

    expect(canView(challenge, stranger, nobody)).toBe(true);
    expect(canView(challenge, author, nobody)).toBe(true);
  });

  it("keeps a private challenge to its author", () => {
    const challenge = { visibility: "private", createdBy: author };

    expect(canView(challenge, author, nobody)).toBe(true);
    expect(canView(challenge, stranger, nobody)).toBe(false);
    // Following the author is not enough to see a private one.
    expect(canView(challenge, follower, followedByFollower)).toBe(false);
  });

  it("shows a friends-only challenge to people who follow the author", () => {
    const challenge = { visibility: "friends", createdBy: author };

    expect(canView(challenge, follower, followedByFollower)).toBe(true);
    expect(canView(challenge, stranger, nobody)).toBe(false);
    expect(canView(challenge, author, nobody)).toBe(true);
  });

  it("does not treat being followed *by* the author as following them", () => {
    // The set passed in is who the viewer follows. An author following the
    // viewer must not grant the viewer access.
    const challenge = { visibility: "friends", createdBy: author };

    expect(canView(challenge, stranger, new Set([stranger]))).toBe(false);
  });

  it("refuses an unrecognised visibility rather than defaulting open", () => {
    expect(canView({ visibility: "unlisted", createdBy: author }, stranger, nobody)).toBe(false);
  });
});
