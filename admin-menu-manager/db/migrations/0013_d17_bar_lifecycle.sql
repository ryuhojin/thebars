PRAGMA foreign_keys = OFF;

CREATE TABLE publications_d17_new (
  id TEXT PRIMARY KEY,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (
    status IN (
      'pending',
      'building_json',
      'validating_json',
      'committing_github',
      'waiting_cloudflare',
      'success',
      'failed',
      'timeout_unknown'
    )
  ),
  operation TEXT CHECK (
    operation IS NULL OR operation IN (
      'menu_json',
      'trigger',
      'snapshot_republish',
      'delete_menu_json',
      'restore_snapshot',
      'restore_preparing'
    )
  ),
  revision INTEGER NOT NULL CHECK (revision >= 0),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  menu_path TEXT NOT NULL CHECK (menu_path GLOB 'public/menus/*.json'),
  trigger_path TEXT NOT NULL CHECK (trigger_path GLOB 'public/publish-triggers/*.json'),
  published_at TEXT,
  commit_sha TEXT,
  deployment_id TEXT,
  deployment_status TEXT CHECK (
    deployment_status IS NULL OR deployment_status IN (
      'queued',
      'building',
      'success',
      'failed',
      'timeout_unknown'
    )
  ),
  deployment_source_commit_sha TEXT,
  deployment_url TEXT,
  deployment_started_at TEXT,
  deployment_checked_at TEXT,
  deployment_completed_at TEXT,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

INSERT INTO publications_d17_new (
  id,
  bar_id,
  status,
  operation,
  revision,
  content_hash,
  menu_path,
  trigger_path,
  published_at,
  commit_sha,
  deployment_id,
  deployment_status,
  deployment_source_commit_sha,
  deployment_url,
  deployment_started_at,
  deployment_checked_at,
  deployment_completed_at,
  actor_user_id,
  error_code,
  error_message,
  created_at,
  completed_at
)
SELECT
  id,
  bar_id,
  status,
  operation,
  revision,
  content_hash,
  menu_path,
  trigger_path,
  published_at,
  commit_sha,
  deployment_id,
  deployment_status,
  deployment_source_commit_sha,
  deployment_url,
  deployment_started_at,
  deployment_checked_at,
  deployment_completed_at,
  actor_user_id,
  error_code,
  error_message,
  created_at,
  completed_at
FROM publications;

DROP TABLE publications;
ALTER TABLE publications_d17_new RENAME TO publications;

CREATE INDEX IF NOT EXISTS publications_bar_created_idx
  ON publications (bar_id, created_at DESC);

CREATE INDEX IF NOT EXISTS publications_bar_status_idx
  ON publications (bar_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS publications_bar_deployment_idx
  ON publications (bar_id, deployment_status, created_at DESC);

CREATE TABLE bar_lifecycle_events (
  id TEXT PRIMARY KEY,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('deactivate', 'activate')),
  before_status TEXT NOT NULL CHECK (before_status IN ('active', 'inactive')),
  after_status TEXT NOT NULL CHECK (after_status IN ('active', 'inactive')),
  publication_id TEXT REFERENCES publications(id) ON DELETE SET NULL,
  result TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS bar_lifecycle_events_bar_created_idx
  ON bar_lifecycle_events (bar_id, created_at DESC);

PRAGMA foreign_keys = ON;
