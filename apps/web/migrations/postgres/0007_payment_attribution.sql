CREATE TABLE "payment_attributions" (
	"site_id" text NOT NULL,
	"provider" text NOT NULL,
	"mode" text NOT NULL,
	"external_id" text NOT NULL,
	"model" text NOT NULL,
	"visitor_id" text,
	"id" text,
	"path" text,
	"utm_source" text,
	"utm_campaign" text,
	"referrer_host" text,
	"country" text,
	"region" text,
	"city" text,
	"browser" text,
	"os" text,
	"device" text,
	"lookback_days" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"checked_at" bigint NOT NULL,
	"finalize_after" bigint NOT NULL,
	"finalized_at" bigint,
	"received_at" bigint,
	"tracking_version" bigint,
	CONSTRAINT "payment_attributions_site_id_provider_mode_external_id_pk" PRIMARY KEY("site_id","provider","mode","external_id"),
	CONSTRAINT "payment_attributions_model" CHECK ("payment_attributions"."model" in ('first_touch','last_non_direct')),
	CONSTRAINT "payment_attributions_lookback" CHECK ("payment_attributions"."lookback_days" between 1 and 365)
);
--> statement-breakpoint
ALTER TABLE "payment_integrations" ADD COLUMN "attribution_model" text DEFAULT 'first_touch' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_integrations" ADD COLUMN "attribution_lookback_days" bigint DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_attributions" ADD CONSTRAINT "payment_attributions_site_id_provider_mode_external_id_payments_site_id_provider_mode_external_id_fk" FOREIGN KEY ("site_id","provider","mode","external_id") REFERENCES "public"."payments"("site_id","provider","mode","external_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_attributions_pending" ON "payment_attributions" USING btree ("finalized_at","checked_at");--> statement-breakpoint
CREATE INDEX "payment_attributions_site_pending" ON "payment_attributions" USING btree ("site_id","finalized_at","checked_at");