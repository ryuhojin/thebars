CREATE TABLE IF NOT EXISTS badge_colors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 30),
  normalized_name TEXT NOT NULL,
  background_hex TEXT NOT NULL CHECK (background_hex GLOB '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]' OR background_hex GLOB '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]'),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS badge_colors_normalized_name_unique
  ON badge_colors (normalized_name);

CREATE INDEX IF NOT EXISTS badge_colors_active_idx
  ON badge_colors (is_active);

CREATE TABLE IF NOT EXISTS system_badges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 20),
  normalized_name TEXT NOT NULL,
  color_id TEXT NOT NULL REFERENCES badge_colors(id) ON DELETE RESTRICT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS system_badges_normalized_name_unique
  ON system_badges (normalized_name);

CREATE INDEX IF NOT EXISTS system_badges_color_idx
  ON system_badges (color_id);

CREATE INDEX IF NOT EXISTS system_badges_active_idx
  ON system_badges (is_active);

CREATE TABLE IF NOT EXISTS bar_badge_visibility (
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  system_badge_id TEXT NOT NULL REFERENCES system_badges(id) ON DELETE CASCADE,
  is_hidden INTEGER NOT NULL DEFAULT 1 CHECK (is_hidden IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (bar_id, system_badge_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS bar_badge_visibility_bar_system_unique
  ON bar_badge_visibility (bar_id, system_badge_id);

CREATE INDEX IF NOT EXISTS bar_badge_visibility_bar_hidden_idx
  ON bar_badge_visibility (bar_id, is_hidden);

CREATE TABLE IF NOT EXISTS bar_badges (
  id TEXT PRIMARY KEY,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 20),
  normalized_name TEXT NOT NULL,
  color_id TEXT NOT NULL REFERENCES badge_colors(id) ON DELETE RESTRICT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS bar_badges_bar_normalized_name_unique
  ON bar_badges (bar_id, normalized_name);

CREATE INDEX IF NOT EXISTS bar_badges_bar_active_idx
  ON bar_badges (bar_id, is_active);

CREATE INDEX IF NOT EXISTS bar_badges_color_idx
  ON bar_badges (color_id);

CREATE TABLE IF NOT EXISTS menu_item_badges (
  id TEXT PRIMARY KEY,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  menu_item_id TEXT NOT NULL,
  system_badge_id TEXT REFERENCES system_badges(id) ON DELETE CASCADE,
  bar_badge_id TEXT REFERENCES bar_badges(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL CHECK (display_order BETWEEN 0 AND 2),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (system_badge_id IS NOT NULL AND bar_badge_id IS NULL)
    OR (system_badge_id IS NULL AND bar_badge_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS menu_item_badges_menu_system_unique
  ON menu_item_badges (bar_id, menu_item_id, system_badge_id)
  WHERE system_badge_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS menu_item_badges_menu_bar_unique
  ON menu_item_badges (bar_id, menu_item_id, bar_badge_id)
  WHERE bar_badge_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS menu_item_badges_menu_order_idx
  ON menu_item_badges (bar_id, menu_item_id, display_order);

CREATE INDEX IF NOT EXISTS menu_item_badges_system_badge_idx
  ON menu_item_badges (system_badge_id);

CREATE INDEX IF NOT EXISTS menu_item_badges_bar_badge_idx
  ON menu_item_badges (bar_badge_id);

INSERT OR IGNORE INTO badge_colors (
  id, name, normalized_name, background_hex, is_active, created_at, updated_at
) VALUES
  ('badge-color-warm-brown', 'Warm Brown', 'warm brown', '#725A3D', 1, '2026-06-23T00:00:00.000Z', '2026-06-23T00:00:00.000Z'),
  ('badge-color-deep-slate', 'Deep Slate', 'deep slate', '#33475B', 1, '2026-06-23T00:00:00.000Z', '2026-06-23T00:00:00.000Z'),
  ('badge-color-muted-plum', 'Muted Plum', 'muted plum', '#5E3B56', 1, '2026-06-23T00:00:00.000Z', '2026-06-23T00:00:00.000Z'),
  ('badge-color-forest', 'Forest', 'forest', '#355B47', 1, '2026-06-23T00:00:00.000Z', '2026-06-23T00:00:00.000Z');

INSERT OR IGNORE INTO system_badges (
  id, name, normalized_name, color_id, is_active, created_at, updated_at
) VALUES
  ('system-badge-recommended', '추천', '추천', 'badge-color-warm-brown', 1, '2026-06-23T00:00:00.000Z', '2026-06-23T00:00:00.000Z'),
  ('system-badge-signature', '시그니처', '시그니처', 'badge-color-deep-slate', 1, '2026-06-23T00:00:00.000Z', '2026-06-23T00:00:00.000Z'),
  ('system-badge-new', '신메뉴', '신메뉴', 'badge-color-muted-plum', 1, '2026-06-23T00:00:00.000Z', '2026-06-23T00:00:00.000Z');
