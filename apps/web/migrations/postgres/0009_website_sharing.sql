CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_owner_user" ON "workspaces" USING btree ("owner_user_id");
--> statement-breakpoint
INSERT INTO "workspaces" ("id","owner_user_id","created_at","updated_at")
SELECT 'workspace_' || "id","id",floor(extract(epoch from clock_timestamp()) * 1000)::bigint,floor(extract(epoch from clock_timestamp()) * 1000)::bigint FROM "user";
--> statement-breakpoint
DROP INDEX "user_single_owner";
--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "workspace_id" text;
--> statement-breakpoint
UPDATE "sites" SET "workspace_id"="workspaces"."id" FROM "workspaces" WHERE "workspaces"."owner_user_id"="sites"."owner_id";
--> statement-breakpoint
ALTER TABLE "sites" ALTER COLUMN "workspace_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "sites_workspace" ON "sites" USING btree ("workspace_id");
--> statement-breakpoint
CREATE TABLE "site_memberships" (
	"site_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by_user_id" text NOT NULL,
	CONSTRAINT "site_memberships_site_id_user_id_pk" PRIMARY KEY("site_id","user_id"),
	CONSTRAINT "site_memberships_viewer" CHECK ("role" = 'viewer')
);
--> statement-breakpoint
ALTER TABLE "site_memberships" ADD CONSTRAINT "site_memberships_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "site_memberships" ADD CONSTRAINT "site_memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "site_memberships" ADD CONSTRAINT "site_memberships_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "site_memberships_user" ON "site_memberships" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE "site_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"email_normalized" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	"accepted_at" bigint,
	"accepted_by_user_id" text,
	"revoked_at" bigint,
	"last_sent_at" bigint,
	"send_status" text DEFAULT 'pending' NOT NULL,
	"provider_message_id" text
);
--> statement-breakpoint
ALTER TABLE "site_invitations" ADD CONSTRAINT "site_invitations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "site_invitations" ADD CONSTRAINT "site_invitations_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "site_invitations" ADD CONSTRAINT "site_invitations_accepted_by_user_id_user_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "site_invitations_token" ON "site_invitations" USING btree ("token_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX "site_invitations_pending" ON "site_invitations" USING btree ("site_id","email_normalized") WHERE "accepted_at" is null and "revoked_at" is null;
--> statement-breakpoint
CREATE INDEX "site_invitations_site" ON "site_invitations" USING btree ("site_id");
