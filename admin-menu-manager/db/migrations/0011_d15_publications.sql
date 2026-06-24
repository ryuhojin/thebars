CREATE TABLE IF NOT EXISTS publications (
  id TEXT PRIMARY KEY,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (
    status IN (
      'pending',
      'building_json',
      'validating_json',
      'committing_github',
      'success',
      'failed',
      'timeout_unknown'
    )
  ),
  operation TEXT CHECK (operation IS NULL OR operation IN ('menu_json', 'trigger')),
  revision INTEGER NOT NULL CHECK (revision >= 0),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  menu_path TEXT NOT NULL CHECK (menu_path GLOB 'public/menus/*.json'),
  trigger_path TEXT NOT NULL CHECK (trigger_path GLOB 'public/publish-triggers/*.json'),
  published_at TEXT,
  commit_sha TEXT,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS publications_bar_created_idx
  ON publications (bar_id, created_at DESC);

CREATE INDEX IF NOT EXISTS publications_bar_status_idx
  ON publications (bar_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS publication_snapshots (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  public_json TEXT NOT NULL,
  menu_path TEXT NOT NULL CHECK (menu_path GLOB 'public/menus/*.json'),
  commit_sha TEXT NOT NULL,
  published_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS publication_snapshots_publication_unique
  ON publication_snapshots (publication_id);

CREATE INDEX IF NOT EXISTS publication_snapshots_bar_created_idx
  ON publication_snapshots (bar_id, created_at DESC);

CREATE INDEX IF NOT EXISTS publication_snapshots_bar_hash_idx
  ON publication_snapshots (bar_id, content_hash);

CREATE TABLE IF NOT EXISTS publication_locks (
  bar_id TEXT PRIMARY KEY REFERENCES bars(id) ON DELETE CASCADE,
  owner_token TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repository_commit_lock (
  id TEXT PRIMARY KEY CHECK (id = 'customer-repo'),
  owner_token TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL
);
