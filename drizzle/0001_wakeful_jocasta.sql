ALTER TABLE "challenge_entries" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "challenge_entries" ADD COLUMN "completion_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "starts_at" date;--> statement-breakpoint
UPDATE "challenges" SET "starts_at" = date_trunc('month', "ends_at"::timestamp)::date WHERE "starts_at" IS NULL;--> statement-breakpoint
UPDATE "challenges" SET "starts_at" = '2026-08-01', "ends_at" = '2026-08-31' WHERE "id" = 'ch1';--> statement-breakpoint
UPDATE "challenges" SET "starts_at" = '2026-08-01', "ends_at" = '2026-08-31' WHERE "id" = 'ch2';--> statement-breakpoint
UPDATE "challenges" SET "starts_at" = '2026-08-01', "ends_at" = '2026-09-15' WHERE "id" = 'ch3';--> statement-breakpoint
UPDATE "challenges" SET "starts_at" = '2026-08-01', "ends_at" = '2026-08-31' WHERE "id" = 'ch4';--> statement-breakpoint
UPDATE "challenges" SET "starts_at" = '2026-08-01', "ends_at" = '2026-08-31' WHERE "id" = 'ch5';--> statement-breakpoint
ALTER TABLE "challenges" ALTER COLUMN "starts_at" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "activities_athlete_date_idx" ON "activities" USING btree ("athlete_id","date");
