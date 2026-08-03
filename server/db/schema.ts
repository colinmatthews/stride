import { sql } from "drizzle-orm";
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

/**
 * In-app notification inbox. This is the complete record of social events
 * directed at a user, independent of whether push/email was delivered for them.
 *
 * `title`/`body` are templated server-side and frozen at insert: a comment
 * notification quotes an activity the client usually does not hold, so the
 * client cannot render the prose itself.
 *
 * Delete behavior is deliberately asymmetric with the rest of the schema. The
 * recipient and the linked entity cascade (a dead link means a dead row), but
 * `actor_id`/`target_user_id` are `set null` — the prose is frozen, so
 * "Maya gave you kudos" stays meaningful after Maya deletes her account, and
 * cascading there would erase other people's inbox history.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    activityId: text("activity_id").references(() => activities.id, { onDelete: "cascade" }),
    clubId: text("club_id").references(() => clubs.id, { onDelete: "cascade" }),
    challengeId: text("challenge_id").references(() => challenges.id, { onDelete: "cascade" }),
    segmentId: text("segment_id").references(() => segments.id, { onDelete: "cascade" }),
    targetUserId: text("target_user_id").references(() => users.id, { onDelete: "set null" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // The first explicit indexes in this schema. Justified: notifications is the
    // only unbounded per-user list that is both paged and counted on every
    // bootstrap. The composite matches the (created_at, id) keyset cursor.
    userCreatedIdx: index("notifications_user_created_idx").on(
      table.userId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    userUnreadIdx: index("notifications_user_unread_idx")
      .on(table.userId)
      .where(sql`${table.readAt} is null`),
  }),
);

/**
 * Per-type delivery preferences, one row per (user, kind). Rows are sparse: a
 * missing row means "use the code default" (see server/notifications/catalog.ts),
 * so changing a default does not require a data migration.
 */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    push: boolean("push").notNull(),
    email: boolean("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.kind] }),
  }),
);

/** Channel master switches. When a master is off, nothing ships on that channel. */
export const notificationChannelSettings = pgTable("notification_channel_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  pushEnabled: boolean("push_enabled").notNull(),
  emailEnabled: boolean("email_enabled").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
