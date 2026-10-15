ALTER TABLE "activities" ALTER COLUMN "distance_km" SET DATA TYPE numeric(10, 3);--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "pool_length_m" integer;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "pool_lengths" integer;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "tracking_mode" text;