import {
  ACTIVITIES,
  ATHLETES,
  CHALLENGES,
  CLUBS,
  ME,
  mergeActivities,
  type Activity,
  type AppData,
} from "./mock-data";

class ApiError extends Error {
  status: number;
  /** Machine-readable reason, when the server sends one (e.g. "terrain_unavailable"). */
  code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(payload?.error ?? "Request failed", response.status, payload?.code ?? null);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function fetchBootstrap() {
  return apiFetch<AppData>("/api/bootstrap");
}

export async function fetchActivities(
  options: {
    athleteId?: string;
    cursor?: string;
    limit?: number;
  } = {},
) {
  const params = new URLSearchParams();

  if (options.athleteId) params.set("athleteId", options.athleteId);
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.limit) params.set("limit", String(options.limit));

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const page = await apiFetch<{ activities: Activity[]; nextCursor?: string }>(
    `/api/activities${suffix}`,
  );

  mergeActivities(page.activities);
  return page;
}

export async function fetchActivity(activityId: string) {
  const activity = await apiFetch<Activity>(`/api/activities/${activityId}`);

  mergeActivities([activity]);
  return activity;
}

export async function login(email: string, password: string) {
  await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(name: string, email: string, password: string) {
  await apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}

export async function logout() {
  await apiFetch("/api/auth/logout", {
    method: "POST",
  });
}

export async function saveActivity(payload: {
  sport: Activity["sport"];
  title: string;
  description?: string;
  distanceKm: number;
  movingSeconds: number;
  elevationM: number;
  avgHr?: number;
  avgPaceSecPerKm?: number;
  avgSpeedKmh?: number;
  routeSeed: number;
}) {
  const activity = await apiFetch<Activity>("/api/activities", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  mergeActivities([activity]);
  return activity;
}

export async function toggleActivityKudo(activityId: string) {
  const payload = await apiFetch<{ kudos: number; kudoed: boolean }>(
    `/api/activities/${activityId}/kudos`,
    {
      method: "POST",
    },
  );
  const activity = ACTIVITIES.find((entry) => entry.id === activityId);

  if (activity) {
    activity.kudos = payload.kudos;
    activity.kudoed = payload.kudoed;
  }

  return payload;
}

export async function addActivityComment(activityId: string, text: string) {
  const comment = await apiFetch<{ id: string; athleteId: string; text: string }>(
    `/api/activities/${activityId}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ text }),
    },
  );
  const activity = ACTIVITIES.find((entry) => entry.id === activityId);

  if (activity) {
    activity.comments.push(comment);
  }

  return comment;
}

export async function toggleAthleteFollow(athleteId: string) {
  const payload = await apiFetch<{ following: boolean; followers: number; meFollowing: number }>(
    `/api/athletes/${athleteId}/follow`,
    {
      method: "POST",
    },
  );
  const athlete = ATHLETES.find((entry) => entry.id === athleteId);

  if (athlete) {
    athlete.isFollowing = payload.following;
    athlete.followers = payload.followers;
  }

  ME.following = payload.meFollowing;
  return payload;
}

export async function toggleClubJoin(clubId: string) {
  const payload = await apiFetch<{ joined: boolean; members: number }>(
    `/api/clubs/${clubId}/join`,
    {
      method: "POST",
    },
  );
  const club = CLUBS.find((entry) => entry.id === clubId);

  if (club) {
    club.joined = payload.joined;
    club.members = payload.members;
  }

  return payload;
}

export async function toggleChallengeJoin(challengeId: string) {
  const payload = await apiFetch<{ joined: boolean; participants: number }>(
    `/api/challenges/${challengeId}/join`,
    {
      method: "POST",
    },
  );
  const challenge = CHALLENGES.find((entry) => entry.id === challengeId);

  if (challenge) {
    challenge.joined = payload.joined;
    challenge.participants = payload.participants;
  }

  return payload;
}

export type ElevationPoint = { km: number; elev: number };

export type ElevationDevice = {
  name: string;
  manufacturer?: string;
  model?: string;
  firmware?: string;
};

export type KeptElevationVersion = "corrected" | "original";
export type ElevationCorrectionMethod = "terrain" | "cleanup";
export type ElevationDirection = "up" | "down" | "none";
export type ElevationErrorType = "flatline" | "spikes" | "other" | "none";
export type ElevationFixTrigger = "self" | "prompted";
export type FlatRegion = { fromKm: number; toKm: number };

export type ActivityElevation = {
  elevationM: number;
  elevationSource: "barometric" | "gps" | null;
  device: ElevationDevice | null;
  samples: ElevationPoint[];
  hasGps: boolean;
  correction: {
    keptVersion: KeptElevationVersion;
    method: ElevationCorrectionMethod;
    direction: ElevationDirection;
    originalElevationM: number;
    correctedElevationM: number;
  } | null;
  canCorrect: boolean;
  /** A likely problem spotted from the recording alone (owner only, before any review). */
  issue: {
    errorType: "flatline" | "spikes";
    flatRegion: FlatRegion | null;
    spikeCount: number;
  } | null;
};

export type ElevationPreview = {
  method: ElevationCorrectionMethod;
  original: ElevationPoint[];
  corrected: ElevationPoint[];
  spikes: ElevationPoint[];
  flatRegion: FlatRegion | null;
  elevationBeforeM: number;
  elevationAfterM: number;
  deltaPct: number;
  direction: ElevationDirection;
  errorType: ElevationErrorType;
  spikeCount: number;
  changed: boolean;
  /** Set when a problem was found but can't be corrected right now. */
  blockedReason: "needs_gps" | "terrain_off" | null;
  device: ElevationDevice | null;
  elevationSource: "barometric" | "gps" | null;
};

export async function fetchActivityElevation(activityId: string) {
  return apiFetch<ActivityElevation>(`/api/activities/${activityId}/elevation`);
}

export async function previewElevationCorrection(activityId: string) {
  return apiFetch<ElevationPreview>(`/api/activities/${activityId}/elevation/preview`, {
    method: "POST",
  });
}

export async function saveElevationCorrection(
  activityId: string,
  keptVersion: KeptElevationVersion,
  trigger: ElevationFixTrigger,
) {
  const payload = await apiFetch<{ elevationM: number; keptVersion: KeptElevationVersion }>(
    `/api/activities/${activityId}/elevation/correction`,
    {
      method: "PUT",
      body: JSON.stringify({ keptVersion, trigger }),
    },
  );
  const activity = ACTIVITIES.find((entry) => entry.id === activityId);

  if (activity) {
    activity.elevationM = payload.elevationM;
  }

  return payload;
}

export { ApiError };
