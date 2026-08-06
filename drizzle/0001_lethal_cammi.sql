CREATE TABLE "habit_plans" (
	"user_id" text PRIMARY KEY NOT NULL,
	"source_activity_id" text NOT NULL,
	"weekly_target" integer NOT NULL,
	"planned_days" text[] NOT NULL,
	"plan_starts_on" date NOT NULL,
	"encouragement_friend_id" text,
	"recovery_week_starts_on" date,
	"recovery_missed_day" text,
	"recovery_day" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "habit_plans" ADD CONSTRAINT "habit_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_plans" ADD CONSTRAINT "habit_plans_source_activity_id_activities_id_fk" FOREIGN KEY ("source_activity_id") REFERENCES "public"."activities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_plans" ADD CONSTRAINT "habit_plans_encouragement_friend_id_users_id_fk" FOREIGN KEY ("encouragement_friend_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;