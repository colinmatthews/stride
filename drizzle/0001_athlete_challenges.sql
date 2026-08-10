-- Replaces the legacy hand-seeded challenge model with athlete-authored
-- challenges. The old rows were demo fixtures reseeded on boot, so they are
-- dropped rather than migrated; challenge_entries goes with them because its
-- foreign key moves to the new table.
DROP TABLE "challenge_entries" CASCADE;--> statement-breakpoint
DROP TABLE "challenges" CASCADE;--> statement-breakpoint
CREATE TABLE "challenge_entries" (
	"user_id" text NOT NULL,
	"challenge_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_entries_user_id_challenge_id_pk" PRIMARY KEY("user_id","challenge_id")
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sport" text NOT NULL,
	"metric" text NOT NULL,
	"goal" numeric(10, 2) NOT NULL,
	"starts_at" date NOT NULL,
	"ends_at" date NOT NULL,
	"month_idx" integer NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "challenge_entries" ADD CONSTRAINT "challenge_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_entries" ADD CONSTRAINT "challenge_entries_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "challenges_month_idx" ON "challenges" USING btree ("month_idx");--> statement-breakpoint
CREATE INDEX "challenges_created_by_idx" ON "challenges" USING btree ("created_by");
