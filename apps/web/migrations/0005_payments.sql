CREATE TABLE `payment_integrations` (
	`site_id` text PRIMARY KEY NOT NULL,
	`api_key_hash` text,
	`api_key_hint` text,
	`stripe_test_secret` text,
	`stripe_live_secret` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`site_id` text NOT NULL,
	`provider` text NOT NULL,
	`mode` text NOT NULL,
	`external_id` text NOT NULL,
	`amount` integer NOT NULL,
	`refunded_amount` integer DEFAULT 0 NOT NULL,
	`currency` text NOT NULL,
	`paid_at` integer NOT NULL,
	`visitor_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`site_id`, `provider`, `mode`, `external_id`),
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payments_site_time` ON `payments` (`site_id`,`mode`,`paid_at`);--> statement-breakpoint
CREATE INDEX `payments_site_visitor_time` ON `payments` (`site_id`,`visitor_id`,`paid_at`);