CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_owner_user` ON `workspaces` (`owner_user_id`);
--> statement-breakpoint
INSERT INTO `workspaces` (`id`,`owner_user_id`,`created_at`,`updated_at`)
SELECT 'workspace_' || `id`,`id`,cast(unixepoch('subsecond') * 1000 as integer),cast(unixepoch('subsecond') * 1000 as integer) FROM `user`;
--> statement-breakpoint
DROP INDEX `user_single_owner`;
--> statement-breakpoint
ALTER TABLE `sites` ADD `workspace_id` text REFERENCES workspaces(id);
--> statement-breakpoint
UPDATE `sites` SET `workspace_id`=(SELECT `id` FROM `workspaces` WHERE `owner_user_id`=`sites`.`owner_id`);
--> statement-breakpoint
CREATE TRIGGER `sites_workspace_required_insert` BEFORE INSERT ON `sites`
WHEN NEW.`workspace_id` IS NULL BEGIN SELECT RAISE(ABORT, 'sites.workspace_id is required'); END;
--> statement-breakpoint
CREATE TRIGGER `sites_workspace_required_update` BEFORE UPDATE OF `workspace_id` ON `sites`
WHEN NEW.`workspace_id` IS NULL BEGIN SELECT RAISE(ABORT, 'sites.workspace_id is required'); END;
--> statement-breakpoint
CREATE INDEX `sites_workspace` ON `sites` (`workspace_id`);
--> statement-breakpoint
CREATE TABLE `site_memberships` (
	`site_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`created_at` integer NOT NULL,
	`created_by_user_id` text NOT NULL,
	PRIMARY KEY(`site_id`, `user_id`),
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "site_memberships_viewer" CHECK(`role` = 'viewer')
);
--> statement-breakpoint
CREATE INDEX `site_memberships_user` ON `site_memberships` (`user_id`);
--> statement-breakpoint
CREATE TABLE `site_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`email_normalized` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`accepted_by_user_id` text,
	`revoked_at` integer,
	`last_sent_at` integer,
	`send_status` text DEFAULT 'pending' NOT NULL,
	`provider_message_id` text,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`accepted_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_invitations_token` ON `site_invitations` (`token_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_invitations_pending` ON `site_invitations` (`site_id`,`email_normalized`) WHERE `accepted_at` is null and `revoked_at` is null;
--> statement-breakpoint
CREATE INDEX `site_invitations_site` ON `site_invitations` (`site_id`);
