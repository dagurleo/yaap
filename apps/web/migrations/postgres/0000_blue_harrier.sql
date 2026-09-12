CREATE TABLE "daily_activity" (
	"site_id" text NOT NULL,
	"day" bigint NOT NULL,
	"key" text NOT NULL,
	"visitor_id" text,
	"session_id" text,
	"name" text NOT NULL,
	"events" bigint NOT NULL,
	"first_at" bigint NOT NULL,
	"last_at" bigint NOT NULL,
	"first_id" text NOT NULL,
	"last_id" text NOT NULL,
	"first_path" text NOT NULL,
	"last_path" text NOT NULL,
	CONSTRAINT "daily_activity_site_id_day_key_pk" PRIMARY KEY("site_id","day","key")
);
--> statement-breakpoint
CREATE TABLE "daily_traffic" (
	"site_id" text NOT NULL,
	"day" bigint NOT NULL,
	"dimension" text NOT NULL,
	"key" text NOT NULL,
	"pageviews" bigint NOT NULL,
	"identified" bigint NOT NULL,
	CONSTRAINT "daily_traffic_site_id_dimension_day_key_pk" PRIMARY KEY("site_id","dimension","day","key")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text NOT NULL,
	"site_id" text NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"received_at" bigint NOT NULL,
	"visitor_id" text,
	"session_id" text,
	"tracking_version" bigint DEFAULT 1 NOT NULL,
	"referrer_host" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"country" text,
	"region" text,
	"city" text,
	"browser" text,
	"os" text,
	"device" text,
	CONSTRAINT "events_site_id_id_pk" PRIMARY KEY("site_id","id")
);
--> statement-breakpoint
CREATE TABLE "funnels" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT 'route' NOT NULL,
	"scope" text NOT NULL,
	"window_hours" bigint NOT NULL,
	"steps" text NOT NULL,
	"archived" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"name" text NOT NULL,
	"event_name" text NOT NULL,
	"icon" text DEFAULT 'target' NOT NULL,
	"archived" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_buckets" (
	"site_id" text NOT NULL,
	"hour" bigint NOT NULL,
	"queued" bigint DEFAULT 0 NOT NULL,
	"stored" bigint DEFAULT 0 NOT NULL,
	"duplicates" bigint DEFAULT 0 NOT NULL,
	"bots" bigint DEFAULT 0 NOT NULL,
	"enqueue_failures" bigint DEFAULT 0 NOT NULL,
	"write_failures" bigint DEFAULT 0 NOT NULL,
	"expired" bigint DEFAULT 0 NOT NULL,
	"last_queued_at" bigint,
	"last_stored_at" bigint,
	CONSTRAINT "ingestion_buckets_site_id_hour_pk" PRIMARY KEY("site_id","hour")
);
--> statement-breakpoint
CREATE TABLE "payment_integrations" (
	"site_id" text PRIMARY KEY NOT NULL,
	"api_key_hash" text,
	"api_key_hint" text,
	"stripe_test_secret" text,
	"stripe_live_secret" text,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"site_id" text NOT NULL,
	"provider" text NOT NULL,
	"mode" text NOT NULL,
	"external_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"refunded_amount" bigint DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"paid_at" bigint NOT NULL,
	"visitor_id" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "payments_site_id_provider_mode_external_id_pk" PRIMARY KEY("site_id","provider","mode","external_id")
);
--> statement-breakpoint
CREATE TABLE "request_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" bigint NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rollup_days" (
	"site_id" text NOT NULL,
	"day" bigint NOT NULL,
	"completed_at" bigint NOT NULL,
	CONSTRAINT "rollup_days_site_id_day_pk" PRIMARY KEY("site_id","day")
);
--> statement-breakpoint
CREATE TABLE "rollup_pending" (
	"site_id" text NOT NULL,
	"day" bigint NOT NULL,
	CONSTRAINT "rollup_pending_site_id_day_pk" PRIMARY KEY("site_id","day")
);
--> statement-breakpoint
CREATE TABLE "session_summaries" (
	"site_id" text NOT NULL,
	"visitor_id" text NOT NULL,
	"session_id" text NOT NULL,
	"started" bigint NOT NULL,
	"ended" bigint NOT NULL,
	"views" bigint NOT NULL,
	"custom_events" bigint NOT NULL,
	"entry_path" text,
	"exit_path" text,
	CONSTRAINT "session_summaries_site_id_visitor_id_session_id_pk" PRIMARY KEY("site_id","visitor_id","session_id")
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"tracking_rules" text DEFAULT '{"additionalOrigins":[],"allowAllDomains":false,"excludedPaths":[],"excludedHostnames":[]}' NOT NULL,
	"event_retention_days" bigint DEFAULT 0 NOT NULL,
	"payment_retention_days" bigint DEFAULT 0 NOT NULL,
	"exclude_bots" integer DEFAULT 1 NOT NULL,
	"last_cleanup_at" bigint,
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"origin" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visitor_first_seen" (
	"site_id" text NOT NULL,
	"visitor_id" text NOT NULL,
	"first_at" bigint NOT NULL,
	CONSTRAINT "visitor_first_seen_site_id_visitor_id_pk" PRIMARY KEY("site_id","visitor_id")
);
--> statement-breakpoint
CREATE TABLE "visitor_presence" (
	"site_id" text NOT NULL,
	"visitor_id" text NOT NULL,
	"session_id" text NOT NULL,
	"path" text NOT NULL,
	"received_at" bigint NOT NULL,
	"country" text,
	"source" text NOT NULL,
	CONSTRAINT "visitor_presence_site_id_visitor_id_pk" PRIMARY KEY("site_id","visitor_id")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" bigint,
	"refresh_token_expires_at" bigint,
	"scope" text,
	"password" text,
	"created_at" bigint DEFAULT (floor(extract(epoch from clock_timestamp()) * 1000)::bigint) NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" bigint NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" bigint NOT NULL,
	"token" text NOT NULL,
	"created_at" bigint DEFAULT (floor(extract(epoch from clock_timestamp()) * 1000)::bigint) NOT NULL,
	"updated_at" bigint NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" integer DEFAULT 0 NOT NULL,
	"image" text,
	"created_at" bigint DEFAULT (floor(extract(epoch from clock_timestamp()) * 1000)::bigint) NOT NULL,
	"updated_at" bigint DEFAULT (floor(extract(epoch from clock_timestamp()) * 1000)::bigint) NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint DEFAULT (floor(extract(epoch from clock_timestamp()) * 1000)::bigint) NOT NULL,
	"updated_at" bigint DEFAULT (floor(extract(epoch from clock_timestamp()) * 1000)::bigint) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_activity" ADD CONSTRAINT "daily_activity_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_traffic" ADD CONSTRAINT "daily_traffic_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funnels" ADD CONSTRAINT "funnels_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_buckets" ADD CONSTRAINT "ingestion_buckets_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_integrations" ADD CONSTRAINT "payment_integrations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_days" ADD CONSTRAINT "rollup_days_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_pending" ADD CONSTRAINT "rollup_pending_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_summaries" ADD CONSTRAINT "session_summaries_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_first_seen" ADD CONSTRAINT "visitor_first_seen_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_presence" ADD CONSTRAINT "visitor_presence_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_activity_session" ON "daily_activity" USING btree ("site_id","visitor_id","session_id","day");--> statement-breakpoint
CREATE INDEX "events_site_time" ON "events" USING btree ("site_id","received_at");--> statement-breakpoint
CREATE INDEX "events_site_visitor_session_time" ON "events" USING btree ("site_id","visitor_id","session_id","received_at");--> statement-breakpoint
CREATE INDEX "events_site_visitor_time" ON "events" USING btree ("site_id","visitor_id","received_at");--> statement-breakpoint
CREATE INDEX "funnels_site" ON "funnels" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goals_site_event" ON "goals" USING btree ("site_id","event_name");--> statement-breakpoint
CREATE INDEX "ingestion_buckets_hour" ON "ingestion_buckets" USING btree ("hour");--> statement-breakpoint
CREATE INDEX "payments_site_time" ON "payments" USING btree ("site_id","mode","paid_at");--> statement-breakpoint
CREATE INDEX "payments_site_visitor_time" ON "payments" USING btree ("site_id","visitor_id","paid_at");--> statement-breakpoint
CREATE INDEX "request_limits_expiry" ON "request_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "rollup_pending_day" ON "rollup_pending" USING btree ("day");--> statement-breakpoint
CREATE INDEX "visitor_presence_site_time" ON "visitor_presence" USING btree ("site_id","received_at");--> statement-breakpoint
CREATE INDEX "visitor_presence_expiry" ON "visitor_presence" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_single_owner" ON "user" USING btree ((1));--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");