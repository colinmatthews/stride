CREATE TABLE "workout_syncs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ref" text NOT NULL,
	"provider" text NOT NULL,
	"device_name" text NOT NULL,
	"external_id" text NOT NULL,
	"sport" text NOT NULL,
	"title" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"payload" jsonb,
	"status" text NOT NULL,
	"error_code" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"activity_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_syncs_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
ALTER TABLE "workout_syncs" ADD CONSTRAINT "workout_syncs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workout_syncs_user_provider_external_idx" ON "workout_syncs" USING btree ("user_id","provider","external_id");