import { describe, expect, it } from "vitest";
import {
  RECAP_CARD_HEIGHT,
  RECAP_CARD_WIDTH,
  drawRecapCard,
  firstName,
  formatRecapDistance,
  formatStreak,
  formatWeekRange,
  numberWord,
  recapAwardBanner,
  recapCardStats,
  recapEyebrow,
  recapHeadline,
  recapImageFilename,
  recapShareText,
  recapSubhead,
  type RecapAthlete,
} from "./recap-card";
import type { WeeklyRecap } from "./weekly-recap";

const ATHLETE: RecapAthlete = { name: "Alex Carter", handle: "alex" };

function recap(overrides: Partial<WeeklyRecap> = {}): WeeklyRecap {
  return {
    weekStart: new Date(2026, 0, 12).toISOString(),
    weekEnd: new Date(2026, 0, 19).toISOString(),
    runCount: 4,
    distanceKm: 25.9,
    movingSeconds: 10_800,
    streakWeeks: 6,
    tier: "power_runner",
    runsToUnlock: 0,
    progressPct: 100,
    ...overrides,
  };
}

const standard = (overrides: Partial<WeeklyRecap> = {}) =>
  recap({ tier: "standard", runCount: 4, ...overrides });

describe("firstName", () => {
  it("takes the leading token so copy reads conversationally", () => {
    expect(firstName("Alex Carter")).toBe("Alex");
    expect(firstName("Alex")).toBe("Alex");
    expect(firstName("  Alex   Carter ")).toBe("Alex");
  });
});

describe("numberWord", () => {
  it("spells small numbers, as the prototype headline does", () => {
    expect(numberWord(4)).toBe("four");
    expect(numberWord(10)).toBe("ten");
  });

  it("falls back to digits past ten", () => {
    expect(numberWord(11)).toBe("11");
  });
});

describe("formatWeekRange", () => {
  it("labels the inclusive last day, not the exclusive end bound", () => {
    // weekEnd is Mon Jan 19 exclusive, so the label must end on Sun Jan 18.
    expect(formatWeekRange(recap().weekStart, recap().weekEnd)).toBe("Jan 12 – Jan 18");
  });
});

describe("formatRecapDistance", () => {
  it("uses the one-decimal register the app's other weekly aggregates use", () => {
    expect(formatRecapDistance(25.9)).toBe("25.9");
    expect(formatRecapDistance(32)).toBe("32.0");
  });
});

describe("formatStreak", () => {
  it("renders a compact week count", () => {
    expect(formatStreak(6)).toBe("6w");
  });
});

describe("recapAwardBanner", () => {
  it("only the Power Runner tier carries the gold award banner", () => {
    expect(recapAwardBanner("power_runner")).toBe("POWER RUNNER ACHIEVED");
    expect(recapAwardBanner("standard")).toBe(null);
  });
});

describe("recapEyebrow", () => {
  it("says THIS WEEK, not 7 DAYS, because the window is a Mon–Sun week", () => {
    expect(recapEyebrow(recap())).toBe("4 RUNS · THIS WEEK");
    expect(recapEyebrow(recap())).not.toContain("7 DAYS");
  });

  it("falls back to the plain recap label on the standard tier", () => {
    expect(recapEyebrow(standard())).toBe("WEEKLY RECAP");
  });
});

describe("recapHeadline", () => {
  it("is written in the third person, for the friend receiving the card", () => {
    expect(recapHeadline(recap(), ATHLETE)).toBe("Alex ran four times this week.");
    expect(recapHeadline(standard(), ATHLETE)).toBe("Alex's week on Stride.");
  });

  it("never addresses the runner directly", () => {
    expect(recapHeadline(recap(), ATHLETE)).not.toMatch(/\byou\b/i);
  });
});

describe("recapSubhead", () => {
  it("leads with the streak on the Power Runner tier", () => {
    expect(recapSubhead(recap())).toBe("25.9 km on the legs, with a 6-week streak still alive.");
  });

  it("states distance across runs on the standard tier", () => {
    expect(recapSubhead(standard())).toBe("25.9 km across 4 runs.");
  });

  it("pluralises a single run", () => {
    expect(recapSubhead(standard({ runCount: 1 }))).toBe("25.9 km across 1 run.");
  });
});

describe("recapShareText", () => {
  it("carries the headline, the detail and the attribution", () => {
    expect(recapShareText(recap(), ATHLETE)).toBe(
      "Alex ran four times this week. 25.9 km on the legs, with a 6-week streak still alive. Logged with Stride.",
    );
  });
});

describe("recapCardStats", () => {
  it("emphasises the run count on Power Runner", () => {
    const stats = recapCardStats(recap());

    expect(stats.map((stat) => stat.label)).toEqual(["KM THIS WEEK", "RUNS", "WK STREAK"]);
    expect(stats.map((stat) => stat.value)).toEqual(["25.9", "4", "6"]);
    expect(stats.find((stat) => stat.emphasis)?.label).toBe("RUNS");
  });

  it("emphasises distance on the standard tier", () => {
    expect(recapCardStats(standard()).find((stat) => stat.emphasis)?.label).toBe("KM THIS WEEK");
  });
});

describe("recapImageFilename", () => {
  it("names the file after the week and the tier", () => {
    expect(recapImageFilename(recap().weekStart, "power_runner")).toMatch(
      /^stride-power-runner-\d{4}-\d{2}-\d{2}\.png$/,
    );
    expect(recapImageFilename(recap().weekStart, "standard")).toMatch(
      /^stride-recap-\d{4}-\d{2}-\d{2}\.png$/,
    );
  });
});

describe("drawRecapCard", () => {
  /** Minimal 2D-context stand-in — enough to assert the draw calls without a DOM. */
  function stubCanvas() {
    const filled: string[] = [];
    const context = {
      fillStyle: "",
      font: "",
      textAlign: "" as CanvasTextAlign,
      fillRect: () => {},
      fillText: (text: string) => filled.push(text),
    };

    return {
      filled,
      canvas: {
        width: 0,
        height: 0,
        getContext: () => context as unknown as CanvasRenderingContext2D,
        toBlob: () => {},
      },
    };
  }

  it("sizes the canvas to the 4:5 share format", () => {
    const { canvas } = stubCanvas();

    drawRecapCard(canvas, recap(), ATHLETE);

    expect(canvas.width).toBe(RECAP_CARD_WIDTH);
    expect(canvas.height).toBe(RECAP_CARD_HEIGHT);
  });

  it("paints the award banner, headline, stats and attribution", () => {
    const { canvas, filled } = stubCanvas();

    drawRecapCard(canvas, recap(), ATHLETE);

    expect(filled).toContain("POWER RUNNER ACHIEVED");
    expect(filled).toContain("4 RUNS · THIS WEEK");
    expect(filled).toContain("Alex ran four times this week.");
    expect(filled).toContain("25.9");
    expect(filled).toContain("KM THIS WEEK");
    expect(filled).toContain("Alex Carter");
    expect(filled).toContain("@ALEX");
    expect(filled).toContain("Stride");
  });

  it("omits the award banner on the standard tier", () => {
    const { canvas, filled } = stubCanvas();

    drawRecapCard(canvas, standard(), ATHLETE);

    expect(filled).not.toContain("POWER RUNNER ACHIEVED");
    expect(filled).toContain("Alex's week on Stride.");
  });

  it("does nothing when the canvas has no 2D context", () => {
    const canvas = { width: 0, height: 0, getContext: () => null, toBlob: () => {} };

    expect(() => drawRecapCard(canvas, recap(), ATHLETE)).not.toThrow();
    expect(canvas.width).toBe(0);
  });
});
