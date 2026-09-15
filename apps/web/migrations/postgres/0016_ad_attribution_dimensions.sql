ALTER TABLE "events" ADD COLUMN "ad_provider" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ad_account_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ad_campaign_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ad_group_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ad_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ad_touch_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ad_touched_at" bigint;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ad_consent_policy" text;--> statement-breakpoint
ALTER TABLE "payment_attributions" ADD COLUMN "utm_medium" text;--> statement-breakpoint
ALTER TABLE "payment_attributions" ADD COLUMN "ad_provider" text;--> statement-breakpoint
ALTER TABLE "payment_attributions" ADD COLUMN "ad_account_id" text;--> statement-breakpoint
ALTER TABLE "payment_attributions" ADD COLUMN "ad_campaign_id" text;--> statement-breakpoint
ALTER TABLE "payment_attributions" ADD COLUMN "ad_group_id" text;--> statement-breakpoint
ALTER TABLE "payment_attributions" ADD COLUMN "ad_id" text;--> statement-breakpoint
ALTER TABLE "payment_attributions" ADD COLUMN "ad_touch_id" text;--> statement-breakpoint
ALTER TABLE "payment_attributions" ADD COLUMN "ad_touched_at" bigint;--> statement-breakpoint
ALTER TABLE "payment_attributions" ADD COLUMN "ad_consent_policy" text;