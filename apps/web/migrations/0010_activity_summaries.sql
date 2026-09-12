CREATE TABLE `daily_activity` (
	`site_id` text NOT NULL,
	`day` integer NOT NULL,
	`key` text NOT NULL,
	`visitor_id` text,
	`session_id` text,
	`name` text NOT NULL,
	`events` integer NOT NULL,
	`first_at` integer NOT NULL,
	`last_at` integer NOT NULL,
	`first_id` text NOT NULL,
	`last_id` text NOT NULL,
	`first_path` text NOT NULL,
	`last_path` text NOT NULL,
	PRIMARY KEY(`site_id`, `day`, `key`),
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `daily_activity_session` ON `daily_activity` (`site_id`,`visitor_id`,`session_id`,`day`);--> statement-breakpoint
CREATE TABLE `visitor_first_seen` (
	`site_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`first_at` integer NOT NULL,
	PRIMARY KEY(`site_id`, `visitor_id`),
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
INSERT INTO visitor_first_seen(site_id,visitor_id,first_at) SELECT site_id,visitor_id,min(received_at) FROM events WHERE visitor_id IS NOT NULL GROUP BY site_id,visitor_id;
--> statement-breakpoint
INSERT INTO rollup_pending(site_id,day) SELECT site_id,day FROM rollup_days WHERE true ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM rollup_days;
--> statement-breakpoint
CREATE TRIGGER events_first_seen_insert AFTER INSERT ON events WHEN NEW.visitor_id IS NOT NULL BEGIN
  INSERT INTO visitor_first_seen(site_id,visitor_id,first_at) VALUES(NEW.site_id,NEW.visitor_id,NEW.received_at)
  ON CONFLICT(site_id,visitor_id) DO UPDATE SET first_at=min(first_at,excluded.first_at);
END;
--> statement-breakpoint
CREATE TRIGGER events_first_seen_delete AFTER DELETE ON events WHEN OLD.visitor_id IS NOT NULL BEGIN
  DELETE FROM visitor_first_seen WHERE site_id=OLD.site_id AND visitor_id=OLD.visitor_id;
  INSERT INTO visitor_first_seen(site_id,visitor_id,first_at) SELECT OLD.site_id,OLD.visitor_id,min(received_at) FROM events
  WHERE site_id=OLD.site_id AND visitor_id=OLD.visitor_id HAVING count(*)>0;
END;
--> statement-breakpoint
CREATE TRIGGER events_first_seen_update AFTER UPDATE ON events BEGIN
  DELETE FROM visitor_first_seen WHERE site_id=OLD.site_id AND visitor_id=OLD.visitor_id;
  INSERT INTO visitor_first_seen(site_id,visitor_id,first_at) SELECT OLD.site_id,OLD.visitor_id,min(received_at) FROM events
  WHERE site_id=OLD.site_id AND visitor_id=OLD.visitor_id AND OLD.visitor_id IS NOT NULL HAVING count(*)>0;
  INSERT INTO visitor_first_seen(site_id,visitor_id,first_at) SELECT NEW.site_id,NEW.visitor_id,NEW.received_at WHERE NEW.visitor_id IS NOT NULL
  ON CONFLICT(site_id,visitor_id) DO UPDATE SET first_at=min(first_at,excluded.first_at);
END;
