CREATE TABLE `rollup_pending` (
	`site_id` text NOT NULL,
	`day` integer NOT NULL,
	PRIMARY KEY(`site_id`, `day`),
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rollup_pending_day` ON `rollup_pending` (`day`);
--> statement-breakpoint
INSERT INTO rollup_pending(site_id,day)
SELECT DISTINCT e.site_id,CAST(e.received_at/86400000 AS INTEGER)*86400000 FROM events e
WHERE NOT EXISTS(SELECT 1 FROM rollup_days r WHERE r.site_id=e.site_id AND r.day=CAST(e.received_at/86400000 AS INTEGER)*86400000);

--> statement-breakpoint
DROP TRIGGER events_rollup_insert;
--> statement-breakpoint
CREATE TRIGGER events_rollup_insert AFTER INSERT ON events BEGIN
DELETE FROM rollup_days WHERE site_id=NEW.site_id AND day=CAST(NEW.received_at/86400000 AS INTEGER)*86400000;
INSERT INTO rollup_pending(site_id,day) VALUES(NEW.site_id,CAST(NEW.received_at/86400000 AS INTEGER)*86400000) ON CONFLICT(site_id,day) DO NOTHING;
END;

--> statement-breakpoint
DROP TRIGGER events_rollup_delete;
--> statement-breakpoint
CREATE TRIGGER events_rollup_delete AFTER DELETE ON events BEGIN
DELETE FROM rollup_days WHERE site_id=OLD.site_id AND day=CAST(OLD.received_at/86400000 AS INTEGER)*86400000;
INSERT INTO rollup_pending(site_id,day) VALUES(OLD.site_id,CAST(OLD.received_at/86400000 AS INTEGER)*86400000) ON CONFLICT(site_id,day) DO NOTHING;
END;

--> statement-breakpoint
DROP TRIGGER events_rollup_update;
--> statement-breakpoint
CREATE TRIGGER events_rollup_update AFTER UPDATE ON events BEGIN
DELETE FROM rollup_days WHERE site_id=OLD.site_id AND day=CAST(OLD.received_at/86400000 AS INTEGER)*86400000;
INSERT INTO rollup_pending(site_id,day) VALUES(OLD.site_id,CAST(OLD.received_at/86400000 AS INTEGER)*86400000) ON CONFLICT(site_id,day) DO NOTHING;
DELETE FROM rollup_days WHERE site_id=NEW.site_id AND day=CAST(NEW.received_at/86400000 AS INTEGER)*86400000;
INSERT INTO rollup_pending(site_id,day) VALUES(NEW.site_id,CAST(NEW.received_at/86400000 AS INTEGER)*86400000) ON CONFLICT(site_id,day) DO NOTHING;
END;
