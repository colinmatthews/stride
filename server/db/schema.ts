import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  passwordSalt: text("password_salt"),
  name: text("name").notNull(),
  handle: text("handle").notNull().unique(),
  avatarUrl: text("avatar_url").notNull(),
  city: text("city").notNull(),
  country: text("country").notNull(),
  bio: text("bio").notNull(),
  followersCount: integer("followers_count").notNull().default(0),
  followingCount: integer("following_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const follows = pgTable(
  "follows",
  {
    followerId: text("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followedId: text("followed_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.followerId, table.followedId] }),
  }),
);

export const activities = pgTable("activities", {
  id: text("id").primaryKey(),
  athleteId: text("athlete_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sport: text("sport").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  date: timestamp("date", { withTimezone: true }).notNull(),
  distanceKm: numeric("distance_km", { precision: 10, scale: 2 }).notNull(),
  movingSeconds: integer("moving_seconds").notNull(),
  elevationM: integer("elevation_m").notNull(),
  avgHr: integer("avg_hr"),
  avgPaceSecPerKm: integer("avg_pace_sec_per_km"),
  avgSpeedKmh: numeric("avg_speed_kmh", { precision: 10, scale: 1 }),
  kudos: integer("kudos").notNull().default(0),
  achievements: integer("achievements").notNull().default(0),
  photo: text("photo"),
  routeSeed: integer("route_seed").notNull(),
});

export const activityComments = pgTable("activity_comments", {
  id: text("id").primaryKey(),
  activityId: text("activity_id")
    .notNull()
    .references(() => activities.id, { onDelete: "cascade" }),
  athleteId: text("athlete_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activitySplits = pgTable(
  "activity_splits",
  {
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    km: integer("km").notNull(),
    paceSec: integer("pace_sec").notNull(),
    hr: integer("hr").notNull(),
    elev: integer("elev").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.activityId, table.position] }),
  }),
);

export const segments = pgTable("segments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sport: text("sport").notNull(),
  location: text("location").notNull(),
  distanceKm: numeric("distance_km", { precision: 10, scale: 2 }).notNull(),
  avgGrade: numeric("avg_grade", { precision: 10, scale: 2 }).notNull(),
  elevationM: integer("elevation_m").notNull(),
  attempts: integer("attempts").notNull(),
  athletes: integer("athletes").notNull(),
  korSec: integer("kor_sec").notNull(),
  korAthlete: text("kor_athlete").notNull(),
  routeSeed: integer("route_seed").notNull(),
});

export const activitySegments = pgTable(
  "activity_segments",
  {
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    segmentId: text("segment_id")
      .notNull()
      .references(() => segments.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    effortSeconds: integer("effort_seconds").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.activityId, table.position] }),
  }),
);

export const clubs = pgTable("clubs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sport: text("sport").notNull(),
  city: text("city").notNull(),
  members: integer("members").notNull(),
  cover: text("cover").notNull(),
  description: text("description").notNull(),
});

export const clubMemberships = pgTable(
  "club_memberships",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clubId: text("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.clubId] }),
  }),
);

/**
 * The template a recurring challenge is minted from. Rows here are the only
 * thing a human ever writes; the engine turns them into a fresh edition every
 * month without anyone in the loop.
 */
export const challengeSeries = pgTable("challenge_series", {
  id: text("id").primaryKey(),
  sport: text("sport").notNull(),
  tier: text("tier").notNull(),
  label: text("label").notNull(),
  badge: text("badge").notNull(),
  metric: text("metric").notNull(),
  goalMin: numeric("goal_min", { precision: 10, scale: 2 }).notNull(),
  goalMax: numeric("goal_max", { precision: 10, scale: 2 }).notNull(),
  goalStep: numeric("goal_step", { precision: 10, scale: 2 }).notNull(),
  blurb: text("blurb").notNull(),
  active: boolean("active").notNull().default(true),
});

/**
 * One month's run of a challenge. Editions are immutable once minted — an
 * athlete's target can't move under them mid-month — so the seed only ever
 * inserts, never updates. `seriesId` is null for challenges an athlete made.
 */
export const challengeEditions = pgTable(
  "challenge_editions",
  {
    id: text("id").primaryKey(),
    seriesId: text("series_id").references(() => challengeSeries.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    sport: text("sport").notNull(),
    metric: text("metric").notNull(),
    goal: numeric("goal", { precision: 10, scale: 2 }).notNull(),
    badge: text("badge").notNull(),
    blurb: text("blurb").notNull(),
    startsAt: date("starts_at").notNull(),
    endsAt: date("ends_at").notNull(),
    monthIdx: integer("month_idx").notNull(),
    source: text("source").notNull(),
    visibility: text("visibility").notNull().default("public"),
    participants: integer("participants").notNull().default(0),
    createdBy: text("created_by").references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    monthIdx: index("challenge_editions_month_idx").on(table.monthIdx),
  }),
);

export const challengeEntries = pgTable(
  "challenge_entries",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    editionId: text("edition_id")
      .notNull()
      .references(() => challengeEditions.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.editionId] }),
  }),
);

export const activityKudos = pgTable(
  "activity_kudos",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.activityId] }),
  }),
);
