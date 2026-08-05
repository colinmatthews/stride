CREATE TABLE "pending_uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"device" text NOT NULL,
	"reason" text NOT NULL,
	"failed_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"recovered_activity_id" text,
	"sport" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"distance_km" numeric(10, 2) NOT NULL,
	"moving_seconds" integer NOT NULL,
	"elevation_m" integer NOT NULL,
	"avg_hr" integer,
	"avg_pace_sec_per_km" integer,
	"avg_speed_kmh" numeric(10, 1),
	"route_seed" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pending_uploads" ADD CONSTRAINT "pending_uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_uploads" ADD CONSTRAINT "pending_uploads_recovered_activity_id_activities_id_fk" FOREIGN KEY ("recovered_activity_id") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action;