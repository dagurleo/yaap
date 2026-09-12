CREATE TRIGGER `billing_receipt_reserve` BEFORE INSERT ON `billing_event_receipts`
WHEN NEW.`state` = 'reserved'
BEGIN
  UPDATE `billing_usage_periods`
  SET `reserved_count` = `reserved_count` + 1, `updated_at` = NEW.`updated_at`
  WHERE `id` = NEW.`period_id`
    AND `workspace_id` = NEW.`workspace_id`
    AND NEW.`ingressed_at` >= `starts_at`
    AND NEW.`ingressed_at` < `ends_at`
    AND `persisted_count` + `reserved_count` < `admission_ceiling`;
  SELECT CASE WHEN changes() != 1 THEN RAISE(ABORT, 'billing_capacity_unavailable') END;
END;
--> statement-breakpoint
CREATE TRIGGER `billing_receipt_transition_guard` BEFORE UPDATE ON `billing_event_receipts`
BEGIN
  SELECT CASE WHEN
    NEW.`id` IS NOT OLD.`id` OR
    NEW.`workspace_id` IS NOT OLD.`workspace_id` OR
    NEW.`site_id` IS NOT OLD.`site_id` OR
    NEW.`site_label` IS NOT OLD.`site_label` OR
    NEW.`event_id` IS NOT OLD.`event_id` OR
    NEW.`period_id` IS NOT OLD.`period_id` OR
    NEW.`ingressed_at` IS NOT OLD.`ingressed_at` OR
    NEW.`payload` IS NOT OLD.`payload` OR
    NEW.`replay_until` IS NOT OLD.`replay_until`
  THEN RAISE(ABORT, 'billing_receipt_immutable') END;
  SELECT CASE WHEN NOT (
    NEW.`state` = OLD.`state` OR
    (OLD.`state` = 'reserved' AND NEW.`state` IN ('persisted','released','rejected','expired'))
  ) THEN RAISE(ABORT, 'billing_receipt_invalid_transition') END;
