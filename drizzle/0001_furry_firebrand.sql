CREATE TABLE "community_challenges" (
	"challenge_id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"local_area" text NOT NULL,
	"starts_at" date NOT NULL,
	"baseline_distance_km" numeric(12, 2) DEFAULT '0' NOT NULL,
	"baseline_people" integer DEFAULT 0 NOT NULL,
	"baseline_badges" integer DEFAULT 0 NOT NULL,
	"live_moving_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "community_challenges_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "community_contribution_reactions" (
	"contribution_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_contribution_reactions_contribution_id_user_id_pk" PRIMARY KEY("contribution_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "community_contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"user_id" text NOT NULL,
	"activity_id" text,
	"distance_km" numeric(10, 2) NOT NULL,
	"note" text NOT NULL,
	"local_area" text NOT NULL,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	"route_key" text NOT NULL,
	"tone" text NOT NULL,
	"base_kudos" integer DEFAULT 0 NOT NULL,
	"replies_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_contributions_challenge_user_unique" UNIQUE("challenge_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "community_notification_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"anchor_contribution_id" text NOT NULL,
	"bundled_contributions" integer NOT NULL,
	"bundled_distance_km" numeric(10, 2) NOT NULL,
	"opened_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_notifications_challenge_recipient_unique" UNIQUE("challenge_id","recipient_id")
);
--> statement-breakpoint
ALTER TABLE "community_challenges" ADD CONSTRAINT "community_challenges_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_contribution_reactions" ADD CONSTRAINT "community_contribution_reactions_contribution_id_community_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."community_contributions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_contribution_reactions" ADD CONSTRAINT "community_contribution_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_contributions" ADD CONSTRAINT "community_contributions_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_contributions" ADD CONSTRAINT "community_contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_contributions" ADD CONSTRAINT "community_contributions_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_notification_receipts" ADD CONSTRAINT "community_notification_receipts_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_notification_receipts" ADD CONSTRAINT "community_notification_receipts_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_notification_receipts" ADD CONSTRAINT "community_notification_receipts_anchor_contribution_id_community_contributions_id_fk" FOREIGN KEY ("anchor_contribution_id") REFERENCES "public"."community_contributions"("id") ON DELETE cascade ON UPDATE no action;