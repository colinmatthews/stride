import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";
import { pool } from "./db.js";

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}

const scryptAsync = promisify(scrypt);
const SESSION_COOKIE = "stride_session";
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

function parseCookies(header?: string) {
  if (!header) {
    return {};
  }

  return Object.fromEntries(
    header.split(";").map((item) => {
      const [name, ...rest] = item.trim().split("=");
      return [name, decodeURIComponent(rest.join("="))];
    }),
  );
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;

  return {
    salt,
    hash: derived.toString("hex"),
  };
}

export async function verifyPassword(password: string, salt: string, hash: string) {
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");

  if (derived.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(derived, expected);
}

export async function createSession(userId: string, response: Response) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);

  await pool.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, [
    tokenHash,
    userId,
    expiresAt.toISOString(),
  ]);

  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_MS,
  });
}

export async function destroySession(request: Request, response: Response) {
  const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];

  if (token) {
    await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [hashToken(token)]);
  }

  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

async function getSessionUserId(request: Request) {
  if (request.userId) {
    return request.userId;
  }

  const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];

  if (!token) {
    return null;
  }

  const result = await pool.query<{ user_id: string }>(
    `
      SELECT user_id
      FROM sessions
      WHERE token_hash = $1
        AND expires_at > NOW()
      LIMIT 1
    `,
    [hashToken(token)],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  request.userId = row.user_id;
  return row.user_id;
}

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  try {
    const userId = await getSessionUserId(request);

    if (!userId) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }

    request.userId = userId;
    next();
  } catch (error) {
    next(error);
  }
}
