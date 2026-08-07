import { afterEach, describe, expect, it } from "vitest";
import {
  SPORT_ORDER,
  WEEKLY_CADENCE,
  challengeUnit,
  clearAppData,
  fmtDayMonth,
  fmtDayMonthLong,
  initializeAppData,
  parseIsoDate,
  weeklyChallengesForSports,
  type AppData,
  type Athlete,
  type Challenge,
  type Sport,
} from "./mock-data";
import {
  SPORT_ORDER as SERVER_SPORT_ORDER,
  WEEKLY_CADENCE as SERVER_WEEKLY_CADENCE,
  weeklyChallengeSeeds,
} from "../../server/challenges/weekly";

const WEEK_START = "2026-08-03";
const WEEK_END = "2026-08-09";
const NEXT_WEEK_START = "2026-08-10";

function weekly(sport: Sport, startsAt = WEEK_START, endsAt = WEEK_END): Challenge {
  return {
    id: `weekly-${sport.toLowerCase()}-${startsAt}`,
    name: `Week of ${startsAt}`,
    sport,
    goalKm: 20,
    myProgressKm: 0,
    participants: 1000,
    startsAt,
    endsAt,
    badge: sport.toUpperCase(),
    cadence: "weekly",
    joined: false,
  };
}

const MONTHLY: Challenge = {
  id: "ch1",
  name: "April Distance Run",
  sport: "Run",
  goalKm: 100,
  myProgressKm: 0,
  participants: 184230,
  endsAt: "2026-04-30",
  badge: "RUN",
  cadence: "monthly",
  joined: false,
};

const THIS_WEEK = SPORT_ORDER.map((sport) => weekly(sport));

function athlete(): Athlete {
  return {
    id: "me",
    name: "Me",
    handle: "me",
    avatar: "",
    city: "",
    country: "",
    followers: 0,
    following: 0,
    bio: "",
  };
}

function appData(overrides: Partial<AppData> = {}): AppData {
  return {
    me: athlete(),
    athletes: [athlete()],
    activities: [],
    segments: [],
    clubs: [],
    challenges: [],
    ...overrides,
  };
}

afterEach(() => {
  clearAppData();
});

describe("weeklyChallengesForSports", () => {
  it("offers one challenge per selected sport", () => {
    const offered = weeklyChallengesForSports(new Set<Sport>(["Run", "Hike"]), WEEK_START, [
      ...THIS_WEEK,
      MONTHLY,
    ]);

    expect(offered.map((challenge) => challenge.sport)).toEqual(["Run", "Hike"]);
  });

  it("returns challenges in SPORT_ORDER regardless of selection order", () => {
    const offered = weeklyChallengesForSports(new Set<Sport>(["Walk", "Run", "Swim"]), WEEK_START, [
      ...THIS_WEEK,
    ]);

    expect(offered.map((challenge) => challenge.sport)).toEqual(["Run", "Swim", "Walk"]);
  });

  it("covers all five activity types, including Hike and Walk", () => {
    const offered = weeklyChallengesForSports(new Set(SPORT_ORDER), WEEK_START, [...THIS_WEEK]);

    expect(offered.map((challenge) => challenge.sport)).toEqual([
      "Run",
      "Ride",
      "Swim",
      "Hike",
      "Walk",
    ]);
  });

  it("never offers monthly challenges", () => {
    const offered = weeklyChallengesForSports(new Set<Sport>(["Run"]), WEEK_START, [MONTHLY]);

    expect(offered).toEqual([]);
  });

  it("only offers the week the server put on the table", () => {
    const catalogue = [...THIS_WEEK, weekly("Run", NEXT_WEEK_START, "2026-08-16")];
    const offered = weeklyChallengesForSports(new Set<Sport>(["Run"]), NEXT_WEEK_START, catalogue);

    expect(offered).toHaveLength(1);
    expect(offered[0].id).toBe(`weekly-run-${NEXT_WEEK_START}`);
  });

  it("returns nothing when no sport is selected", () => {
    expect(weeklyChallengesForSports(new Set<Sport>(), WEEK_START, [...THIS_WEEK])).toEqual([]);
  });

  it("returns nothing when the server sent no challenge week", () => {
    expect(weeklyChallengesForSports(new Set<Sport>(["Run"]), null, [...THIS_WEEK])).toEqual([]);
  });

  it("skips a sport the server has no challenge for", () => {
    const offered = weeklyChallengesForSports(new Set<Sport>(["Run", "Swim"]), WEEK_START, [
      weekly("Run"),
    ]);

    expect(offered.map((challenge) => challenge.sport)).toEqual(["Run"]);
  });

  it("reads from the bootstrapped challenge list by default", () => {
    initializeAppData(
      appData({
        challenges: [...THIS_WEEK],
        challengeWeek: {
          start: WEEK_START,
          end: WEEK_END,
          isNextWeek: false,
          daysLeftInCurrentWeek: 6,
        },
      }),
    );

    expect(weeklyChallengesForSports(new Set<Sport>(["Ride"]), WEEK_START)).toHaveLength(1);
  });
});

