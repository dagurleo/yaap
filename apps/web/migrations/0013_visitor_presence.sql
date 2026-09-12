CREATE TABLE `visitor_presence` (
	`site_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`session_id` text NOT NULL,
	`path` text NOT NULL,
	`received_at` integer NOT NULL,
	`country` text,
	`source` text NOT NULL,
	PRIMARY KEY(`site_id`, `visitor_id`),
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `visitor_presence_site_time` ON `visitor_presence` (`site_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `visitor_presence_expiry` ON `visitor_presence` (`received_at`);