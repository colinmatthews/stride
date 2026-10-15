CREATE TABLE "retention_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"athlete_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"channel" text,
	"message" text,
	"note" text,
	"snoozed_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan_renews_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "retention_actions" ADD CONSTRAINT "retention_actions_athlete_id_users_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_actions" ADD CONSTRAINT "retention_actions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "retention_actions_athlete_created_idx" ON "retention_actions" USING btree ("athlete_id","created_at");