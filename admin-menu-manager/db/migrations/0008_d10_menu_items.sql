CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  public_id TEXT NOT NULL CHECK (
    substr(public_id, 1, 5) = 'menu_'
    AND substr(public_id, 6, 1) BETWEEN '1' AND '9'
    AND substr(public_id, 6) NOT GLOB '*[^0-9]*'
  ),
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  system_item_type_id TEXT REFERENCES system_item_types(id) ON DELETE RESTRICT,
  bar_item_type_id TEXT REFERENCES bar_item_types(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 50),
  normalized_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 200),
  sale_status TEXT NOT NULL DEFAULT 'available' CHECK (sale_status IN ('available', 'sold_out')),
  is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  abv_basis_points INTEGER CHECK (abv_basis_points IS NULL OR (abv_basis_points BETWEEN 0 AND 10000)),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (system_item_type_id IS NULL OR bar_item_type_id IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS menu_items_bar_public_id_unique
  ON menu_items (bar_id, public_id);

CREATE UNIQUE INDEX IF NOT EXISTS menu_items_bar_normalized_name_unique
  ON menu_items (bar_id, normalized_name);

CREATE INDEX IF NOT EXISTS menu_items_bar_category_order_idx
  ON menu_items (bar_id, category_id, sort_order);

CREATE INDEX IF NOT EXISTS menu_items_bar_sale_visibility_idx
  ON menu_items (bar_id, sale_status, is_visible);

CREATE INDEX IF NOT EXISTS menu_items_system_type_idx
  ON menu_items (system_item_type_id);

CREATE INDEX IF NOT EXISTS menu_items_bar_type_idx
  ON menu_items (bar_item_type_id);

CREATE INDEX IF NOT EXISTS menu_items_updated_by_idx
  ON menu_items (updated_by_user_id);
