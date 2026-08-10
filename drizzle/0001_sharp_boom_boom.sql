CREATE TABLE "habit_commitments" (
	"user_id" text PRIMARY KEY NOT NULL,
	"sport" text,
	"distance_km" numeric(10, 2),
	"buddy_id" text,
	"started_at" timestamp with time zone,
	"prompt_dismissed_at" timestamp with time zone,
	"reminder_channel" text,
	"reminder_missed_date" text,
	"reminder_sent_at" timestamp with time zone,
	"reminder_dismissed" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "habit_commitments" ADD CONSTRAINT "habit_commitments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_commitments" ADD CONSTRAINT "habit_commitments_buddy_id_users_id_fk" FOREIGN KEY ("buddy_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;