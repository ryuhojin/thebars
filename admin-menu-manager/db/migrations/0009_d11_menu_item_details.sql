ALTER TABLE menu_items
  ADD COLUMN internal_memo TEXT NOT NULL DEFAULT '' CHECK (length(internal_memo) <= 2000);

CREATE TABLE IF NOT EXISTS menu_item_prices (
  id TEXT PRIMARY KEY,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 20),
  normalized_label TEXT NOT NULL,
  volume_text TEXT NOT NULL DEFAULT '' CHECK (length(volume_text) <= 20),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  display_order INTEGER NOT NULL CHECK (display_order >= 0),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS menu_item_prices_menu_label_unique
  ON menu_item_prices (bar_id, menu_item_id, normalized_label);

CREATE INDEX IF NOT EXISTS menu_item_prices_menu_order_idx
  ON menu_item_prices (bar_id, menu_item_id, display_order);

CREATE INDEX IF NOT EXISTS menu_item_prices_menu_idx
  ON menu_item_prices (menu_item_id);

CREATE TABLE IF NOT EXISTS menu_item_details (
  menu_item_id TEXT PRIMARY KEY REFERENCES menu_items(id) ON DELETE CASCADE,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  template TEXT NOT NULL CHECK (template IN ('general', 'wine', 'whisky', 'spirit', 'beer', 'cocktail', 'food', 'cigar')),
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  details_json TEXT NOT NULL CHECK (json_valid(details_json)),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS menu_item_details_bar_template_idx
  ON menu_item_details (bar_id, template);
