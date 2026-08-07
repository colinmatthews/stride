CREATE TABLE "challenge_activities" (
	"user_id" text NOT NULL,
	"challenge_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_activities_user_id_challenge_id_activity_id_pk" PRIMARY KEY("user_id","challenge_id","activity_id")
);
--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "starts_at" date;--> statement-breakpoint
UPDATE "challenges" SET "starts_at" = "ends_at" - INTERVAL '30 days' WHERE "starts_at" IS NULL;--> statement-breakpoint
ALTER TABLE "challenges" ALTER COLUMN "starts_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "challenge_activities" ADD CONSTRAINT "challenge_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_activities" ADD CONSTRAINT "challenge_activities_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_activities" ADD CONSTRAINT "challenge_activities_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;