-- Match D1's event maintenance invariants. Updates invalidate both old and new keys.
-- Serialize mutations per site before changing events. Rollup transactions acquire
-- the same lock so they cannot publish a summary across a concurrent event write.
CREATE FUNCTION yaap_lock_event_site() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.site_id <> NEW.site_id THEN
    PERFORM 1 FROM sites WHERE id IN (OLD.site_id, NEW.site_id) ORDER BY id FOR UPDATE;
  ELSE
    PERFORM 1 FROM sites WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.site_id ELSE NEW.site_id END FOR UPDATE;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER events_lock BEFORE INSERT OR UPDATE OR DELETE ON events FOR EACH ROW EXECUTE FUNCTION yaap_lock_event_site();
--> statement-breakpoint
CREATE FUNCTION yaap_maintain_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    DELETE FROM rollup_days WHERE site_id=OLD.site_id AND day=(OLD.received_at/86400000)*86400000;
    INSERT INTO rollup_pending(site_id,day) VALUES(OLD.site_id,(OLD.received_at/86400000)*86400000) ON CONFLICT DO NOTHING;
    DELETE FROM session_summaries WHERE site_id=OLD.site_id AND visitor_id=OLD.visitor_id AND session_id=OLD.session_id;
    IF OLD.visitor_id IS NOT NULL THEN
      DELETE FROM visitor_first_seen WHERE site_id=OLD.site_id AND visitor_id=OLD.visitor_id;
      INSERT INTO visitor_first_seen(site_id,visitor_id,first_at)
        SELECT OLD.site_id,OLD.visitor_id,min(received_at) FROM events
        WHERE site_id=OLD.site_id AND visitor_id=OLD.visitor_id HAVING count(*)>0
        ON CONFLICT(site_id,visitor_id) DO UPDATE SET first_at=excluded.first_at;
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    DELETE FROM rollup_days WHERE site_id=NEW.site_id AND day=(NEW.received_at/86400000)*86400000;
    INSERT INTO rollup_pending(site_id,day) VALUES(NEW.site_id,(NEW.received_at/86400000)*86400000) ON CONFLICT DO NOTHING;
    DELETE FROM session_summaries WHERE site_id=NEW.site_id AND visitor_id=NEW.visitor_id AND session_id=NEW.session_id;
    IF NEW.visitor_id IS NOT NULL THEN
      INSERT INTO visitor_first_seen(site_id,visitor_id,first_at) VALUES(NEW.site_id,NEW.visitor_id,NEW.received_at)
        ON CONFLICT(site_id,visitor_id) DO UPDATE SET first_at=least(visitor_first_seen.first_at,excluded.first_at);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER events_maintenance AFTER INSERT OR UPDATE OR DELETE ON events FOR EACH ROW EXECUTE FUNCTION yaap_maintain_event();
