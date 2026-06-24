CREATE TABLE IF NOT EXISTS system_item_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 30),
  normalized_name TEXT NOT NULL,
  template TEXT NOT NULL CHECK (template IN ('general', 'wine', 'whisky', 'spirit', 'beer', 'cocktail', 'food', 'cigar')),
  default_price_labels_json TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS system_item_types_normalized_name_unique
  ON system_item_types (normalized_name);

CREATE INDEX IF NOT EXISTS system_item_types_active_idx
  ON system_item_types (is_active);

CREATE TABLE IF NOT EXISTS bar_item_types (
  id TEXT PRIMARY KEY,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 30),
  normalized_name TEXT NOT NULL,
  template TEXT NOT NULL CHECK (template IN ('general', 'wine', 'whisky', 'spirit', 'beer', 'cocktail', 'food', 'cigar')),
  default_price_labels_json TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS bar_item_types_bar_normalized_name_unique
  ON bar_item_types (bar_id, normalized_name);

CREATE INDEX IF NOT EXISTS bar_item_types_bar_active_idx
  ON bar_item_types (bar_id, is_active);

CREATE TABLE IF NOT EXISTS bar_item_type_overrides (
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  system_item_type_id TEXT NOT NULL REFERENCES system_item_types(id) ON DELETE CASCADE,
  is_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0, 1)),
  default_price_labels_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (bar_id, system_item_type_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS bar_item_type_overrides_bar_system_unique
  ON bar_item_type_overrides (bar_id, system_item_type_id);

CREATE TABLE IF NOT EXISTS grape_varieties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  normalized_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS grape_varieties_normalized_name_unique
  ON grape_varieties (normalized_name);

CREATE TABLE IF NOT EXISTS grape_variety_candidates (
  id TEXT PRIMARY KEY,
  bar_id TEXT REFERENCES bars(id) ON DELETE SET NULL,
  proposed_name TEXT NOT NULL CHECK (length(trim(proposed_name)) BETWEEN 1 AND 60),
  normalized_proposed_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  standard_name TEXT CHECK (standard_name IS NULL OR length(trim(standard_name)) BETWEEN 1 AND 60),
  submitted_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR length(rejection_reason) <= 200),
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS grape_variety_candidates_status_idx
  ON grape_variety_candidates (status, created_at);

CREATE INDEX IF NOT EXISTS grape_variety_candidates_normalized_idx
  ON grape_variety_candidates (normalized_proposed_name);

INSERT OR IGNORE INTO system_item_types (
  id, name, normalized_name, template, default_price_labels_json, is_active, created_at, updated_at
) VALUES
  ('system-type-general', '일반', '일반', 'general', '[]', 1, '2026-06-23T00:00:00.000Z', '2026-06-23T00:00:00.000Z'),
  ('system-type-wine', '와인', '와인', 'wine', '["글라스","보틀"]', 1, '2026-06-23T00:00:00.000Z', '2026-06-23T00:00:00.000Z'),
  ('system-type-whisky', '위스키', '위스키', 'whisky', '["샷","보틀"]', 1, '2026-06-23T00:00:00.000Z', '2026-06-23T00:00:00.000Z'),
  ('system-type-cocktail', '칵테일', '칵테일', 'cocktail', '["잔"]', 1, '2026-06-23T00:00:00.000Z', '2026-06-23T00:00:00.000Z'),
  ('system-type-cigar', '시가', '시가', 'cigar', '[]', 1, '2026-06-23T00:00:00.000Z', '2026-06-23T00:00:00.000Z');
