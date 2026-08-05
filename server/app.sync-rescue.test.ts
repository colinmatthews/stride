import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./data.js", () => ({
  addComment: vi.fn(),
  buildBootstrap: vi.fn(),
  createActivity: vi.fn(),
  createPendingUpload: vi.fn(),
  createUser: vi.fn(),
  dismissPendingUpload: vi.fn(),
  findUserForAuth: vi.fn(),
  getActivityById: vi.fn(),
  listActivities: vi.fn(),
  recoverPendingUpload: vi.fn(),
  toggleChallengeEntry: vi.fn(),
  toggleClubMembership: vi.fn(),
  toggleFollow: vi.fn(),
  toggleKudo: vi.fn(),
}));

vi.mock("./auth.js", () => ({
  createSession: vi.fn(),
  destroySession: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  requireAuth: vi.fn(
    (
      request: { userId?: string; headers: Record<string, unknown> },
      response: {
        status: (code: number) => { json: (body: unknown) => void };
      },
      next: () => void,
    ) => {
      if (request.headers["x-test-user"]) {
        request.userId = String(request.headers["x-test-user"]);
        next();
        return;
      }

      response.status(401).json({ error: "Authentication required" });
    },
  ),
}));

import { createApp } from "./app.js";
import { createPendingUpload, dismissPendingUpload, recoverPendingUpload } from "./data.js";

const samplePendingUpload = {
  id: "pu-1",
  device: "Garmin Forerunner 265",
  reason: "Connection dropped",
  failedAt: "2026-08-05T12:00:00.000Z",
  status: "pending",
  payload: {
    sport: "Run",
    title: "Tempo intervals",
    distanceKm: 8.42,
    movingSeconds: 2536,
    elevationM: 96,
    routeSeed: 501,
  },
};

const sampleActivity = { id: "act-1", athleteId: "me", title: "Tempo intervals" };

let server: Server;
let baseUrl: string;

function post(path: string, options: { body?: unknown; userId?: string } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.userId ? { "x-test-user": options.userId } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

beforeEach(() => {
  vi.mocked(createPendingUpload).mockReset();
  vi.mocked(recoverPendingUpload).mockReset();
  vi.mocked(dismissPendingUpload).mockReset();
});

describe("POST /api/sync/failures", () => {
  it("requires authentication", async () => {
    const response = await post("/api/sync/failures", { body: {} });

    expect(response.status).toBe(401);
  });

  it("rejects an invalid payload with 400", async () => {
    const response = await post("/api/sync/failures", {
      userId: "user-1",
      body: { device: "Garmin", reason: "Timeout", payload: { sport: "Rowing" } },
    });

    expect(response.status).toBe(400);
    expect(createPendingUpload).not.toHaveBeenCalled();
  });

  it("stores a valid failure for the session user", async () => {
    vi.mocked(createPendingUpload).mockResolvedValue(samplePendingUpload as never);

    const response = await post("/api/sync/failures", {
      userId: "user-1",
      body: {
        device: "Garmin Forerunner 265",
        reason: "Connection dropped",
        payload: {
          sport: "Run",
          title: "Tempo intervals",
          distanceKm: 8.42,
          movingSeconds: 2536,
        },
      },
    });

    expect(response.status).toBe(201);
    expect(createPendingUpload).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ device: "Garmin Forerunner 265", sport: "Run" }),
    );
  });
});

describe("POST /api/sync/failures/:id/recover", () => {
  it("requires authentication", async () => {
    const response = await post("/api/sync/failures/pu-1/recover");

    expect(response.status).toBe(401);
  });

  it("returns 404 when the upload doesn't exist or belongs to someone else", async () => {
    vi.mocked(recoverPendingUpload).mockResolvedValue(null);

    const response = await post("/api/sync/failures/pu-other/recover", { userId: "user-1" });

    expect(response.status).toBe(404);
    expect(recoverPendingUpload).toHaveBeenCalledWith("user-1", "pu-other");
  });

  it("recovers a pending upload into a real activity", async () => {
    vi.mocked(recoverPendingUpload).mockResolvedValue({
      pendingUpload: { ...samplePendingUpload, status: "recovered" },
      activity: sampleActivity,
      alreadyRecovered: false,
    } as never);

    const response = await post("/api/sync/failures/pu-1/recover", { userId: "user-1" });
    const body = (await response.json()) as { activity: { id: string } };

    expect(response.status).toBe(201);
    expect(body.activity.id).toBe("act-1");
  });

  it("is idempotent for an already-recovered upload", async () => {
    vi.mocked(recoverPendingUpload).mockResolvedValue({
      pendingUpload: { ...samplePendingUpload, status: "recovered" },
      activity: sampleActivity,
      alreadyRecovered: true,
    } as never);

    const response = await post("/api/sync/failures/pu-1/recover", { userId: "user-1" });

    expect(response.status).toBe(200);
  });
});

describe("POST /api/sync/failures/:id/dismiss", () => {
  it("returns 404 for an unknown upload", async () => {
    vi.mocked(dismissPendingUpload).mockResolvedValue(null);

    const response = await post("/api/sync/failures/pu-x/dismiss", { userId: "user-1" });

    expect(response.status).toBe(404);
  });

  it("dismisses the session user's pending upload", async () => {
    vi.mocked(dismissPendingUpload).mockResolvedValue({
      ...samplePendingUpload,
      status: "dismissed",
    } as never);

    const response = await post("/api/sync/failures/pu-1/dismiss", { userId: "user-1" });
    const body = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(body.status).toBe("dismissed");
    expect(dismissPendingUpload).toHaveBeenCalledWith("user-1", "pu-1");
  });
});
