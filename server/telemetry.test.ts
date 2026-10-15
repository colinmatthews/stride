import { afterEach, describe, expect, it, vi } from "vitest";
import { reportServerEvent } from "./telemetry.js";

afterEach(() => vi.restoreAllMocks());

describe("reportServerEvent", () => {
  it("writes a structured warning the team can search by ref", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    reportServerEvent("user-1", "workout_sync_failed", {
      sync_ref: "SYNC-ABC234",
      error_code: "upload_interrupted",
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warn.mock.calls[0][0] as string)).toEqual({
      level: "warn",
      event: "workout_sync_failed",
      userId: "user-1",
      sync_ref: "SYNC-ABC234",
      error_code: "upload_interrupted",
    });
  });

  it("logs recoveries at info level", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    reportServerEvent("user-1", "workout_sync_recovered", { sync_ref: "SYNC-ABC234" }, "info");

    expect(info).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });
});
