ALTER TABLE "challenges" ADD COLUMN "starts_at" date;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "cadence" text DEFAULT 'monthly' NOT NULL;