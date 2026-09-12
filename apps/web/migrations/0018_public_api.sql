CREATE TABLE `api_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`site_id` text,
	`operation` text NOT NULL,
	`resource_id` text,
	`fields` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `api_audit_owner_time` ON `api_audit` (`owner_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `api_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`hint` text NOT NULL,
	`scopes` text NOT NULL,
	`site_ids` text NOT NULL,
	`all_sites` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`kind` text NOT NULL,
	`client_id` text,
	`audience` text,
	`refresh_hash` text,
	`refresh_expires_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_credentials_token` ON `api_credentials` (`token_hash`);--> statement-breakpoint
CREATE INDEX `api_credentials_owner` ON `api_credentials` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `api_credentials_refresh` ON `api_credentials` (`refresh_hash`);--> statement-breakpoint
CREATE TABLE `api_idempotency` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`response` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `api_idempotency_expiry` ON `api_idempotency` (`expires_at`);--> statement-breakpoint
CREATE TABLE `api_write_guards` (
	`id` text PRIMARY KEY NOT NULL,
	`valid` integer NOT NULL,
	CONSTRAINT "api_write_valid" CHECK("api_write_guards"."valid" = 1)
);
--> statement-breakpoint
CREATE TABLE `oauth_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`redirect_uris` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_codes` (
	`hash` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`client_id` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`challenge` text NOT NULL,
	`scopes` text NOT NULL,
	`site_ids` text NOT NULL,
	`all_sites` integer NOT NULL,
	`resource` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_by` text
);
--> statement-breakpoint
CREATE TABLE `oauth_refresh_used` (
	`hash` text PRIMARY KEY NOT NULL,
	`credential_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `funnels` ADD `revision` text DEFAULT 'initial' NOT NULL;--> statement-breakpoint
ALTER TABLE `goals` ADD `revision` text DEFAULT 'initial' NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_integrations` ADD `revision` text DEFAULT 'initial' NOT NULL;--> statement-breakpoint
ALTER TABLE `sites` ADD `revision` text DEFAULT 'initial' NOT NULL;