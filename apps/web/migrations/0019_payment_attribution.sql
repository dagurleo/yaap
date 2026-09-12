CREATE TABLE `payment_attributions` (
	`site_id` text NOT NULL,
	`provider` text NOT NULL,
	`mode` text NOT NULL,
	`external_id` text NOT NULL,
	`model` text NOT NULL,
	`visitor_id` text,
	`id` text,
	`path` text,
	`utm_source` text,
	`utm_campaign` text,
	`referrer_host` text,
	`country` text,
	`region` text,
	`city` text,
	`browser` text,
	`os` text,
	`device` text,
	`lookback_days` integer NOT NULL,
	`created_at` integer NOT NULL,
	`checked_at` integer NOT NULL,
	`finalize_after` integer NOT NULL,
	`finalized_at` integer,
	`received_at` integer,
	`tracking_version` integer,
	PRIMARY KEY(`site_id`, `provider`, `mode`, `external_id`),
	FOREIGN KEY (`site_id`,`provider`,`mode`,`external_id`) REFERENCES `payments`(`site_id`,`provider`,`mode`,`external_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "payment_attributions_model" CHECK("payment_attributions"."model" in ('first_touch','last_non_direct')),
	CONSTRAINT "payment_attributions_lookback" CHECK("payment_attributions"."lookback_days" between 1 and 365)
);
--> statement-breakpoint
CREATE INDEX `payment_attributions_pending` ON `payment_attributions` (`finalized_at`,`checked_at`);--> statement-breakpoint
CREATE INDEX `payment_attributions_site_pending` ON `payment_attributions` (`site_id`,`finalized_at`,`checked_at`);--> statement-breakpoint
ALTER TABLE `payment_integrations` ADD `attribution_model` text DEFAULT 'first_touch' NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_integrations` ADD `attribution_lookback_days` integer DEFAULT 30 NOT NULL;