// SPORT_ORDER and WEEKLY_CADENCE are declared on both sides of the client /
// server boundary because there is no shared module between src/ and server/.
// They are compared as plain strings at runtime, so a drift between the two
// copies fails silently: the picker would simply offer nothing. These tests are
// the only thing holding the two definitions together.
describe("client / server constant parity", () => {
  it("agrees on the cadence string used to identify weekly challenges", () => {
    expect(WEEKLY_CADENCE).toBe(SERVER_WEEKLY_CADENCE);
  });

  it("agrees on the sport list and its order", () => {
    expect(SPORT_ORDER).toEqual(SERVER_SPORT_ORDER);
  });

  it("offers every sport the server actually generates a challenge for", () => {
    const seeds = weeklyChallengeSeeds(parseIsoDate(WEEK_START));

    expect(seeds.map((seed) => seed.sport)).toEqual(SPORT_ORDER);
  });

  it("tags generated challenges with the cadence the client filters on", () => {
    for (const seed of weeklyChallengeSeeds(parseIsoDate(WEEK_START))) {
      expect(seed.cadence).toBe(WEEKLY_CADENCE);
    }
  });

  it("generates ids the client selector can match back to a sport and week", () => {
    const seeds = weeklyChallengeSeeds(parseIsoDate(WEEK_START));
    const asChallenges: Challenge[] = seeds.map((seed) => ({
      id: seed.id,
      name: seed.name,
      sport: seed.sport,
      goalKm: seed.goalKm,
      myProgressKm: 0,
      participants: seed.participants,
      startsAt: seed.startsAt,
      endsAt: seed.endsAt,
      badge: seed.badge,
      cadence: seed.cadence,
      metricType: seed.metricType,
    }));
    const offered = weeklyChallengesForSports(
      new Set<Sport>(["Run", "Walk"]),
      seeds[0].startsAt,
      asChallenges,
    );

    expect(offered.map((challenge) => challenge.sport)).toEqual(["Run", "Walk"]);
    expect(offered.map((challenge) => challenge.goalKm)).toEqual([20, 3]);
  });
});

describe("challengeUnit", () => {
  it("labels elevation challenges in metres", () => {
    expect(challengeUnit({ metricType: "elevation_m" })).toBe("m");
  });

  it("labels distance challenges in kilometres", () => {
    expect(challengeUnit({ metricType: "distance_km" })).toBe("km");
  });

  it("falls back to km when the server sent no metric type", () => {
    expect(challengeUnit({})).toBe("km");
  });

  it("does not mistake a large ride goal for elevation", () => {
    // The old heuristic read `sport === "Ride" && goalKm > 1000` as metres.
    expect(challengeUnit({ metricType: "distance_km" })).toBe("km");
  });
});

describe("parseIsoDate", () => {
  it("parses a date-only string as local midnight, not UTC", () => {
    const parsed = parseIsoDate(WEEK_START);

    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(7);
    expect(parsed.getDate()).toBe(3);
    expect(parsed.getHours()).toBe(0);
  });
});

describe("challenge week formatting", () => {
  it("formats the week range without shifting a day", () => {
    expect(fmtDayMonth(WEEK_START)).toBe("Aug 3");
    expect(fmtDayMonthLong(WEEK_START)).toBe("August 3");
    expect(fmtDayMonthLong(WEEK_END)).toBe("August 9");
  });
});
