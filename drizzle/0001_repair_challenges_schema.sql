-- PR preview #75 replaced these demo tables in the database used by the base
-- Render service. Restore the current main schema only when that incompatible
-- shape is present. Fresh databases and isolated previews already have
-- goal_km, so this migration is a no-op for them.
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = current_schema()
			AND table_name = 'challenges'
			AND column_name = 'goal_km'
	) THEN
		DROP TABLE IF EXISTS "challenge_entries" CASCADE;
		DROP TABLE IF EXISTS "challenges" CASCADE;

		CREATE TABLE "challenge_entries" (
			"user_id" text NOT NULL,
			"challenge_id" text NOT NULL,
			"created_at" timestamp with time zone DEFAULT now() NOT NULL,
			CONSTRAINT "challenge_entries_user_id_challenge_id_pk" PRIMARY KEY("user_id", "challenge_id")
		);

		CREATE TABLE "challenges" (
			"id" text PRIMARY KEY NOT NULL,
			"name" text NOT NULL,
			"sport" text NOT NULL,
			"goal_km" numeric(10, 2) NOT NULL,
			"participants" integer NOT NULL,
			"ends_at" date NOT NULL,
			"badge" text NOT NULL,
			"metric_type" text NOT NULL
		);

		ALTER TABLE "challenge_entries"
			ADD CONSTRAINT "challenge_entries_user_id_users_id_fk"
			FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
			ON DELETE cascade ON UPDATE no action;

		ALTER TABLE "challenge_entries"
			ADD CONSTRAINT "challenge_entries_challenge_id_challenges_id_fk"
			FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id")
			ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
