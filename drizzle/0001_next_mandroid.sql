CREATE TABLE "device_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"device_name" text NOT NULL,
	"model" text NOT NULL,
	"device_type" text NOT NULL,
	"status" text NOT NULL,
	"last_sync_at" timestamp with time zone NOT NULL,
	"battery_pct" integer,
	"token_expires_at" timestamp with time zone,
	"detail" text,
	"fix" text,
	"pending_activity_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_events" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"kind" text NOT NULL,
	"outcome" text NOT NULL,
	"activities_imported" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_connections" ADD CONSTRAINT "device_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_events" ADD CONSTRAINT "sync_events_connection_id_device_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."device_connections"("id") ON DELETE cascade ON UPDATE no action;