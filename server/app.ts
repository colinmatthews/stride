import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import {
  addComment,
  buildBootstrap,
  createActivity,
  createUser,
  findUserForAuth,
  getActivityById,
  listActivities,
  toggleChallengeEntry,
  toggleClubMembership,
  toggleFollow,
  toggleKudo,
} from "./data.js";
import {
  createSession,
  destroySession,
  hashPassword,
  requireAuth,
  verifyPassword,
} from "./auth.js";
import { createActivityBodySchema } from "./validation.js";

export function createApp() {
  const app = express();
  const clientDistPath = path.resolve(process.cwd(), "dist");
  const clientIndexPath = path.join(clientDistPath, "index.html");

  app.use(express.json());

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.post("/api/auth/register", async (request, response, next) => {
    try {
      const email = String(request.body.email ?? "")
        .trim()
        .toLowerCase();
      const password = String(request.body.password ?? "");
      const name = String(request.body.name ?? "").trim();

      if (!name || !email || password.length < 8) {
        response
          .status(400)
          .json({ error: "Name, email, and an 8 character password are required" });
        return;
      }

      const existing = await findUserForAuth(email);

      if (existing) {
        response.status(409).json({ error: "An account already exists for that email" });
        return;
      }

      const { hash, salt } = await hashPassword(password);
      const user = await createUser({
        email,
        passwordHash: hash,
        passwordSalt: salt,
        name,
      });

      await createSession(user.id, response);
      response.status(201).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/login", async (request, response, next) => {
    try {
      const email = String(request.body.email ?? "")
        .trim()
        .toLowerCase();
      const password = String(request.body.password ?? "");
      const user = await findUserForAuth(email);

      if (!user || !user.password_hash || !user.password_salt) {
        response.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const valid = await verifyPassword(password, user.password_salt, user.password_hash);

      if (!valid) {
        response.status(401).json({ error: "Invalid email or password" });
        return;
      }

      await createSession(user.id, response);
      response.status(200).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/logout", async (request, response, next) => {
    try {
      await destroySession(request, response);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/bootstrap", requireAuth, async (request, response, next) => {
    try {
      response.json(await buildBootstrap(request.userId!));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/activities", requireAuth, async (request, response, next) => {
    try {
      response.json(
        await listActivities(request.userId!, {
          athleteId: request.query.athleteId ? String(request.query.athleteId) : undefined,
          cursor: request.query.cursor ? String(request.query.cursor) : undefined,
          limit: request.query.limit,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/activities/:id", requireAuth, async (request, response, next) => {
    try {
      const activity = await getActivityById(request.userId!, String(request.params.id));

      if (!activity) {
        response.status(404).json({ error: "Activity not found" });
        return;
      }

      response.json(activity);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/activities", requireAuth, async (request, response, next) => {
    try {
      const parsed = createActivityBodySchema.safeParse(request.body);

      if (!parsed.success) {
        response.status(400).json({
          error: "Invalid activity payload",
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const body = parsed.data;
      const activityId = await createActivity({
        userId: request.userId!,
        sport: body.sport,
        title: body.title ?? "",
        description: body.description,
        distanceKm: body.distanceKm ?? 0,
        movingSeconds: body.movingSeconds,
        elevationM: body.elevationM ?? 0,
        avgHr: body.avgHr,
        avgPaceSecPerKm: body.avgPaceSecPerKm,
        avgSpeedKmh: body.avgSpeedKmh,
        routeSeed: body.routeSeed ?? 1,
      });

      const activity = await getActivityById(request.userId!, activityId);

      response.status(201).json(activity);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/activities/:id/kudos", requireAuth, async (request, response, next) => {
    try {
      response.json(await toggleKudo(request.userId!, String(request.params.id)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/activities/:id/comments", requireAuth, async (request, response, next) => {
    try {
      const activityId = String(request.params.id);
      const text = String(request.body.text ?? "").trim();

      if (!text) {
        response.status(400).json({ error: "Comment text is required" });
        return;
      }

      response.status(201).json(await addComment(request.userId!, activityId, text));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/athletes/:id/follow", requireAuth, async (request, response, next) => {
    try {
      response.json(await toggleFollow(request.userId!, String(request.params.id)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/clubs/:id/join", requireAuth, async (request, response, next) => {
    try {
      response.json(await toggleClubMembership(request.userId!, String(request.params.id)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/challenges/:id/join", requireAuth, async (request, response, next) => {
    try {
      response.json(await toggleChallengeEntry(request.userId!, String(request.params.id)));
    } catch (error) {
      next(error);
    }
  });

  if (existsSync(clientIndexPath)) {
    app.use("/api", (_request, response) => {
      response.status(404).json({ error: "Not found" });
    });

    app.use(express.static(clientDistPath));

    app.get("/{*splat}", (_request, response) => {
      response.sendFile("index.html", { root: clientDistPath });
    });
  }

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error(error);
      response.status(500).json({ error: "Internal server error" });
    },
  );

  return app;
}
