CREATE TABLE "sync_failures" (
	"id" text PRIMARY KEY NOT NULL,
	"athlete_id" text NOT NULL,
	"device_name" text NOT NULL,
	"device_type" text NOT NULL,
	"attempted_at" timestamp with time zone NOT NULL,
	"sport_guess" text NOT NULL,
	"gps_points_captured" integer DEFAULT 0 NOT NULL,
	"route_seed" integer,
	"reason" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "route_seed" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_failures" ADD CONSTRAINT "sync_failures_athlete_id_users_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;