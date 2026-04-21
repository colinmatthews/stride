import express from "express";
import {
  addComment,
  buildBootstrap,
  createActivity,
  createUser,
  findUserForAuth,
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

export function createApp() {
  const app = express();

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

  app.post("/api/activities", requireAuth, async (request, response, next) => {
    try {
      const activityId = await createActivity({
        userId: request.userId!,
        sport: request.body.sport,
        title: String(request.body.title ?? ""),
        description: request.body.description ? String(request.body.description) : undefined,
        distanceKm: Number(request.body.distanceKm ?? 0),
        movingSeconds: Number(request.body.movingSeconds ?? 0),
        elevationM: Number(request.body.elevationM ?? 0),
        avgHr: request.body.avgHr ? Number(request.body.avgHr) : undefined,
        avgPaceSecPerKm: request.body.avgPaceSecPerKm
          ? Number(request.body.avgPaceSecPerKm)
          : undefined,
        avgSpeedKmh: request.body.avgSpeedKmh ? Number(request.body.avgSpeedKmh) : undefined,
        routeSeed: Number(request.body.routeSeed ?? 1),
      });

      const bootstrap = await buildBootstrap(request.userId!);
      const activity = bootstrap.activities.find(
        (entry: (typeof bootstrap.activities)[number]) => entry.id === activityId,
      );

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
