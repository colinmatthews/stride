import { date, integer, numeric, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

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

export const challenges = pgTable("challenges", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sport: text("sport").notNull(),
  goalKm: numeric("goal_km", { precision: 10, scale: 2 }).notNull(),
  participants: integer("participants").notNull(),
  endsAt: date("ends_at").notNull(),
  badge: text("badge").notNull(),
  metricType: text("metric_type").notNull(),
});

export const challengeEntries = pgTable(
  "challenge_entries",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    challengeId: text("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.challengeId] }),
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
