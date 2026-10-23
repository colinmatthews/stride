import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, joinChallenge, leaveChallenge } from "./api";
import { CHALLENGES, clearAppData, initializeAppData, type AppData } from "./mock-data";

function appData(): AppData {
  return {
    me: {
      id: "me",
      name: "Georgiana",
      handle: "georgiana",
      avatar: "",
      city: "",
      country: "",
      followers: 0,
      following: 0,
      bio: "",
    },
    athletes: [],
    activities: [],
    segments: [],
    clubs: [],
    challenges: [
      {
        id: "ch1",
        name: "August Distance Run",
        sport: "Run",
        metricType: "distance_km",
        goalKm: 100,
        myProgressKm: 20,
        participants: 10,
        endsAt: "2026-08-31",
        badge: "RUN",
        joined: false,
      },
    ],
  };
}

describe("challenge membership API", () => {
  beforeEach(() => initializeAppData(appData()));

  afterEach(() => {
    clearAppData();
    vi.unstubAllGlobals();
  });

  it("joins idempotently through PUT and updates hydrated challenge data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ joined: true, participants: 11 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await joinChallenge("ch1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/challenges/ch1/join",
      expect.objectContaining({ method: "PUT", credentials: "include" }),
    );
    expect(CHALLENGES[0]).toMatchObject({ joined: true, participants: 11 });
  });

  it("leaves through DELETE", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ joined: false, participants: 9 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await leaveChallenge("ch1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/challenges/ch1/join",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(CHALLENGES[0]).toMatchObject({ joined: false, participants: 9 });
  });

  it("surfaces eligibility failures without changing local membership", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "This challenge has ended." }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(joinChallenge("ch1")).rejects.toMatchObject<ApiError>({
      message: "This challenge has ended.",
      status: 422,
    });
    expect(CHALLENGES[0].joined).toBe(false);
  });
});
