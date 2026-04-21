CREATE TABLE "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"athlete_id" text NOT NULL,
	"sport" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"date" timestamp with time zone NOT NULL,
	"distance_km" numeric(10, 2) NOT NULL,
	"moving_seconds" integer NOT NULL,
	"elevation_m" integer NOT NULL,
	"avg_hr" integer,
	"avg_pace_sec_per_km" integer,
	"avg_speed_kmh" numeric(10, 1),
	"kudos" integer DEFAULT 0 NOT NULL,
	"achievements" integer DEFAULT 0 NOT NULL,
	"photo" text,
	"route_seed" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"activity_id" text NOT NULL,
	"athlete_id" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_kudos" (
	"user_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_kudos_user_id_activity_id_pk" PRIMARY KEY("user_id","activity_id")
);
--> statement-breakpoint
CREATE TABLE "activity_segments" (
	"activity_id" text NOT NULL,
	"position" integer NOT NULL,
	"segment_id" text NOT NULL,
	"rank" integer NOT NULL,
	"effort_seconds" integer NOT NULL,
	CONSTRAINT "activity_segments_activity_id_position_pk" PRIMARY KEY("activity_id","position")
);
--> statement-breakpoint
CREATE TABLE "activity_splits" (
	"activity_id" text NOT NULL,
	"position" integer NOT NULL,
	"km" integer NOT NULL,
	"pace_sec" integer NOT NULL,
	"hr" integer NOT NULL,
	"elev" integer NOT NULL,
	CONSTRAINT "activity_splits_activity_id_position_pk" PRIMARY KEY("activity_id","position")
);
--> statement-breakpoint
CREATE TABLE "challenge_entries" (
	"user_id" text NOT NULL,
	"challenge_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_entries_user_id_challenge_id_pk" PRIMARY KEY("user_id","challenge_id")
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sport" text NOT NULL,
	"goal_km" numeric(10, 2) NOT NULL,
	"participants" integer NOT NULL,
	"ends_at" date NOT NULL,
	"badge" text NOT NULL,
	"metric_type" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_memberships" (
	"user_id" text NOT NULL,
	"club_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_memberships_user_id_club_id_pk" PRIMARY KEY("user_id","club_id")
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sport" text NOT NULL,
	"city" text NOT NULL,
	"members" integer NOT NULL,
	"cover" text NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_id" text NOT NULL,
	"followed_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_followed_id_pk" PRIMARY KEY("follower_id","followed_id")
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sport" text NOT NULL,
	"location" text NOT NULL,
	"distance_km" numeric(10, 2) NOT NULL,
	"avg_grade" numeric(10, 2) NOT NULL,
	"elevation_m" integer NOT NULL,
	"attempts" integer NOT NULL,
	"athletes" integer NOT NULL,
	"kor_sec" integer NOT NULL,
	"kor_athlete" text NOT NULL,
	"route_seed" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"password_hash" text,
	"password_salt" text,
	"name" text NOT NULL,
	"handle" text NOT NULL,
	"avatar_url" text NOT NULL,
	"city" text NOT NULL,
	"country" text NOT NULL,
	"bio" text NOT NULL,
	"followers_count" integer DEFAULT 0 NOT NULL,
	"following_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_athlete_id_users_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_comments" ADD CONSTRAINT "activity_comments_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_comments" ADD CONSTRAINT "activity_comments_athlete_id_users_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_kudos" ADD CONSTRAINT "activity_kudos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_kudos" ADD CONSTRAINT "activity_kudos_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_segments" ADD CONSTRAINT "activity_segments_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_segments" ADD CONSTRAINT "activity_segments_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_splits" ADD CONSTRAINT "activity_splits_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_entries" ADD CONSTRAINT "challenge_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_entries" ADD CONSTRAINT "challenge_entries_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followed_id_users_id_fk" FOREIGN KEY ("followed_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;