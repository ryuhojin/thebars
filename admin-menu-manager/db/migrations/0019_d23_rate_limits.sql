CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (
    scope IN (
      'auth.login',
      'auth.setup',
      'auth.recovery',
      'publication.publish',
      'order.settle'
    )
  ),
  key_hash TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS rate_limit_buckets_scope_key_unique
  ON rate_limit_buckets (scope, key_hash);

CREATE INDEX IF NOT EXISTS rate_limit_buckets_expiry_idx
  ON rate_limit_buckets (window_expires_at);
