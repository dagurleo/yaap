CREATE TABLE `billing_accounts` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`polar_customer_id` text,
	`trial_starts_at` integer,
	`trial_ends_at` integer,
	`recovery_ends_at` integer,
	`lifecycle_policy_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "billing_accounts_trial" CHECK(("billing_accounts"."trial_starts_at" is null and "billing_accounts"."trial_ends_at" is null) or ("billing_accounts"."trial_starts_at" < "billing_accounts"."trial_ends_at"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_accounts_customer` ON `billing_accounts` (`environment`,`polar_customer_id`) WHERE "billing_accounts"."polar_customer_id" is not null;--> statement-breakpoint
CREATE TABLE `billing_event_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`site_id` text NOT NULL,
	`event_id` text NOT NULL,
	`period_id` text NOT NULL,
	`ingressed_at` integer NOT NULL,
	`state` text DEFAULT 'reserved' NOT NULL,
	`payload` text NOT NULL,
	`publish_state` text DEFAULT 'pending' NOT NULL,
	`publish_attempts` integer DEFAULT 0 NOT NULL,
	`next_publish_at` integer NOT NULL,
	`last_publish_at` integer,
	`persisted_at` integer,
	`terminal_reason` text,
	`replay_until` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`period_id`) REFERENCES `billing_usage_periods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_event_receipts_event` ON `billing_event_receipts` (`workspace_id`,`site_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `billing_event_receipts_publish` ON `billing_event_receipts` (`publish_state`,`next_publish_at`);--> statement-breakpoint
CREATE INDEX `billing_event_receipts_expiry` ON `billing_event_receipts` (`replay_until`);--> statement-breakpoint
CREATE TABLE `billing_notification_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`period_id` text,
	`kind` text NOT NULL,
	`entitlement_revision` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`provider_message_id` text,
	`bounded_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`period_id`) REFERENCES `billing_usage_periods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_notification_jobs_dedupe` ON `billing_notification_jobs` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `billing_notification_jobs_pending` ON `billing_notification_jobs` (`state`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `billing_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`operation_key` text NOT NULL,
	`kind` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`expected_subscription_revision` text,
	`selected_plan_key` text NOT NULL,
	`selected_plan_version` integer NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`provider_checkout_id` text,
	`provider_reference` text,
	`bounded_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_operations_key` ON `billing_operations` (`workspace_id`,`operation_key`);--> statement-breakpoint
CREATE INDEX `billing_operations_pending` ON `billing_operations` (`state`,`updated_at`);--> statement-breakpoint
CREATE TABLE `billing_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`environment` text NOT NULL,
	`polar_subscription_id` text NOT NULL,
	`polar_product_id` text NOT NULL,
	`plan_key` text NOT NULL,
	`plan_version` integer NOT NULL,
	`provider_status` text NOT NULL,
	`started_at` integer NOT NULL,
	`current_period_starts_at` integer NOT NULL,
	`current_period_ends_at` integer NOT NULL,
	`paid_through_at` integer NOT NULL,
	`payment_grace_ends_at` integer,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`pending_plan_key` text,
	`pending_plan_version` integer,
	`pending_plan_effective_at` integer,
	`provider_revision` text NOT NULL,
	`last_reconciled_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "billing_subscriptions_period" CHECK("billing_subscriptions"."current_period_starts_at" < "billing_subscriptions"."current_period_ends_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_subscriptions_provider` ON `billing_subscriptions` (`environment`,`polar_subscription_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_subscriptions_open` ON `billing_subscriptions` (`workspace_id`,`environment`) WHERE "billing_subscriptions"."provider_status" not in ('canceled','revoked');--> statement-breakpoint
CREATE INDEX `billing_subscriptions_workspace` ON `billing_subscriptions` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `billing_usage_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`plan_key` text,
	`plan_version` integer NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`allowance` integer NOT NULL,
	`admission_ceiling` integer NOT NULL,
	`persisted_count` integer DEFAULT 0 NOT NULL,
	`reserved_count` integer DEFAULT 0 NOT NULL,
	`notified_80_at` integer,
	`notified_100_at` integer,
	`notified_ceiling_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "billing_usage_periods_range" CHECK("billing_usage_periods"."starts_at" < "billing_usage_periods"."ends_at"),
	CONSTRAINT "billing_usage_periods_counts" CHECK("billing_usage_periods"."allowance" > 0 and "billing_usage_periods"."admission_ceiling" >= "billing_usage_periods"."allowance" and "billing_usage_periods"."persisted_count" >= 0 and "billing_usage_periods"."reserved_count" >= 0 and "billing_usage_periods"."persisted_count" + "billing_usage_periods"."reserved_count" <= "billing_usage_periods"."admission_ceiling")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_usage_periods_source` ON `billing_usage_periods` (`workspace_id`,`source`,`source_id`,`starts_at`,`ends_at`);--> statement-breakpoint
CREATE INDEX `billing_usage_periods_workspace_time` ON `billing_usage_periods` (`workspace_id`,`starts_at`,`ends_at`);--> statement-breakpoint
CREATE TABLE `billing_usage_sites` (
	`period_id` text NOT NULL,
	`site_id` text NOT NULL,
	`site_label` text NOT NULL,
	`persisted_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`period_id`, `site_id`),
	FOREIGN KEY (`period_id`) REFERENCES `billing_usage_periods`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "billing_usage_sites_count" CHECK("billing_usage_sites"."persisted_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE `billing_webhook_receipts` (
	`environment` text NOT NULL,
	`event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`subject_id` text,
	`received_at` integer NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`retry_at` integer NOT NULL,
	`bounded_error` text,
	`completed_at` integer,
	PRIMARY KEY(`environment`, `event_id`)
);
--> statement-breakpoint
CREATE INDEX `billing_webhook_receipts_retry` ON `billing_webhook_receipts` (`state`,`retry_at`);