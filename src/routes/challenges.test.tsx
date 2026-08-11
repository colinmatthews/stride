import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "@/routeTree.gen";
import { clearAppData, initializeAppData, type AppData, type Challenge } from "@/lib/mock-data";
import { toggleChallengeJoin } from "@/lib/api";
import { toast } from "sonner";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    toggleChallengeJoin: vi.fn(),
    logout: vi.fn(),
  };
});

const captureMock = vi.fn();
const captureExceptionMock = vi.fn();

vi.mock("@posthog/react", () => ({
  usePostHog: () => ({ capture: captureMock, captureException: captureExceptionMock }),
  PostHogProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

function challenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: "climb",
    name: "Climb 5,000m",
    sport: "Ride",
    goalKm: 5000,
    myProgressKm: 0,
    participants: 92450,
    endsAt: "2026-04-30",
    badge: "CLIMB",
    joined: false,
    ...overrides,
  };
}

function seed(challenges: Challenge[]) {
  const data: AppData = {
    me: {
      id: "me",
      name: "Me",
      handle: "me",
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
    challenges,
  };
  initializeAppData(data);
}

async function renderChallenges() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/challenges"] }),
    context: {},
  });
  const view = render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Challenges" });
  return view;
}

describe("Challenges quick join", () => {
  beforeEach(() => {
    vi.mocked(toggleChallengeJoin).mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
    captureMock.mockReset();
    captureExceptionMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    clearAppData();
  });

  it("shows a one-tap quick-join CTA with the challenge's default goal, no setup step", async () => {
    seed([challenge()]);
    await renderChallenges();

    expect(screen.getByRole("button", { name: /quick join/i })).toBeInTheDocument();
    expect(screen.getByText(/default goal auto-applied · no setup/i)).toBeInTheDocument();
    expect(screen.queryByText(/^join challenge$/i)).not.toBeInTheDocument();
  });

  it("joins with the challenge's default goal on a single tap and confirms via toast + analytics", async () => {
    seed([challenge()]);
    vi.mocked(toggleChallengeJoin).mockResolvedValue({ joined: true, participants: 92451 });
    const user = userEvent.setup();
    await renderChallenges();

    await user.click(screen.getByRole("button", { name: /quick join/i }));

    expect(toggleChallengeJoin).toHaveBeenCalledWith("climb");
    await screen.findByRole("button", { name: /leave challenge/i });
    expect(screen.getByText("92,451 athletes")).toBeInTheDocument();

    expect(toast.success).toHaveBeenCalledWith(
      "Joined Climb 5,000m",
      expect.objectContaining({
        description: expect.stringContaining("Goal set to 5000 m"),
      }),
    );

    expect(captureMock).toHaveBeenCalledWith(
      "challenge_joined",
      expect.objectContaining({
        challenge_id: "climb",
        goal_km: 5000,
        join_method: "quick",
      }),
    );
  });

  it("disables the button and shows a pending state while the join request is in flight", async () => {
    seed([challenge()]);
    let resolveJoin!: (value: { joined: boolean; participants: number }) => void;
    vi.mocked(toggleChallengeJoin).mockReturnValue(
      new Promise((resolve) => {
        resolveJoin = resolve;
      }),
    );
    const user = userEvent.setup();
    await renderChallenges();

    await user.click(screen.getByRole("button", { name: /quick join/i }));

    const button = await screen.findByRole("button", { name: /joining/i });
    expect(button).toBeDisabled();

    resolveJoin({ joined: true, participants: 92451 });
    await screen.findByRole("button", { name: /leave challenge/i });
    expect(screen.queryByRole("button", { name: /joining/i })).not.toBeInTheDocument();
  });

  it("surfaces an error toast and leaves the card unjoined if the join request fails", async () => {
    seed([challenge()]);
    vi.mocked(toggleChallengeJoin).mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    await renderChallenges();

    await user.click(screen.getByRole("button", { name: /quick join/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't update challenge. Try again."),
    );
    expect(captureExceptionMock).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /quick join/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /leave challenge/i })).not.toBeInTheDocument();
  });
});
