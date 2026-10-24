export const SPORTS = ["Run", "Ride", "Swim", "Hike", "Walk"] as const;

export type Sport = (typeof SPORTS)[number];

export const MAX_DISTANCE_KM = 1000;
export const MAX_MOVING_SECONDS = 7 * 24 * 60 * 60;
export const MAX_TITLE_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_SPEED_KMH = 1000;
export const MAX_ELEVATION_M = 100_000;
/** Largest value a Postgres `integer` column can hold. */
const MAX_INT = 2_147_483_647;

export type ActivityInput = {
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

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isMissing(value: unknown) {
  return value === undefined || value === null || value === "";
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    return Number(value);
  }

  return Number.NaN;
}

function isSport(value: unknown): value is Sport {
  return typeof value === "string" && (SPORTS as readonly string[]).includes(value);
}

export function parseActivityInput(body: unknown): ParseResult<ActivityInput> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Activity details are required" };
  }

  const input = body as Record<string, unknown>;

  if (!isSport(input.sport)) {
    return { ok: false, error: `Sport must be one of ${SPORTS.join(", ")}` };
  }

  const title = typeof input.title === "string" ? input.title.trim() : "";

  if (!title) {
    return { ok: false, error: "Title is required" };
  }

  if (title.length > MAX_TITLE_LENGTH) {
    return { ok: false, error: `Title must be ${MAX_TITLE_LENGTH} characters or fewer` };
  }

  let description: string | undefined;

  if (!isMissing(input.description)) {
    if (typeof input.description !== "string") {
      return { ok: false, error: "Description must be text" };
    }

    description = input.description.trim() || undefined;

    if (description && description.length > MAX_DESCRIPTION_LENGTH) {
      return {
        ok: false,
        error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`,
      };
    }
  }

  // distance_km is stored with two decimal places, so validate what will actually persist.
  const distanceKm = Math.round(toNumber(input.distanceKm) * 100) / 100;

  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > MAX_DISTANCE_KM) {
    return {
      ok: false,
      error: `Distance must be greater than 0 and at most ${MAX_DISTANCE_KM} km`,
    };
  }

  const movingSeconds = toNumber(input.movingSeconds);

  if (
    !Number.isInteger(movingSeconds) ||
    movingSeconds <= 0 ||
    movingSeconds > MAX_MOVING_SECONDS
  ) {
    return {
      ok: false,
      error: "Moving time must be a whole number of seconds between 1 second and 7 days",
    };
  }

  const elevationM = isMissing(input.elevationM) ? 0 : toNumber(input.elevationM);

  if (!Number.isFinite(elevationM) || elevationM < 0 || elevationM > MAX_ELEVATION_M) {
    return {
      ok: false,
      error: `Elevation gain must be between 0 and ${MAX_ELEVATION_M.toLocaleString("en-US")} m`,
    };
  }

  let avgHr: number | undefined;

  if (!isMissing(input.avgHr)) {
    avgHr = toNumber(input.avgHr);

    if (!Number.isInteger(avgHr) || avgHr < 30 || avgHr > 250) {
      return { ok: false, error: "Average heart rate must be a whole number between 30 and 250" };
    }
  }

  let avgPaceSecPerKm: number | undefined;

  if (!isMissing(input.avgPaceSecPerKm)) {
    avgPaceSecPerKm = Math.round(toNumber(input.avgPaceSecPerKm));

    if (!Number.isFinite(avgPaceSecPerKm) || avgPaceSecPerKm <= 0 || avgPaceSecPerKm > MAX_INT) {
      return { ok: false, error: "Average pace must be greater than 0" };
    }
  }

  let avgSpeedKmh: number | undefined;

  if (!isMissing(input.avgSpeedKmh)) {
    avgSpeedKmh = toNumber(input.avgSpeedKmh);

    if (!Number.isFinite(avgSpeedKmh) || avgSpeedKmh <= 0 || avgSpeedKmh > MAX_SPEED_KMH) {
      return {
        ok: false,
        error: `Average speed must be greater than 0 and at most ${MAX_SPEED_KMH} km/h`,
      };
    }
  }

  const routeSeed = isMissing(input.routeSeed) ? 1 : toNumber(input.routeSeed);

  if (!Number.isInteger(routeSeed) || Math.abs(routeSeed) > MAX_INT) {
    return { ok: false, error: "Route seed must be a whole number" };
  }

  return {
    ok: true,
    value: {
      sport: input.sport,
      title,
      description,
      distanceKm,
      movingSeconds,
      elevationM: Math.round(elevationM),
      avgHr,
      avgPaceSecPerKm,
      avgSpeedKmh,
      routeSeed,
    },
  };
}
