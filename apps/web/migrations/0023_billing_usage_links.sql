ALTER TABLE `billing_event_receipts` ADD `site_label` text NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `billing_receipt_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `events_billing_receipt` ON `events` (`billing_receipt_id`) WHERE "events"."billing_receipt_id" is not null;