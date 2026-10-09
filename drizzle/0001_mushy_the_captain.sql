CREATE TABLE "recording_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sport" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"moving_seconds" integer DEFAULT 0 NOT NULL,
	"distance_meters" numeric(12, 2) DEFAULT '0' NOT NULL,
	"elevation_gain_m" numeric(10, 2),
	"pool_length_m" integer,
	"pool_lengths" integer,
	"activity_id" text
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "entry_mode" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "measurement_source" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "pool_length_m" integer;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "pool_lengths" integer;--> statement-breakpoint
ALTER TABLE "recording_sessions" ADD CONSTRAINT "recording_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recording_sessions" ADD CONSTRAINT "recording_sessions_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recording_sessions_one_open_per_user" ON "recording_sessions" USING btree ("user_id") WHERE "recording_sessions"."status" in ('recording', 'paused', 'stopped');