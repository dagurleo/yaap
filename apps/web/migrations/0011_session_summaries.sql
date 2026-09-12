CREATE TABLE `session_summaries` (
	`site_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`session_id` text NOT NULL,
	`started` integer NOT NULL,
	`ended` integer NOT NULL,
	`views` integer NOT NULL,
	`custom_events` integer NOT NULL,
	`entry_path` text,
	`exit_path` text,
	PRIMARY KEY(`site_id`, `visitor_id`, `session_id`),
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE TRIGGER session_summary_insert AFTER INSERT ON events BEGIN
DELETE FROM session_summaries WHERE site_id=NEW.site_id AND visitor_id=NEW.visitor_id AND session_id=NEW.session_id;
END;

--> statement-breakpoint
CREATE TRIGGER session_summary_delete AFTER DELETE ON events BEGIN
DELETE FROM session_summaries WHERE site_id=OLD.site_id AND visitor_id=OLD.visitor_id AND session_id=OLD.session_id;
END;

--> statement-breakpoint
CREATE TRIGGER session_summary_update AFTER UPDATE ON events BEGIN
DELETE FROM session_summaries WHERE site_id=OLD.site_id AND visitor_id=OLD.visitor_id AND session_id=OLD.session_id;
DELETE FROM session_summaries WHERE site_id=NEW.site_id AND visitor_id=NEW.visitor_id AND session_id=NEW.session_id;
END;

--> statement-breakpoint
INSERT INTO rollup_pending(site_id,day) SELECT site_id,day FROM rollup_days WHERE 1 ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM rollup_days;
