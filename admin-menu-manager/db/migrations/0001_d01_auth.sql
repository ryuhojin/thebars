CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  normalized_username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_system_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_system_admin IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  forced_password_change INTEGER NOT NULL DEFAULT 0 CHECK (forced_password_change IN (0, 1)),
  login_failed_count INTEGER NOT NULL DEFAULT 0 CHECK (login_failed_count >= 0),
  locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  password_changed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS users_normalized_username_unique
  ON users (normalized_username);

CREATE INDEX IF NOT EXISTS users_system_admin_idx
  ON users (is_system_admin);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  csrf_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_touched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_unique
  ON sessions (token_hash);

CREATE INDEX IF NOT EXISTS sessions_user_active_idx
  ON sessions (user_id, revoked_at, expires_at);
