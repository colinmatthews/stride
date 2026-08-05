const SPORTS = ["Run", "Ride", "Swim", "Hike", "Walk"] as const;

export type Sport = (typeof SPORTS)[number];

export const FIRST_90_WINDOW_DAYS = 90;

export type SyncFailureInput = {
  device: string;
  reason: string;
  failedAt: Date;
  sport: Sport;
  title: string;
  description?: string;
  distanceKm: number;
  movingSeconds: number;
  elevationM: number;
  avgHr?: number;
  avgPaceSecPerKm?: number;
  avgSpeedKmh?: number;
  routeSeed: number;
};

export type ParseResult = { ok: true; value: SyncFailureInput } | { ok: false; error: string };

function isSport(value: unknown): value is Sport {
  return typeof value === "string" && (SPORTS as readonly string[]).includes(value);
}

function finitePositive(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

// Validates the payload a device-sync worker reports when an upload dies
// mid-flight. Everything the rescue flow later turns into an activity must be
// present up front — recovery itself never trusts client-supplied metrics.
export function parseSyncFailureInput(body: unknown): ParseResult {
  const input = (body ?? {}) as Record<string, unknown>;
  const payload = (input.payload ?? {}) as Record<string, unknown>;

  const device = String(input.device ?? "").trim();
  const reason = String(input.reason ?? "").trim();

  if (!device) return { ok: false, error: "device is required" };
  if (!reason) return { ok: false, error: "reason is required" };

  if (!isSport(payload.sport)) {
    return { ok: false, error: "payload.sport must be one of " + SPORTS.join(", ") };
  }

  const title = String(payload.title ?? "").trim();

  if (!title) return { ok: false, error: "payload.title is required" };

  const distanceKm = finitePositive(payload.distanceKm);
  const movingSeconds = finitePositive(payload.movingSeconds);

  if (distanceKm === undefined) return { ok: false, error: "payload.distanceKm must be positive" };
  if (movingSeconds === undefined) {
    return { ok: false, error: "payload.movingSeconds must be positive" };
  }

  const elevationM = Number(payload.elevationM ?? 0);

  if (!Number.isFinite(elevationM) || elevationM < 0) {
    return { ok: false, error: "payload.elevationM must be zero or positive" };
  }

  const failedAt = input.failedAt ? new Date(String(input.failedAt)) : new Date();

  if (Number.isNaN(failedAt.getTime())) {
    return { ok: false, error: "failedAt must be a valid timestamp" };
  }

  return {
    ok: true,
    value: {
      device,
      reason,
      failedAt,
      sport: payload.sport,
      title,
      description: payload.description ? String(payload.description) : undefined,
      distanceKm,
      movingSeconds: Math.floor(movingSeconds),
      elevationM: Math.floor(elevationM),
      avgHr: finitePositive(payload.avgHr),
      avgPaceSecPerKm: finitePositive(payload.avgPaceSecPerKm),
      avgSpeedKmh: finitePositive(payload.avgSpeedKmh),
      routeSeed: Math.floor(finitePositive(payload.routeSeed) ?? 1),
    },
  };
}

// 1-based day count inside the trust-building window ("Day 14 of your first
// 90"), or null once the account is older than the window. The rescue card
// itself is not gated on this — losing data hurts at any account age — only
// the first-90 trust banner is.
export function daysIntoFirst90(createdAt: Date, now: Date = new Date()): number | null {
  const elapsedMs = now.getTime() - createdAt.getTime();

  if (elapsedMs < 0) {
    return 1;
  }

  const day = Math.floor(elapsedMs / 86_400_000) + 1;
  return day <= FIRST_90_WINDOW_DAYS ? day : null;
}
