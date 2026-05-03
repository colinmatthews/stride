import { randomUUID } from "node:crypto";
import { pool } from "./db.js";
import { USER_AVATARS } from "./seed.js";

type AthleteRow = {
  id: string;
  name: string;
  handle: string;
  avatar_url: string;
  city: string;
  country: string;
  bio: string;
  followers_count: number;
  following_count: number;
};

type ActivityRow = {
  id: string;
  athlete_id: string;
  sport: "Run" | "Ride" | "Swim" | "Hike" | "Walk";
  title: string;
  description: string | null;
  date: string;
  distance_km: string;
  moving_seconds: number;
  elevation_m: number;
  avg_hr: number | null;
  avg_pace_sec_per_km: number | null;
  avg_speed_kmh: string | null;
  kudos: number;
  achievements: number;
  photo: string | null;
  route_seed: number;
};

type SplitRow = {
  activity_id: string;
  km: number;
  pace_sec: number;
  hr: number;
  elev: number;
  position: number;
};

type CommentRow = {
  id: string;
  activity_id: string;
  athlete_id: string;
  text: string;
};

type ActivitySegmentRow = {
  activity_id: string;
  segment_id: string;
  rank: number;
  position: number;
  effort_secs:number;
};

function aliasUserId(id: string, currentUserId: string) {
  return id === currentUserId ? "me" : id;
}

function numberOrUndefined(value: string | number | null) {
  if (value === null) {
    return undefined;
  }

  return Number(value);
}

async function createUniqueHandle(baseHandle: string) {
  const normalized =
    baseHandle
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase()
      .slice(0, 18) || "athlete";
  let candidate = normalized;
  let suffix = 1;

  while (true) {
    const existing = await pool.query(`SELECT 1 FROM users WHERE handle = $1 LIMIT 1`, [candidate]);

    if (existing.rowCount === 0) {
      return candidate;
    }

    suffix += 1;
    candidate = `${normalized}${suffix}`;
  }
}

function pickAvatar(seed: string) {
  const total = seed.split("").reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return USER_AVATARS[total % USER_AVATARS.length];
}

