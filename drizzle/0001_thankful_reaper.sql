ALTER TABLE "activities" ADD COLUMN "route_confidence" jsonb;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "distance_range_low_km" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "distance_range_high_km" numeric(10, 2);