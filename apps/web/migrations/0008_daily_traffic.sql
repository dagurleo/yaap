CREATE TABLE `daily_traffic` (
	`site_id` text NOT NULL,
	`day` integer NOT NULL,
	`dimension` text NOT NULL,
	`key` text NOT NULL,
	`pageviews` integer NOT NULL,
	`identified` integer NOT NULL,
	PRIMARY KEY(`site_id`, `dimension`, `day`, `key`),
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rollup_days` (
	`site_id` text NOT NULL,
	`day` integer NOT NULL,
	`completed_at` integer NOT NULL,
	PRIMARY KEY(`site_id`, `day`),
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE TRIGGER events_rollup_insert AFTER INSERT ON events BEGIN
  DELETE FROM rollup_days WHERE site_id=NEW.site_id AND day=CAST(NEW.received_at/86400000 AS INTEGER)*86400000;
END;
--> statement-breakpoint
CREATE TRIGGER events_rollup_delete AFTER DELETE ON events BEGIN
  DELETE FROM rollup_days WHERE site_id=OLD.site_id AND day=CAST(OLD.received_at/86400000 AS INTEGER)*86400000;
END;
--> statement-breakpoint
CREATE TRIGGER events_rollup_update AFTER UPDATE ON events BEGIN
  DELETE FROM rollup_days WHERE site_id=OLD.site_id AND day=CAST(OLD.received_at/86400000 AS INTEGER)*86400000;
  DELETE FROM rollup_days WHERE site_id=NEW.site_id AND day=CAST(NEW.received_at/86400000 AS INTEGER)*86400000;
END;
