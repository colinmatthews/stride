import { describe, expect, it } from "vitest";
import {
  RECAP_CARD_HEIGHT,
  RECAP_CARD_WIDTH,
  drawRecapCard,
  formatRecapDistance,
  formatStreak,
  formatWeekRange,
  recapCardStats,
  recapShareText,
} from "./recap-card";
import type { WeeklyRecap } from "./weekly-recap";

function recap(overrides: Partial<WeeklyRecap> = {}): WeeklyRecap {
  return {
    weekStart: new Date(2026, 0, 12).toISOString(),
    weekEnd: new Date(2026, 0, 19).toISOString(),
    runCount: 4,
    distanceKm: 32.4,
    movingSeconds: 10_800,
    streakWeeks: 1,
    ...overrides,
  };
}

describe("formatWeekRange", () => {
  it("labels the inclusive last day, not the exclusive end bound", () => {
    // weekEnd is Mon Jan 19 exclusive, so the label must end on Sun Jan 18.
    expect(formatWeekRange(recap().weekStart, recap().weekEnd)).toBe("Jan 12 – Jan 18");
  });
});

describe("formatRecapDistance", () => {
  it("uses the one-decimal register the app's other weekly aggregates use", () => {
    expect(formatRecapDistance(32.4)).toBe("32.4");
    expect(formatRecapDistance(32)).toBe("32.0");
    expect(formatRecapDistance(0)).toBe("0.0");
  });
});

describe("formatStreak", () => {
  it("renders a compact week count", () => {
    expect(formatStreak(3)).toBe("3w");
  });
});

describe("recapShareText", () => {
  it("pluralises the run count", () => {
    expect(recapShareText(recap({ runCount: 4 }))).toBe(
      "32.4 km across 4 runs this week. Logged with Stride.",
    );
    expect(recapShareText(recap({ runCount: 1, distanceKm: 5 }))).toBe(
      "5.0 km across 1 run this week. Logged with Stride.",
    );
  });

  it("mentions the streak only once it spans more than one week", () => {
    expect(recapShareText(recap({ streakWeeks: 3 }))).toContain("3 weeks running");
    expect(recapShareText(recap({ streakWeeks: 1 }))).not.toContain("weeks running");
  });
});

describe("recapCardStats", () => {
  it("returns runs, time and streak in render order", () => {
    expect(recapCardStats(recap())).toEqual([
      { label: "Runs", value: "4" },
      { label: "Time", value: "3:00:00" },
      { label: "Streak", value: "1w" },
    ]);
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

    drawRecapCard(canvas, recap());

    expect(canvas.width).toBe(RECAP_CARD_WIDTH);
    expect(canvas.height).toBe(RECAP_CARD_HEIGHT);
  });

  it("paints the week range, headline distance and every stat", () => {
    const { canvas, filled } = stubCanvas();

    drawRecapCard(canvas, recap({ streakWeeks: 3 }));

    expect(filled).toContain("JAN 12 – JAN 18");
    expect(filled).toContain("32.4");
    expect(filled).toContain("KM");
    expect(filled).toContain("RUNS");
    expect(filled).toContain("3w");
    expect(filled).toContain("STRIDE");
  });

  it("does nothing when the canvas has no 2D context", () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => null,
      toBlob: () => {},
    };

    expect(() => drawRecapCard(canvas, recap())).not.toThrow();
    expect(canvas.width).toBe(0);
  });
});
