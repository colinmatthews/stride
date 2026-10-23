import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({
  constructor: vi.fn(),
  capture: vi.fn(),
}));

vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor(token: string, options: unknown) {
      posthog.constructor(token, options);
    }
    capture = posthog.capture;
  },
}));

const { captureServerEvent, resetAnalyticsForTests } = await import("./analytics.js");

const TOKEN_VARS = ["POSTHOG_PROJECT_TOKEN", "VITE_PUBLIC_POSTHOG_PROJECT_TOKEN", "POSTHOG_HOST"];
const saved = Object.fromEntries(TOKEN_VARS.map((name) => [name, process.env[name]]));

beforeEach(() => {
  for (const name of TOKEN_VARS) delete process.env[name];
  posthog.constructor.mockClear();
  posthog.capture.mockReset();
  resetAnalyticsForTests();
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("captureServerEvent", () => {
  it("does nothing without a project token", () => {
    captureServerEvent("a@example.com", "activity_corrected", { kept_version: "corrected" });
    expect(posthog.constructor).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("sends the event with the user's distinct id", () => {
    process.env.POSTHOG_PROJECT_TOKEN = "test-token";
    captureServerEvent("a@example.com", "activity_corrected", { kept_version: "corrected" });
    expect(posthog.capture).toHaveBeenCalledWith({
      distinctId: "a@example.com",
      event: "activity_corrected",
      properties: { kept_version: "corrected" },
    });
  });

  it("falls back to the web client's token and its US ingestion host", () => {
    process.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN = "web-test-token";
    captureServerEvent("a@example.com", "activity_corrected", {});
    expect(posthog.constructor).toHaveBeenCalledWith(
      "web-test-token",
      expect.objectContaining({ host: "https://us.i.posthog.com" }),
    );
  });

  it("uses POSTHOG_HOST when set", () => {
    process.env.POSTHOG_PROJECT_TOKEN = "test-token";
    process.env.POSTHOG_HOST = "https://eu.i.posthog.com";
    captureServerEvent("a@example.com", "activity_corrected", {});
    expect(posthog.constructor).toHaveBeenCalledWith(
      "test-token",
      expect.objectContaining({ host: "https://eu.i.posthog.com" }),
    );
  });

  it("never throws when PostHog fails", () => {
    process.env.POSTHOG_PROJECT_TOKEN = "test-token";
    posthog.capture.mockImplementation(() => {
      throw new Error("network down");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => captureServerEvent("a@example.com", "activity_corrected", {})).not.toThrow();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
