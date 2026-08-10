ALTER TABLE "challenge_entries" DROP CONSTRAINT "challenge_entries_user_id_challenge_id_pk";--> statement-breakpoint
ALTER TABLE "challenge_entries" ADD COLUMN "id" text;--> statement-breakpoint
UPDATE "challenge_entries" SET "id" = 'entry-' || gen_random_uuid()::text WHERE "id" IS NULL;--> statement-breakpoint
ALTER TABLE "challenge_entries" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "challenge_entries" ADD CONSTRAINT "challenge_entries_pkey" PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "challenge_entries" ADD COLUMN "attempt" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "challenge_entries" ADD COLUMN "started_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "challenge_entries" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "challenge_entries" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "challenge_entries" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "challenge_entries" ADD COLUMN "celebration_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "challenge_entries" ADD COLUMN "dismissed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "goal_count" integer;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "duration_days" integer;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "auto_enroll" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "description" text;--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_entries_one_active" ON "challenge_entries" USING btree ("user_id","challenge_id") WHERE "challenge_entries"."status" = 'active';
