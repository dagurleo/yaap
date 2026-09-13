CREATE TABLE `site_public_shares` (
	`site_id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`events` integer DEFAULT false NOT NULL,
	`visitors` integer DEFAULT false NOT NULL,
	`revenue` integer DEFAULT false NOT NULL,
	`conversions` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_public_shares_public_id_unique` ON `site_public_shares` (`public_id`);