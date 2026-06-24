PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS menu_item_badges_d12 (
  id TEXT PRIMARY KEY,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
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

INSERT OR IGNORE INTO menu_item_badges_d12 (
  id, bar_id, menu_item_id, system_badge_id, bar_badge_id, display_order, created_at, updated_at
)
SELECT
  menu_item_badges.id,
  menu_item_badges.bar_id,
  menu_item_badges.menu_item_id,
  menu_item_badges.system_badge_id,
  menu_item_badges.bar_badge_id,
  menu_item_badges.display_order,
  menu_item_badges.created_at,
  menu_item_badges.updated_at
FROM menu_item_badges
INNER JOIN menu_items
  ON menu_items.bar_id = menu_item_badges.bar_id
 AND menu_items.id = menu_item_badges.menu_item_id;

DROP TABLE menu_item_badges;
ALTER TABLE menu_item_badges_d12 RENAME TO menu_item_badges;

CREATE UNIQUE INDEX IF NOT EXISTS menu_item_badges_menu_system_unique
  ON menu_item_badges (bar_id, menu_item_id, system_badge_id)
  WHERE system_badge_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS menu_item_badges_menu_bar_unique
  ON menu_item_badges (bar_id, menu_item_id, bar_badge_id)
  WHERE bar_badge_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS menu_item_badges_menu_order_unique
  ON menu_item_badges (bar_id, menu_item_id, display_order);

CREATE INDEX IF NOT EXISTS menu_item_badges_menu_order_idx
  ON menu_item_badges (bar_id, menu_item_id, display_order);

CREATE INDEX IF NOT EXISTS menu_item_badges_system_badge_idx
  ON menu_item_badges (system_badge_id);

CREATE INDEX IF NOT EXISTS menu_item_badges_bar_badge_idx
  ON menu_item_badges (bar_badge_id);

PRAGMA foreign_keys = ON;
