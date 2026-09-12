ALTER TABLE `events` ADD `visitor_id` text;--> statement-breakpoint
ALTER TABLE `events` ADD `session_id` text;--> statement-breakpoint
ALTER TABLE `events` ADD `tracking_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `referrer_host` text;--> statement-breakpoint
ALTER TABLE `events` ADD `utm_source` text;--> statement-breakpoint
ALTER TABLE `events` ADD `utm_medium` text;--> statement-breakpoint
ALTER TABLE `events` ADD `utm_campaign` text;