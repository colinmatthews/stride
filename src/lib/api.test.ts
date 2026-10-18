import { describe, expect, it } from "vitest";
import { ApiError, isClientError } from "./api";

describe("isClientError", () => {
  it("is true for 4xx responses", () => {
    expect(isClientError(new ApiError("Distance must be positive", 400))).toBe(true);
    expect(isClientError(new ApiError("Challenge has ended", 409))).toBe(true);
  });

  it("is false for server errors and non-API failures", () => {
    expect(isClientError(new ApiError("Request failed", 500))).toBe(false);
    expect(isClientError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isClientError(null)).toBe(false);
  });
});
