CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  public_id TEXT NOT NULL CHECK (
    substr(public_id, 1, 4) = 'cat_'
    AND substr(public_id, 5, 1) BETWEEN '1' AND '9'
    AND substr(public_id, 5) NOT GLOB '*[^0-9]*'
  ),
  parent_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 30),
  normalized_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 100),
  show_description INTEGER NOT NULL DEFAULT 0 CHECK (show_description IN (0, 1)),
  is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE UNIQUE INDEX IF NOT EXISTS categories_bar_public_id_unique
  ON categories (bar_id, public_id);

CREATE UNIQUE INDEX IF NOT EXISTS categories_bar_root_name_unique
  ON categories (bar_id, normalized_name)
  WHERE parent_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS categories_bar_parent_name_unique
  ON categories (bar_id, parent_id, normalized_name)
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS categories_bar_parent_order_idx
  ON categories (bar_id, parent_id, sort_order);

CREATE INDEX IF NOT EXISTS categories_bar_parent_idx
  ON categories (bar_id, parent_id);

CREATE INDEX IF NOT EXISTS categories_updated_by_idx
  ON categories (updated_by_user_id);