END;
--> statement-breakpoint
CREATE TRIGGER `billing_receipt_persist` AFTER UPDATE OF `state` ON `billing_event_receipts`
WHEN OLD.`state` = 'reserved' AND NEW.`state` = 'persisted'
BEGIN
  UPDATE `billing_usage_periods`
  SET `reserved_count` = `reserved_count` - 1,
      `persisted_count` = `persisted_count` + 1,
      `updated_at` = NEW.`updated_at`
  WHERE `id` = NEW.`period_id` AND `reserved_count` > 0;
  SELECT CASE WHEN changes() != 1 THEN RAISE(ABORT, 'billing_reservation_missing') END;
  INSERT INTO `billing_usage_sites` (`period_id`,`site_id`,`site_label`,`persisted_count`,`updated_at`)
  VALUES (NEW.`period_id`,NEW.`site_id`,NEW.`site_label`,1,NEW.`updated_at`)
  ON CONFLICT (`period_id`,`site_id`) DO UPDATE SET
    `site_label` = excluded.`site_label`,
    `persisted_count` = `billing_usage_sites`.`persisted_count` + 1,
    `updated_at` = excluded.`updated_at`;
  INSERT INTO `billing_notification_jobs` (`id`,`workspace_id`,`period_id`,`kind`,`entitlement_revision`,`dedupe_key`,`state`,`attempts`,`next_attempt_at`,`created_at`,`updated_at`)
  SELECT NEW.`period_id` || ':' || `allowance` || ':' || `admission_ceiling` || ':usage_80',`workspace_id`,NEW.`period_id`,'usage_80',NEW.`period_id` || ':' || `allowance` || ':' || `admission_ceiling`,NEW.`period_id` || ':' || `allowance` || ':' || `admission_ceiling` || ':usage_80','pending',0,NEW.`updated_at`,NEW.`updated_at`,NEW.`updated_at`
  FROM `billing_usage_periods`
  WHERE `id` = NEW.`period_id` AND `persisted_count` * 5 >= `allowance` * 4
  ON CONFLICT (`dedupe_key`) DO NOTHING;
  UPDATE `billing_usage_periods` SET `notified_80_at` = coalesce(`notified_80_at`,NEW.`updated_at`)
  WHERE `id` = NEW.`period_id` AND `persisted_count` * 5 >= `allowance` * 4;
  INSERT INTO `billing_notification_jobs` (`id`,`workspace_id`,`period_id`,`kind`,`entitlement_revision`,`dedupe_key`,`state`,`attempts`,`next_attempt_at`,`created_at`,`updated_at`)
  SELECT NEW.`period_id` || ':' || `allowance` || ':' || `admission_ceiling` || ':usage_100',`workspace_id`,NEW.`period_id`,'usage_100',NEW.`period_id` || ':' || `allowance` || ':' || `admission_ceiling`,NEW.`period_id` || ':' || `allowance` || ':' || `admission_ceiling` || ':usage_100','pending',0,NEW.`updated_at`,NEW.`updated_at`,NEW.`updated_at`
  FROM `billing_usage_periods`
  WHERE `id` = NEW.`period_id` AND `persisted_count` >= `allowance`
  ON CONFLICT (`dedupe_key`) DO NOTHING;
  UPDATE `billing_usage_periods` SET `notified_100_at` = coalesce(`notified_100_at`,NEW.`updated_at`)
  WHERE `id` = NEW.`period_id` AND `persisted_count` >= `allowance`;
  INSERT INTO `billing_notification_jobs` (`id`,`workspace_id`,`period_id`,`kind`,`entitlement_revision`,`dedupe_key`,`state`,`attempts`,`next_attempt_at`,`created_at`,`updated_at`)
  SELECT NEW.`period_id` || ':' || `allowance` || ':' || `admission_ceiling` || ':usage_ceiling',`workspace_id`,NEW.`period_id`,'usage_ceiling',NEW.`period_id` || ':' || `allowance` || ':' || `admission_ceiling`,NEW.`period_id` || ':' || `allowance` || ':' || `admission_ceiling` || ':usage_ceiling','pending',0,NEW.`updated_at`,NEW.`updated_at`,NEW.`updated_at`
  FROM `billing_usage_periods`
  WHERE `id` = NEW.`period_id` AND `persisted_count` >= `admission_ceiling`
  ON CONFLICT (`dedupe_key`) DO NOTHING;
  UPDATE `billing_usage_periods` SET `notified_ceiling_at` = coalesce(`notified_ceiling_at`,NEW.`updated_at`)
  WHERE `id` = NEW.`period_id` AND `persisted_count` >= `admission_ceiling`;
END;
--> statement-breakpoint
CREATE TRIGGER `billing_receipt_release` AFTER UPDATE OF `state` ON `billing_event_receipts`
WHEN OLD.`state` = 'reserved' AND NEW.`state` IN ('released','rejected','expired')
BEGIN
  UPDATE `billing_usage_periods`
  SET `reserved_count` = `reserved_count` - 1, `updated_at` = NEW.`updated_at`
  WHERE `id` = NEW.`period_id` AND `reserved_count` > 0;
  SELECT CASE WHEN changes() != 1 THEN RAISE(ABORT, 'billing_reservation_missing') END;
END;
--> statement-breakpoint
CREATE TRIGGER `events_billing_receipt_guard` BEFORE INSERT ON `events`
WHEN NEW.`billing_receipt_id` IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `billing_event_receipts`
    WHERE `id` = NEW.`billing_receipt_id`
      AND `site_id` = NEW.`site_id`
      AND `event_id` = NEW.`id`
      AND `state` = 'reserved'
  ) THEN RAISE(ABORT, 'billing_receipt_not_reserved') END;
END;
--> statement-breakpoint
CREATE TRIGGER `events_billing_receipt_persist` AFTER INSERT ON `events`
WHEN NEW.`billing_receipt_id` IS NOT NULL
BEGIN
  UPDATE `billing_event_receipts`
  SET `state` = 'persisted',
      `publish_state` = 'published',
      `persisted_at` = cast(unixepoch('subsecond') * 1000 as integer),
      `updated_at` = cast(unixepoch('subsecond') * 1000 as integer)
  WHERE `id` = NEW.`billing_receipt_id` AND `state` = 'reserved';
  SELECT CASE WHEN changes() != 1 THEN RAISE(ABORT, 'billing_receipt_not_finalized') END;
END;
