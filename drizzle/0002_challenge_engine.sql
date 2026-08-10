CREATE TABLE "challenge_editions" (
	"id" text PRIMARY KEY NOT NULL,
	"series_id" text,
	"name" text NOT NULL,
	"sport" text NOT NULL,
	"metric" text NOT NULL,
	"goal" numeric(10, 2) NOT NULL,
	"badge" text NOT NULL,
	"blurb" text NOT NULL,
	"starts_at" date NOT NULL,
	"ends_at" date NOT NULL,
	"month_idx" integer NOT NULL,
	"source" text NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"participants" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_entries" (
	"user_id" text NOT NULL,
	"edition_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_entries_user_id_edition_id_pk" PRIMARY KEY("user_id","edition_id")
);
--> statement-breakpoint
CREATE TABLE "challenge_series" (
	"id" text PRIMARY KEY NOT NULL,
	"sport" text NOT NULL,
	"tier" text NOT NULL,
	"label" text NOT NULL,
	"badge" text NOT NULL,
	"metric" text NOT NULL,
	"goal_min" numeric(10, 2) NOT NULL,
	"goal_max" numeric(10, 2) NOT NULL,
	"goal_step" numeric(10, 2) NOT NULL,
	"blurb" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "challenge_editions" ADD CONSTRAINT "challenge_editions_series_id_challenge_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."challenge_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_editions" ADD CONSTRAINT "challenge_editions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_entries" ADD CONSTRAINT "challenge_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_entries" ADD CONSTRAINT "challenge_entries_edition_id_challenge_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."challenge_editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "challenge_editions_month_idx" ON "challenge_editions" USING btree ("month_idx");