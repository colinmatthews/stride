import { describe, expect, it } from "vitest";
import type { ActivityElevation, ElevationPreview } from "./api";
import {
  elevationEventBase,
  previewedEventProperties,
  previewOutcome,
} from "./elevation-analytics";
import { formatKm } from "./utils";

function preview(overrides: Partial<ElevationPreview> = {}): ElevationPreview {
  return {
    method: "terrain",
    original: [],
    corrected: [],
    spikes: [],
    flatRegion: { fromKm: 4.84, toKm: 9.6 },
    elevationBeforeM: 152,
    elevationAfterM: 799,
    deltaPct: 426,
    direction: "up",
    errorType: "flatline",
    spikeCount: 0,
    changed: true,
    blockedReason: null,
    device: null,
    elevationSource: "barometric",
    ...overrides,
  };
}

describe("previewOutcome", () => {
  it("is compare when a correction is offered", () => {
    expect(previewOutcome(preview())).toBe("compare");
  });

  it("is accurate when nothing changes", () => {
    expect(previewOutcome(preview({ changed: false, direction: "none" }))).toBe("accurate");
  });

  it("is blocked when a problem can't be fixed, even though nothing changes", () => {
    expect(previewOutcome(preview({ changed: false, blockedReason: "needs_gps" }))).toBe("blocked");
  });
});

describe("previewedEventProperties", () => {
  it("describes what the preview found", () => {
    expect(previewedEventProperties("prompted", { preview: preview() })).toEqual({
      trigger: "prompted",
      outcome: "compare",
      method: "terrain",
      error_type: "flatline",
      correction_direction: "up",
      blocked_reason: null,
      elevation_before_m: 152,
      elevation_after_m: 799,
      elevation_delta_pct: 426,
      spike_count: 0,
      flatline_from_km: 4.84,
    });
  });

  it("records the reason when the preview fails", () => {
    expect(previewedEventProperties("self", { errorCode: "terrain_unavailable" })).toEqual({
      trigger: "self",
      outcome: "error",
      error_code: "terrain_unavailable",
    });
    expect(previewedEventProperties("self", { errorCode: null }).error_code).toBe("unknown");
  });
});

describe("elevationEventBase", () => {
  it("carries the device and the suspected issue", () => {
    const elevation = {
      device: { name: "Garmin Forerunner 965", model: "forerunner_965" },
      elevationSource: "barometric",
      hasGps: true,
      issue: { errorType: "flatline" },
    } as unknown as ActivityElevation;
    expect(elevationEventBase({ id: "act-1", sport: "Run" }, elevation)).toEqual({
      activity_id: "act-1",
      sport: "Run",
      device: "Garmin Forerunner 965",
      device_model: "forerunner_965",
      elevation_source: "barometric",
      has_gps: true,
      suspected_error: "flatline",
    });
  });

  it("works before the elevation data has loaded", () => {
    expect(elevationEventBase({ id: "act-1", sport: "Run" }, null)).toMatchObject({
      device: null,
      has_gps: false,
      suspected_error: null,
    });
  });
});

describe("formatKm", () => {
  it("keeps one decimal near the start and rounds further on", () => {
    expect(formatKm(0.46)).toBe("0.5");
    expect(formatKm(4)).toBe("4");
    expect(formatKm(4.84)).toBe("4.8");
    expect(formatKm(12.6)).toBe("13");
  });
});
