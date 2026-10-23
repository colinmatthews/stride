import { describe, expect, it } from "vitest";

// Guards against routes being dropped by accident. Building the app doesn't
// open a database connection, so a placeholder DB_URL is enough.
process.env.DB_URL ??= "postgresql://placeholder@localhost:5432/placeholder";

describe("createApp", () => {
  it("registers every API route", async () => {
    const { createApp } = await import("./app.js");
    const app = createApp();
    const routes = (
      app.router.stack as Array<{ route?: { path: string; methods: Record<string, boolean> } }>
    )
      .filter((layer) => layer.route)
      .flatMap((layer) =>
        Object.keys(layer.route!.methods).map(
          (method) => `${method.toUpperCase()} ${layer.route!.path}`,
        ),
      );

    expect(routes).toEqual(
      expect.arrayContaining([
        "GET /api/health",
        "POST /api/auth/register",
        "POST /api/auth/login",
        "POST /api/auth/logout",
        "GET /api/bootstrap",
        "POST /api/syncs",
        "POST /api/syncs/:id/retry",
        "GET /api/activities",
        "GET /api/activities/:id",
        "POST /api/activities",
        "POST /api/activities/:id/kudos",
        "POST /api/activities/:id/comments",
        "POST /api/athletes/:id/follow",
        "POST /api/clubs/:id/join",
        "POST /api/challenges/:id/join",
      ]),
    );
  });
});
