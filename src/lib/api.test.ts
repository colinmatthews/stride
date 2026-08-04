import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, fetchNotificationPreferences, saveNotificationPreferences } from "./api";

function stubFetch(response: { ok: boolean; status: number; body: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: async () => response.body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchNotificationPreferences", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests the settings endpoint and returns the preferences", async () => {
    const payload = { kudos: "instant", follow: "daily", challenge: "off" };
    const fetchMock = stubFetch({ ok: true, status: 200, body: payload });

    const result = await fetchNotificationPreferences();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings/notifications",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(result).toEqual(payload);
  });
});

describe("saveNotificationPreferences", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PUTs only the changed keys and returns the merged result", async () => {
    const payload = { kudos: "off", follow: "instant", challenge: "daily" };
    const fetchMock = stubFetch({ ok: true, status: 200, body: payload });

    const result = await saveNotificationPreferences({ kudos: "off" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings/notifications",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ kudos: "off" }),
      }),
    );
    expect(result).toEqual(payload);
  });

  it("throws an ApiError with the server message on failure", async () => {
    stubFetch({
      ok: false,
      status: 400,
      body: { error: "Invalid frequency for kudos: bogus" },
    });

    await expect(saveNotificationPreferences({ kudos: "bogus" as never })).rejects.toThrow(
      ApiError,
    );
  });
});
