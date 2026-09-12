DROP INDEX `goals_site_event`;--> statement-breakpoint
ALTER TABLE `goals` ADD `path` text;--> statement-breakpoint
ALTER TABLE `goals` ADD `conditions` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `goals` ADD `definition_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `goals_site_definition` ON `goals` (`site_id`,coalesce(`definition_key`, `event_name`));
