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

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
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
    throw new ApiError(payload?.error ?? "Request failed", response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function loadInitialAppData() {
  const [appData, activityPage] = await Promise.all([
    apiFetch<AppData>("/api/app-data"),
    fetchActivities({ feed: true, limit: 40 }),
  ]);

  return {
    ...appData,
    activities: activityPage.activities,
  };
}

export async function fetchActivities(
  options: {
    athleteId?: string;
    cursor?: string;
    feed?: boolean;
    limit?: number;
  } = {},
) {
  const params = new URLSearchParams();

  if (options.athleteId) params.set("athleteId", options.athleteId);
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.feed) params.set("feed", "true");
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

export { ApiError };
