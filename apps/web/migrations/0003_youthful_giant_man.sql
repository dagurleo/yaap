ALTER TABLE `events` ADD `country` text;--> statement-breakpoint
ALTER TABLE `events` ADD `region` text;--> statement-breakpoint
ALTER TABLE `events` ADD `city` text;--> statement-breakpoint
ALTER TABLE `events` ADD `browser` text;--> statement-breakpoint
ALTER TABLE `events` ADD `os` text;--> statement-breakpoint
ALTER TABLE `events` ADD `device` text;--> statement-breakpoint
CREATE INDEX `events_site_visitor_time` ON `events` (`site_id`,`visitor_id`,`received_at`);