ALTER TABLE "challenges" ADD COLUMN "tier" text DEFAULT 'approachable' NOT NULL;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "first_step_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "first_step_distance_km" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "first_step_elevation_m" integer;