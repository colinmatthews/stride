import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Each db.select(...).from(...).where(...).limit(...) call resolves to the next queued result.
const queuedRows: unknown[][] = [];

vi.mock("./db.js", () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(queuedRows.shift() ?? []),
  };
  return { db: { select: () => chain } };
});

const { requireStaff } = await import("./auth.js");

function run(cookie?: string) {
  const request = { headers: { cookie } } as unknown as Request;
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
  return requireStaff(request, response as unknown as Response, next).then(() => ({
    request,
    response,
    next,
  }));
}

describe("requireStaff", () => {
  beforeEach(() => {
    queuedRows.length = 0;
  });

  it("returns 401 without a session", async () => {
    const { response, next } = await run();
    expect(response.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 for a signed-in athlete who is not staff", async () => {
    queuedRows.push([{ userId: "u1" }], [{ role: "member" }]);
    const { response, next } = await run("stride_session=token");
    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ error: "Staff access required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("lets staff through and records who they are", async () => {
    queuedRows.push([{ userId: "u2" }], [{ role: "staff" }]);
    const { request, response, next } = await run("stride_session=token");
    expect(next).toHaveBeenCalledWith();
    expect(request.userId).toBe("u2");
    expect(response.statusCode).toBe(200);
  });
});
