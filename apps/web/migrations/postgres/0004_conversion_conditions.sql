DROP INDEX "goals_site_event";--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "path" text;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "conditions" text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "definition_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "goals_site_definition" ON "goals" USING btree ("site_id",coalesce("definition_key", "event_name"));