export async function findUserForAuth(email: string) {
  const result = await pool.query<{
    id: string;
    email: string;
    password_hash: string | null;
    password_salt: string | null;
  }>(
    `
      SELECT id, email, password_hash, password_salt
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [email],
  );

  return result.rows[0] ?? null;
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  passwordSalt: string;
  name: string;
}) {
  const id = randomUUID();
  const handle = await createUniqueHandle(input.name || input.email.split("@")[0] || "athlete");
  const avatar = pickAvatar(input.email);

  await pool.query(
    `
      INSERT INTO users (
        id, email, password_hash, password_salt, name, handle, avatar_url, city, country, bio, followers_count, following_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'Toronto', 'CA', 'New to Stride.', 0, 0)
    `,
    [id, input.email, input.passwordHash, input.passwordSalt, input.name, handle, avatar],
  );

  return { id };
}

export async function buildBootstrap(userId: string) {
  const [
    usersResult,
    followsResult,
    activitiesResult,
    commentsResult,
    splitsResult,
    activitySegmentsResult,
    myKudosResult,
    segmentsResult,
    clubsResult,
    clubMembershipsResult,
    challengesResult,
    challengeEntriesResult,
  ] = await Promise.all([
    pool.query<AthleteRow>(
      `
        SELECT id, name, handle, avatar_url, city, country, bio, followers_count, following_count
        FROM users
        ORDER BY created_at ASC
      `,
    ),
    pool.query<{ followed_id: string }>(`SELECT followed_id FROM follows WHERE follower_id = $1`, [
      userId,
    ]),
    pool.query<ActivityRow>(
      `
        SELECT
          id,
          athlete_id,
          sport,
          title,
          description,
          date::text,
          distance_km::text,
          moving_seconds,
          elevation_m,
          avg_hr,
          avg_pace_sec_per_km,
          avg_speed_kmh::text,
          kudos,
          achievements,
          photo,
          route_seed
        FROM activities
        ORDER BY date DESC
      `,
    ),
    pool.query<CommentRow>(
      `
        SELECT id, activity_id, athlete_id, text
        FROM activity_comments
        ORDER BY created_at ASC
      `,
    ),
    pool.query<SplitRow>(
      `
        SELECT activity_id, km, pace_sec, hr, elev, position
        FROM activity_splits
        ORDER BY activity_id, position ASC
      `,
    ),
    pool.query<ActivitySegmentRow>(
      `
        SELECT activity_id, segment_id, rank, position
        FROM activity_segments
        ORDER BY activity_id, position ASC
      `,
    ),
    pool.query<{ activity_id: string }>(
      `SELECT activity_id FROM activity_kudos WHERE user_id = $1`,
      [userId],
    ),
    pool.query<{
      id: string;
      name: string;
      sport: string;
      location: string;
      distance_km: string;
      avg_grade: string;
      elevation_m: number;
      attempts: number;
      athletes: number;
      my_best_sec: number | null;
      kor_sec: number;
      kor_athlete: string;
      route_seed: number;
    }>(
      `
        SELECT
          s.id,
          s.name,
          s.sport,
          s.location,
          s.distance_km::text,
          s.avg_grade::text,
          s.elevation_m,
          s.attempts,
          s.athletes,
          (
            SELECT MIN(ae.effort_seconds)
            FROM activity_segments ae
            JOIN activities a ON a.id = ae.activity_id
            WHERE ae.segment_id = s.id
              AND a.athlete_id = $1
          ) AS my_best_sec,
          s.kor_sec,
          s.kor_athlete,
          s.route_seed
        FROM segments s
        ORDER BY s.name ASC
      `,
      [userId],
    ),
    pool.query<{
      id: string;
      name: string;
      sport: string;
      city: string;
      members: number;
      cover: string;
      description: string;
    }>(`SELECT id, name, sport, city, members, cover, description FROM clubs ORDER BY name ASC`),
    pool.query<{ club_id: string }>(`SELECT club_id FROM club_memberships WHERE user_id = $1`, [
      userId,
    ]),
    pool.query<{
      id: string;
      name: string;
      sport: string;
      goal_km: string;
      participants: number;
      ends_at: string;
      badge: string;
      metric_type: "distance_km" | "elevation_m";
    }>(
      `SELECT id, name, sport, goal_km::text, participants, ends_at::text, badge, metric_type FROM challenges ORDER BY ends_at ASC`,
    ),
    pool.query<{ challenge_id: string }>(
      `SELECT challenge_id FROM challenge_entries WHERE user_id = $1`,
      [userId],
    ),
  ]);

  const followedIds = new Set(
    followsResult.rows.map((row: { followed_id: string }) => row.followed_id),
  );
  const myKudoedActivityIds = new Set(
    myKudosResult.rows.map((row: { activity_id: string }) => row.activity_id),
  );
  const joinedClubIds = new Set(
    clubMembershipsResult.rows.map((row: { club_id: string }) => row.club_id),
  );
  const joinedChallengeIds = new Set(
    challengeEntriesResult.rows.map((row: { challenge_id: string }) => row.challenge_id),
  );

  const athletes = usersResult.rows.map((row: AthleteRow) => ({
    id: aliasUserId(row.id, userId),
    name: row.name,
    handle: row.handle,
    avatar: row.avatar_url,
    city: row.city,
    country: row.country,
    followers: row.followers_count,
    following: row.following_count,
    bio: row.bio,
    isFollowing: row.id !== userId ? followedIds.has(row.id) : false,
  }));

  const me = athletes.find((athlete: (typeof athletes)[number]) => athlete.id === "me");

  if (!me) {
    throw new Error("Authenticated user not found");
  }

  const commentsByActivity = new Map<
    string,
    Array<{ id: string; athleteId: string; text: string }>
  >();
  for (const row of commentsResult.rows) {
    const existing = commentsByActivity.get(row.activity_id) ?? [];
    existing.push({
      id: row.id,
      athleteId: aliasUserId(row.athlete_id, userId),
      text: row.text,
    });
    commentsByActivity.set(row.activity_id, existing);
  }

  const splitsByActivity = new Map<
    string,
    Array<{ km: number; paceSec: number; hr: number; elev: number }>
  >();
  for (const row of splitsResult.rows) {
    const existing = splitsByActivity.get(row.activity_id) ?? [];
    existing.push({
      km: row.km,
      paceSec: row.pace_sec,
      hr: row.hr,
      elev: row.elev,
    });
    splitsByActivity.set(row.activity_id, existing);
  }

  const segmentEffortsByActivity = new Map<string, Array<{ id: string; rank: number }>>();
  for (const row of activitySegmentsResult.rows) {
    const existing = segmentEffortsByActivity.get(row.activity_id) ?? [];
    existing.push({
      id: row.segment_id,
      rank: row.rank,
    });
    segmentEffortsByActivity.set(row.activity_id, existing);
  }

  const activities = activitiesResult.rows.map((row: ActivityRow) => ({
    id: row.id,
    athleteId: aliasUserId(row.athlete_id, userId),
    sport: row.sport,
    title: row.title,
    description: row.description ?? undefined,
    date: row.date,
    distanceKm: Number(row.distance_km),
    movingSeconds: row.moving_seconds,
    elevationM: row.elevation_m,
    avgHr: row.avg_hr ?? undefined,
    avgPaceSecPerKm: row.avg_pace_sec_per_km ?? undefined,
    avgSpeedKmh: numberOrUndefined(row.avg_speed_kmh),
    kudos: row.kudos,
    comments: commentsByActivity.get(row.id) ?? [],
    achievements: row.achievements,
    photo: row.photo ?? undefined,
    routeSeed: row.route_seed,
    splits: splitsByActivity.get(row.id),
    segments: segmentEffortsByActivity.get(row.id),
    kudoed: myKudoedActivityIds.has(row.id),
  }));

  const myActivities = activitiesResult.rows.filter(
    (row: ActivityRow) => row.athlete_id === userId,
  );
  const distanceBySport = new Map<string, number>();
  let totalElevation = 0;

  for (const row of myActivities) {
    distanceBySport.set(row.sport, (distanceBySport.get(row.sport) ?? 0) + Number(row.distance_km));
    totalElevation += row.elevation_m;
  }

  const segments = segmentsResult.rows.map((row: (typeof segmentsResult.rows)[number]) => ({
    id: row.id,
    name: row.name,
    sport: row.sport,
    location: row.location,
    distanceKm: Number(row.distance_km),
    avgGrade: Number(row.avg_grade),
    elevationM: row.elevation_m,
    attempts: row.attempts,
    athletes: row.athletes,
    myBestSec: row.my_best_sec ?? undefined,
    korSec: row.kor_sec,
    korAthlete: row.kor_athlete,
    routeSeed: row.route_seed,
  }));

  const clubs = clubsResult.rows.map(
    (row: {
      id: string;
      name: string;
      sport: string;
      city: string;
      members: number;
      cover: string;
      description: string;
    }) => ({
      id: row.id,
      name: row.name,
      sport: row.sport,
      city: row.city,
      members: row.members,
      cover: row.cover,
      description: row.description,
      joined: joinedClubIds.has(row.id),
    }),
  );

  const challenges = challengesResult.rows.map((row: (typeof challengesResult.rows)[number]) => ({
    id: row.id,
    name: row.name,
    sport: row.sport,
    goalKm: Number(row.goal_km),
    myProgressKm:
      row.metric_type === "elevation_m"
        ? totalElevation
        : Number((distanceBySport.get(row.sport) ?? 0).toFixed(1)),
    participants: row.participants,
    endsAt: row.ends_at,
    badge: row.badge,
    joined: joinedChallengeIds.has(row.id),
  }));

  return {
    me,
    athletes: [me, ...athletes.filter((athlete: (typeof athletes)[number]) => athlete.id !== "me")],
    activities,
    segments,
    clubs,
    challenges,
  };
}

export async function createActivity(input: {
  userId: string;
  sport: "Run" | "Ride" | "Swim" | "Hike" | "Walk";
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
  const id = `act-${randomUUID()}`;

  await pool.query(
    `
      INSERT INTO activities (
        id, athlete_id, sport, title, description, date, distance_km, moving_seconds, elevation_m,
        avg_hr, avg_pace_sec_per_km, avg_speed_kmh, kudos, achievements, photo, route_seed
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11, 0, 0, NULL, $12)
    `,
    [
      id,
      input.userId,
      input.sport,
      input.title,
      input.description ?? null,
      input.distanceKm,
      input.movingSeconds,
      input.elevationM,
      input.avgHr ?? null,
      input.avgPaceSecPerKm ?? null,
      input.avgSpeedKmh ?? null,
      input.routeSeed,
    ],
  );

  return id;
}

export async function toggleKudo(userId: string, activityId: string) {
  const existing = await pool.query(
    `SELECT 1 FROM activity_kudos WHERE user_id = $1 AND activity_id = $2`,
    [userId, activityId],
  );

  if (existing.rowCount) {
    await pool.query(`DELETE FROM activity_kudos WHERE user_id = $1 AND activity_id = $2`, [
      userId,
      activityId,
    ]);
    await pool.query(`UPDATE activities SET kudos = GREATEST(kudos - 1, 0) WHERE id = $1`, [
      activityId,
    ]);
  } else {
    await pool.query(`INSERT INTO activity_kudos (user_id, activity_id) VALUES ($1, $2)`, [
      userId,
      activityId,
    ]);
    await pool.query(`UPDATE activities SET kudos = kudos + 1 WHERE id = $1`, [activityId]);
  }

  const activity = await pool.query<{ kudos: number }>(
    `SELECT kudos FROM activities WHERE id = $1`,
    [activityId],
  );

  if (!activity.rows[0]) {
    throw new Error("Activity not found");
  }

  return {
    kudos: activity.rows[0].kudos,
    kudoed: existing.rowCount === 0,
  };
}

export async function addComment(userId: string, activityId: string, text: string) {
  const commentId = `comment-${randomUUID()}`;

  await pool.query(
    `
      INSERT INTO activity_comments (id, activity_id, athlete_id, text)
      VALUES ($1, $2, $3, $4)
    `,
    [commentId, activityId, userId, text],
  );

  return {
    id: commentId,
    athleteId: "me",
    text,
  };
}

export async function toggleFollow(userId: string, athleteId: string) {
  if (userId === athleteId) {
    throw new Error("Cannot follow yourself");
  }

  const existing = await pool.query(
    `SELECT 1 FROM follows WHERE follower_id = $1 AND followed_id = $2`,
    [userId, athleteId],
  );

  if (existing.rowCount) {
    await pool.query(`DELETE FROM follows WHERE follower_id = $1 AND followed_id = $2`, [
      userId,
      athleteId,
    ]);
    await pool.query(
      `UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE id = $1`,
      [userId],
    );
    await pool.query(
      `UPDATE users SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = $1`,
      [athleteId],
    );
  } else {
    await pool.query(`INSERT INTO follows (follower_id, followed_id) VALUES ($1, $2)`, [
      userId,
      athleteId,
    ]);
    await pool.query(`UPDATE users SET following_count = following_count + 1 WHERE id = $1`, [
      userId,
    ]);
    await pool.query(`UPDATE users SET followers_count = followers_count + 1 WHERE id = $1`, [
      athleteId,
    ]);
  }

  const [target, current] = await Promise.all([
    pool.query<{ followers_count: number }>(`SELECT followers_count FROM users WHERE id = $1`, [
      athleteId,
    ]),
    pool.query<{ following_count: number }>(`SELECT following_count FROM users WHERE id = $1`, [
      userId,
    ]),
  ]);

  return {
    following: existing.rowCount === 0,
    followers: target.rows[0]?.followers_count ?? 0,
    meFollowing: current.rows[0]?.following_count ?? 0,
  };
}

export async function toggleClubMembership(userId: string, clubId: string) {
  const existing = await pool.query(
    `SELECT 1 FROM club_memberships WHERE user_id = $1 AND club_id = $2`,
    [userId, clubId],
  );

  if (existing.rowCount) {
    await pool.query(`DELETE FROM club_memberships WHERE user_id = $1 AND club_id = $2`, [
      userId,
      clubId,
    ]);
    await pool.query(`UPDATE clubs SET members = GREATEST(members - 1, 0) WHERE id = $1`, [clubId]);
  } else {
    await pool.query(`INSERT INTO club_memberships (user_id, club_id) VALUES ($1, $2)`, [
      userId,
      clubId,
    ]);
    await pool.query(`UPDATE clubs SET members = members + 1 WHERE id = $1`, [clubId]);
  }

  const club = await pool.query<{ members: number }>(`SELECT members FROM clubs WHERE id = $1`, [
    clubId,
  ]);

  return {
    joined: existing.rowCount === 0,
    members: club.rows[0]?.members ?? 0,
  };
}

export async function toggleChallengeEntry(userId: string, challengeId: string) {
  const existing = await pool.query(
    `SELECT 1 FROM challenge_entries WHERE user_id = $1 AND challenge_id = $2`,
    [userId, challengeId],
  );

  if (existing.rowCount) {
    await pool.query(`DELETE FROM challenge_entries WHERE user_id = $1 AND challenge_id = $2`, [
      userId,
      challengeId,
    ]);
    await pool.query(
      `UPDATE challenges SET participants = GREATEST(participants - 1, 0) WHERE id = $1`,
      [challengeId],
    );
  } else {
    await pool.query(`INSERT INTO challenge_entries (user_id, challenge_id) VALUES ($1, $2)`, [
      userId,
      challengeId,
    ]);
    await pool.query(`UPDATE challenges SET participants = participants + 1 WHERE id = $1`, [
      challengeId,
    ]);
  }

  const challenge = await pool.query<{ participants: number }>(
    `SELECT participants FROM challenges WHERE id = $1`,
    [challengeId],
  );

  return {
    joined: existing.rowCount === 0,
    participants: challenge.rows[0]?.participants ?? 0,
  };
}
