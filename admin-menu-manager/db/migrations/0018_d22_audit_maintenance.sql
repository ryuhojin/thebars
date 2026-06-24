CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  request_id TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_username TEXT NOT NULL DEFAULT '',
  bar_id TEXT REFERENCES bars(id) ON DELETE SET NULL,
  bar_name TEXT NOT NULL DEFAULT '',
  operation TEXT NOT NULL CHECK (
    operation IN (
      'auth.login_failed',
      'auth.login_succeeded',
      'user.created',
      'user.updated',
      'user.unlocked',
      'membership.changed',
      'permission.changed',
      'bar.created',
      'bar.lifecycle_changed',
      'bar.settings_updated',
      'publication.requested',
      'publication.republished',
      'order_tab.item_voided',
      'order_tab.adjusted',
      'order_tab.settled',
      'order_tab.cancelled',
      'category.changed',
      'menu_item.changed',
      'badge.changed',
      'item_type.changed',
      'maintenance.retention'
    )
  ),
  result TEXT NOT NULL CHECK (result IN ('success', 'failure')),
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  target_label TEXT NOT NULL DEFAULT '',
  error_code TEXT,
  external_ref TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS audit_logs_occurred_idx
  ON audit_logs (occurred_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_actor_idx
  ON audit_logs (actor_user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_bar_idx
  ON audit_logs (bar_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_operation_idx
  ON audit_logs (operation, occurred_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_request_idx
  ON audit_logs (request_id);

CREATE TABLE IF NOT EXISTS maintenance_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_username TEXT NOT NULL DEFAULT '',
  request_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('dry_run', 'completed', 'failed')),
  operation TEXT NOT NULL DEFAULT 'retention_cleanup' CHECK (operation = 'retention_cleanup'),
  dry_run INTEGER NOT NULL DEFAULT 1 CHECK (dry_run IN (0, 1)),
  result_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS maintenance_runs_started_idx
  ON maintenance_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS maintenance_runs_actor_idx
  ON maintenance_runs (actor_user_id, started_at DESC);
