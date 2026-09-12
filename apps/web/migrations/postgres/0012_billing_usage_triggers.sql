CREATE FUNCTION billing_reserve_receipt() RETURNS trigger AS $$
BEGIN
  IF NEW.state = 'reserved' THEN
    UPDATE billing_usage_periods
    SET reserved_count = reserved_count + 1, updated_at = NEW.updated_at
    WHERE id = NEW.period_id
      AND workspace_id = NEW.workspace_id
      AND NEW.ingressed_at >= starts_at
      AND NEW.ingressed_at < ends_at
      AND persisted_count + reserved_count < admission_ceiling;
    IF NOT FOUND THEN RAISE EXCEPTION 'billing_capacity_unavailable'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER billing_receipt_reserve BEFORE INSERT ON billing_event_receipts
FOR EACH ROW EXECUTE FUNCTION billing_reserve_receipt();
--> statement-breakpoint
CREATE FUNCTION billing_transition_receipt() RETURNS trigger AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.site_id IS DISTINCT FROM OLD.site_id
    OR NEW.site_label IS DISTINCT FROM OLD.site_label
    OR NEW.event_id IS DISTINCT FROM OLD.event_id
    OR NEW.period_id IS DISTINCT FROM OLD.period_id
    OR NEW.ingressed_at IS DISTINCT FROM OLD.ingressed_at
    OR NEW.payload IS DISTINCT FROM OLD.payload
    OR NEW.replay_until IS DISTINCT FROM OLD.replay_until
  THEN RAISE EXCEPTION 'billing_receipt_immutable'; END IF;

  IF NOT (NEW.state = OLD.state OR
    (OLD.state = 'reserved' AND NEW.state IN ('persisted','released','rejected','expired')))
  THEN RAISE EXCEPTION 'billing_receipt_invalid_transition'; END IF;

  IF OLD.state = 'reserved' AND NEW.state = 'persisted' THEN
    UPDATE billing_usage_periods
    SET reserved_count = reserved_count - 1,
        persisted_count = persisted_count + 1,
        updated_at = NEW.updated_at
    WHERE id = NEW.period_id AND reserved_count > 0;
    IF NOT FOUND THEN RAISE EXCEPTION 'billing_reservation_missing'; END IF;
    INSERT INTO billing_usage_sites (period_id,site_id,site_label,persisted_count,updated_at)
    VALUES (NEW.period_id,NEW.site_id,NEW.site_label,1,NEW.updated_at)
    ON CONFLICT (period_id,site_id) DO UPDATE SET
      site_label = excluded.site_label,
      persisted_count = billing_usage_sites.persisted_count + 1,
      updated_at = excluded.updated_at;
    INSERT INTO billing_notification_jobs (id,workspace_id,period_id,kind,entitlement_revision,dedupe_key,state,attempts,next_attempt_at,created_at,updated_at)
    SELECT NEW.period_id || ':' || allowance || ':' || admission_ceiling || ':usage_80',workspace_id,NEW.period_id,'usage_80',NEW.period_id || ':' || allowance || ':' || admission_ceiling,NEW.period_id || ':' || allowance || ':' || admission_ceiling || ':usage_80','pending',0,NEW.updated_at,NEW.updated_at,NEW.updated_at
    FROM billing_usage_periods
    WHERE id = NEW.period_id AND persisted_count * 5 >= allowance * 4
    ON CONFLICT (dedupe_key) DO NOTHING;
    UPDATE billing_usage_periods SET notified_80_at = coalesce(notified_80_at,NEW.updated_at)
    WHERE id = NEW.period_id AND persisted_count * 5 >= allowance * 4;
    INSERT INTO billing_notification_jobs (id,workspace_id,period_id,kind,entitlement_revision,dedupe_key,state,attempts,next_attempt_at,created_at,updated_at)
    SELECT NEW.period_id || ':' || allowance || ':' || admission_ceiling || ':usage_100',workspace_id,NEW.period_id,'usage_100',NEW.period_id || ':' || allowance || ':' || admission_ceiling,NEW.period_id || ':' || allowance || ':' || admission_ceiling || ':usage_100','pending',0,NEW.updated_at,NEW.updated_at,NEW.updated_at
    FROM billing_usage_periods
    WHERE id = NEW.period_id AND persisted_count >= allowance
    ON CONFLICT (dedupe_key) DO NOTHING;
    UPDATE billing_usage_periods SET notified_100_at = coalesce(notified_100_at,NEW.updated_at)
    WHERE id = NEW.period_id AND persisted_count >= allowance;
    INSERT INTO billing_notification_jobs (id,workspace_id,period_id,kind,entitlement_revision,dedupe_key,state,attempts,next_attempt_at,created_at,updated_at)
    SELECT NEW.period_id || ':' || allowance || ':' || admission_ceiling || ':usage_ceiling',workspace_id,NEW.period_id,'usage_ceiling',NEW.period_id || ':' || allowance || ':' || admission_ceiling,NEW.period_id || ':' || allowance || ':' || admission_ceiling || ':usage_ceiling','pending',0,NEW.updated_at,NEW.updated_at,NEW.updated_at
    FROM billing_usage_periods
    WHERE id = NEW.period_id AND persisted_count >= admission_ceiling
    ON CONFLICT (dedupe_key) DO NOTHING;
    UPDATE billing_usage_periods SET notified_ceiling_at = coalesce(notified_ceiling_at,NEW.updated_at)
    WHERE id = NEW.period_id AND persisted_count >= admission_ceiling;
  ELSIF OLD.state = 'reserved' AND NEW.state IN ('released','rejected','expired') THEN
    UPDATE billing_usage_periods
    SET reserved_count = reserved_count - 1, updated_at = NEW.updated_at
    WHERE id = NEW.period_id AND reserved_count > 0;
    IF NOT FOUND THEN RAISE EXCEPTION 'billing_reservation_missing'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER billing_receipt_transition BEFORE UPDATE ON billing_event_receipts
FOR EACH ROW EXECUTE FUNCTION billing_transition_receipt();
--> statement-breakpoint
CREATE FUNCTION billing_guard_event_receipt() RETURNS trigger AS $$
BEGIN
  IF NEW.billing_receipt_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM billing_event_receipts
    WHERE id = NEW.billing_receipt_id
      AND site_id = NEW.site_id
      AND event_id = NEW.id
      AND state = 'reserved'
  ) THEN RAISE EXCEPTION 'billing_receipt_not_reserved'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER events_billing_receipt_guard BEFORE INSERT ON events
FOR EACH ROW EXECUTE FUNCTION billing_guard_event_receipt();
--> statement-breakpoint
CREATE FUNCTION billing_persist_event_receipt() RETURNS trigger AS $$
BEGIN
  IF NEW.billing_receipt_id IS NOT NULL THEN
    UPDATE billing_event_receipts
    SET state = 'persisted',
        publish_state = 'published',
        persisted_at = floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
        updated_at = floor(extract(epoch from clock_timestamp()) * 1000)::bigint
    WHERE id = NEW.billing_receipt_id AND state = 'reserved';
    IF NOT FOUND THEN RAISE EXCEPTION 'billing_receipt_not_finalized'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER events_billing_receipt_persist AFTER INSERT ON events
FOR EACH ROW EXECUTE FUNCTION billing_persist_event_receipt();
