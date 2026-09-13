CREATE TABLE "site_public_shares" (
	"site_id" text PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"enabled" integer DEFAULT 0 NOT NULL,
	"events" integer DEFAULT 0 NOT NULL,
	"visitors" integer DEFAULT 0 NOT NULL,
	"revenue" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "site_public_shares_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "site_public_shares" ADD CONSTRAINT "site_public_shares_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;