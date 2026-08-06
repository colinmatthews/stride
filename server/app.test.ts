import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HabitInputError } from "./habit-logic.js";

vi.mock("./data.js", () => ({
  addComment: vi.fn(),
  buildBootstrap: vi.fn(),
  createActivity: vi.fn(),
  createUser: vi.fn(),
  findUserForAuth: vi.fn(),
  getActivityById: vi.fn(),
  getHabitPlanState: vi.fn(),
  listActivities: vi.fn(),
  saveHabitPlan: vi.fn(),
  scheduleHabitRecovery: vi.fn(),
  toggleChallengeEntry: vi.fn(),
  toggleClubMembership: vi.fn(),
  toggleFollow: vi.fn(),
  toggleKudo: vi.fn(),
}));

vi.mock("./auth.js", () => ({
  createSession: vi.fn(),
  destroySession: vi.fn(),
  hashPassword: vi.fn(),
  requireAuth: (request: { userId?: string }, _response: unknown, next: () => void) => {
    request.userId = "user-1";
    next();
  },
  verifyPassword: vi.fn(),
}));

import { createApp } from "./app.js";
import { getHabitPlanState, saveHabitPlan } from "./data.js";

let server: Server | undefined;

afterEach(async () => {
  vi.clearAllMocks();
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
});

async function request(path: string, init?: RequestInit) {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return fetch(`http://127.0.0.1:${port}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("habit plan API", () => {
  it("passes authenticated ownership and timezone context into plan reads", async () => {
    vi.mocked(getHabitPlanState).mockResolvedValue({ plan: null } as never);

    const response = await request(
      "/api/habit-plan?activityId=activity-1&timeZone=America%2FToronto",
    );

    expect(response.status).toBe(200);
    expect(getHabitPlanState).toHaveBeenCalledWith(
      "user-1",
      "activity-1",
      expect.any(Date),
      "America/Toronto",
    );
  });

  it("passes only the authenticated user id with plan writes", async () => {
    vi.mocked(saveHabitPlan).mockResolvedValue({ plan: {} } as never);

    const response = await request("/api/habit-plan", {
      method: "PUT",
      body: JSON.stringify({
        sourceActivityId: "activity-1",
        weeklyTarget: 3,
        plannedDays: ["tue", "thu", "sat"],
        encouragementFriendId: "friend-1",
        timeZone: "America/Toronto",
        userId: "attacker-controlled",
      }),
    });

    expect(response.status).toBe(200);
    expect(saveHabitPlan).toHaveBeenCalledWith({
      userId: "user-1",
      sourceActivityId: "activity-1",
      weeklyTarget: 3,
      plannedDays: ["tue", "thu", "sat"],
      encouragementFriendId: "friend-1",
      timeZone: "America/Toronto",
    });
  });

  it("returns validation errors as 400 responses", async () => {
    vi.mocked(saveHabitPlan).mockRejectedValue(new HabitInputError("Choose valid days"));

    const response = await request("/api/habit-plan", {
      method: "PUT",
      body: JSON.stringify({ sourceActivityId: "activity-1", weeklyTarget: 3, plannedDays: [] }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Choose valid days" });
  });
});
