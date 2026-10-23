import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock("./db.js", () => ({ db: database }));

import { ChallengeEntryError, isChallengeOpen, setChallengeEntry } from "./data.js";

type TransactionOptions = {
  selectResults: unknown[][];
  inserted?: unknown[];
  deleted?: unknown[];
  updated?: unknown[];
};

function transaction({
  selectResults,
  inserted = [],
  deleted = [],
  updated = [],
}: TransactionOptions) {
  const remainingSelects = [...selectResults];

  return {
    select: vi.fn(() => {
      const result = remainingSelects.shift() ?? [];
      const query: Record<string, unknown> = {};
      query.from = vi.fn(() => query);
      query.where = vi.fn(() => query);
      query.limit = vi.fn(async () => result);
      return query;
    }),
    insert: vi.fn(() => {
      const returning = vi.fn(async () => inserted);
      return {
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({ returning })),
        })),
      };
    }),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({ returning: vi.fn(async () => deleted) })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ returning: vi.fn(async () => updated) })),
      })),
    })),
  };
}

function useTransaction(tx: ReturnType<typeof transaction>) {
  database.transaction.mockImplementation(async (callback) => callback(tx));
}

describe("challenge membership data", () => {
  beforeEach(() => {
    database.transaction.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the UTC end of the deadline day", () => {
    expect(isChallengeOpen("2026-08-31", new Date("2026-08-31T23:59:59.999Z"))).toBe(true);
    expect(isChallengeOpen("2026-08-31", new Date("2026-09-01T00:00:00.000Z"))).toBe(false);
  });

  it("rejects a join after the challenge deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T00:00:00.000Z"));
    const tx = transaction({
      selectResults: [[{ participants: 10, endsAt: "2026-08-31" }]],
    });
    useTransaction(tx);

    await expect(
      setChallengeEntry("user-1", "challenge-1", true),
    ).rejects.toMatchObject<ChallengeEntryError>({
      message: "This challenge has ended and can no longer be joined.",
      status: 422,
    });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("returns the current participant count for an idempotent join", async () => {
    const tx = transaction({
      selectResults: [[{ participants: 10, endsAt: "2099-12-31" }], [{ participants: 11 }]],
    });
    useTransaction(tx);

    await expect(setChallengeEntry("user-1", "challenge-1", true)).resolves.toEqual({
      joined: true,
      participants: 11,
    });
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("returns the current participant count for an idempotent leave", async () => {
    const tx = transaction({
      selectResults: [[{ participants: 10, endsAt: "2099-12-31" }], [{ participants: 9 }]],
    });
    useTransaction(tx);

    await expect(setChallengeEntry("user-1", "challenge-1", false)).resolves.toEqual({
      joined: false,
      participants: 9,
    });
    expect(tx.update).not.toHaveBeenCalled();
  });
});
