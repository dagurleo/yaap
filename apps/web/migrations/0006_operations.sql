CREATE TABLE `ingestion_buckets` (
	`site_id` text NOT NULL,
	`hour` integer NOT NULL,
	`queued` integer DEFAULT 0 NOT NULL,
	`stored` integer DEFAULT 0 NOT NULL,
	`duplicates` integer DEFAULT 0 NOT NULL,
	`bots` integer DEFAULT 0 NOT NULL,
	`enqueue_failures` integer DEFAULT 0 NOT NULL,
	`write_failures` integer DEFAULT 0 NOT NULL,
	`expired` integer DEFAULT 0 NOT NULL,
	`last_queued_at` integer,
	`last_stored_at` integer,
	PRIMARY KEY(`site_id`, `hour`),
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ingestion_buckets_hour` ON `ingestion_buckets` (`hour`);--> statement-breakpoint
ALTER TABLE `sites` ADD `event_retention_days` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sites` ADD `payment_retention_days` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sites` ADD `exclude_bots` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `sites` ADD `last_cleanup_at` integer;