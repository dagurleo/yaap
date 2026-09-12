CREATE TABLE "daily_visitor_dimensions" (
	"site_id" text NOT NULL,
	"day" bigint NOT NULL,
	"visitor_id" text NOT NULL,
	"country" text,
	"region" text,
	"city" text,
	"browser" text,
	"os" text,
	"device" text
);
--> statement-breakpoint
ALTER TABLE "daily_visitor_dimensions" ADD CONSTRAINT "daily_visitor_dimensions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_visitor_dimensions_lookup" ON "daily_visitor_dimensions" USING btree ("site_id","day");
--> statement-breakpoint
INSERT INTO rollup_pending(site_id,day) SELECT site_id,day FROM rollup_days WHERE true ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM rollup_days;
