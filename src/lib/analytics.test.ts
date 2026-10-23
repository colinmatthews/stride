import { describe, expect, it } from "vitest";
import {
  ACTIVITY_SHARED,
  WEEKLY_RECAP_SHOWN,
  buildActivitySharedEvent,
  buildWeeklyRecapShownEvent,
  type ActivitySharedInput,
} from "./analytics";

function sharedInput(overrides: Partial<ActivitySharedInput> = {}): ActivitySharedInput {
  return {
    surface: "weekly_recap_modal",
    destination: "system_share_sheet",
    ...overrides,
  };
}

describe("buildActivitySharedEvent", () => {
  it("uses the snake_case past-tense name the rest of the taxonomy uses", () => {
    expect(buildActivitySharedEvent(sharedInput()).name).toBe("activity_shared");
    expect(ACTIVITY_SHARED).toBe("activity_shared");
  });

  it("always carries surface and destination — the two properties share rate is read by", () => {
    const { properties } = buildActivitySharedEvent(
      sharedInput({ surface: "activity_detail", destination: "copy_link" }),
    );

    expect(properties.surface).toBe("activity_detail");
    expect(properties.destination).toBe("copy_link");
  });

  it("omits properties that do not apply to the surface", () => {
    const { properties } = buildActivitySharedEvent(
      sharedInput({ surface: "activity_detail", activityId: "act-1", hasImage: false }),
    );

    expect(properties).toEqual({
      surface: "activity_detail",
      destination: "system_share_sheet",
      activity_id: "act-1",
      has_image: false,
    });
    expect("week_start" in properties).toBe(false);
  });

  it("keeps has_image false rather than dropping it as undefined", () => {
    const { properties } = buildActivitySharedEvent(sharedInput({ hasImage: false }));

    expect(properties.has_image).toBe(false);
  });

  it("carries the week context when shared from the recap", () => {
    const { properties } = buildActivitySharedEvent(
      sharedInput({
        weekStart: "2026-01-12T00:00:00.000Z",
        weekRunCount: 4,
        weekDistanceKm: 32.4,
        streakWeeks: 3,
        hasImage: true,
      }),
    );

    expect(properties).toEqual({
      surface: "weekly_recap_modal",
      destination: "system_share_sheet",
      week_start: "2026-01-12T00:00:00.000Z",
      week_run_count: 4,
      week_distance_km: 32.4,
      streak_weeks: 3,
      has_image: true,
    });
  });
});

describe("buildWeeklyRecapShownEvent", () => {
  it("emits the impression event that gives share rate a denominator", () => {
    const event = buildWeeklyRecapShownEvent({
      weekStart: "2026-01-12T00:00:00.000Z",
      weekRunCount: 4,
      weekDistanceKm: 32.4,
      streakWeeks: 1,
      tier: "power_runner",
    });

    expect(event.name).toBe(WEEKLY_RECAP_SHOWN);
    expect(event.properties).toEqual({
      week_start: "2026-01-12T00:00:00.000Z",
      week_run_count: 4,
      week_distance_km: 32.4,
      streak_weeks: 1,
      tier: "power_runner",
    });
  });
});
