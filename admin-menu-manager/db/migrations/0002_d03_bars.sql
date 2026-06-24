CREATE TABLE IF NOT EXISTS bars (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  slug TEXT NOT NULL,
  encoded_slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency = upper(currency)),
  public_menu_status TEXT NOT NULL DEFAULT 'preparing' CHECK (public_menu_status IN ('preparing', 'published')),
  direct_publish_enabled INTEGER NOT NULL DEFAULT 0 CHECK (direct_publish_enabled IN (0, 1)),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS bars_slug_unique
  ON bars (slug);

CREATE UNIQUE INDEX IF NOT EXISTS bars_encoded_slug_unique
  ON bars (encoded_slug);

CREATE INDEX IF NOT EXISTS bars_status_idx
  ON bars (status);

CREATE TABLE IF NOT EXISTS bar_public_counters (
  bar_id TEXT PRIMARY KEY REFERENCES bars(id) ON DELETE CASCADE,
  next_category_public_id INTEGER NOT NULL DEFAULT 1 CHECK (next_category_public_id > 0),
  next_menu_item_public_id INTEGER NOT NULL DEFAULT 1 CHECK (next_menu_item_public_id > 0),
  next_publication_revision INTEGER NOT NULL DEFAULT 1 CHECK (next_publication_revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
