CREATE TABLE "goal_trackers" (
	"user_id" text PRIMARY KEY NOT NULL,
	"cohort" text NOT NULL,
	"check_in_sent_at" timestamp with time zone,
	"check_in_dismissed_at" timestamp with time zone,
	"completed_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goal_trackers" ADD CONSTRAINT "goal_trackers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;