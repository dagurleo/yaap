CREATE TABLE bot_tracking_tokens (
  site_id text PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  token_hash text NOT NULL
);
--> statement-breakpoint
CREATE TABLE bot_requests (
  site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  id text NOT NULL,
  received_at INTEGER NOT NULL,
  path text NOT NULL,
  name text NOT NULL,
  provider text NOT NULL,
  category text NOT NULL CHECK (category IN ('ai_answers', 'indexing', 'training', 'other')),
  source text NOT NULL CHECK (source IN ('server', 'browser')),
  detection text NOT NULL CHECK (detection IN ('user_agent', 'cloudflare')),
  status_code INTEGER,
  PRIMARY KEY (site_id, id)
);
--> statement-breakpoint
CREATE INDEX bot_requests_site_time ON bot_requests(site_id, received_at);
--> statement-breakpoint
CREATE INDEX bot_requests_time ON bot_requests(received_at);
