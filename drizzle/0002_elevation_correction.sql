CREATE TABLE "activity_elevation_corrections" (
	"activity_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"original_elevation_m" integer NOT NULL,
	"corrected_elevation_m" integer NOT NULL,
	"spike_count" integer NOT NULL,
	"method" text NOT NULL,
	"error_type" text NOT NULL,
	"direction" text NOT NULL,
	"kept_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_streams" (
	"activity_id" text PRIMARY KEY NOT NULL,
	"distance_km" jsonb NOT NULL,
	"elevation_m" jsonb NOT NULL,
	"latitude" jsonb,
	"longitude" jsonb,
	"terrain_elevation_m" jsonb,
	"terrain_source" text,
	"terrain_fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "device_name" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "device_manufacturer" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "device_model" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "device_firmware" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "elevation_source" text;--> statement-breakpoint
ALTER TABLE "activity_elevation_corrections" ADD CONSTRAINT "activity_elevation_corrections_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_elevation_corrections" ADD CONSTRAINT "activity_elevation_corrections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_streams" ADD CONSTRAINT "activity_streams_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;