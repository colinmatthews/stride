ALTER TABLE "habit_plans" ADD COLUMN "week_targets" integer[];--> statement-breakpoint
UPDATE "habit_plans"
SET "week_targets" = ARRAY["weekly_target", "weekly_target", "weekly_target", "weekly_target"];--> statement-breakpoint
ALTER TABLE "habit_plans" ALTER COLUMN "week_targets" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "habit_plans" ADD COLUMN "time_zone" text DEFAULT 'UTC' NOT NULL;
