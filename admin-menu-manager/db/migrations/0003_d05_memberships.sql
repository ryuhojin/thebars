CREATE TABLE IF NOT EXISTS bar_memberships (
  id TEXT PRIMARY KEY,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS bar_memberships_bar_user_unique
  ON bar_memberships (bar_id, user_id);

CREATE INDEX IF NOT EXISTS bar_memberships_bar_active_idx
  ON bar_memberships (bar_id, is_active);

CREATE INDEX IF NOT EXISTS bar_memberships_user_active_idx
  ON bar_memberships (user_id, is_active);

CREATE TABLE IF NOT EXISTS bar_role_permissions (
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  can_edit_menu INTEGER NOT NULL CHECK (can_edit_menu IN (0, 1)),
  can_manage_orders INTEGER NOT NULL CHECK (can_manage_orders IN (0, 1)),
  can_add_custom_order_item INTEGER NOT NULL CHECK (can_add_custom_order_item IN (0, 1)),
  can_apply_order_adjustment INTEGER NOT NULL CHECK (can_apply_order_adjustment IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (bar_id, role)
);

INSERT OR IGNORE INTO bar_role_permissions (
  bar_id, role, can_edit_menu, can_manage_orders,
  can_add_custom_order_item, can_apply_order_adjustment, created_at, updated_at
)
SELECT id, 'owner', 1, 1, 1, 1, created_at, created_at
FROM bars;

INSERT OR IGNORE INTO bar_role_permissions (
  bar_id, role, can_edit_menu, can_manage_orders,
  can_add_custom_order_item, can_apply_order_adjustment, created_at, updated_at
)
SELECT id, 'manager', 1, 1, 1, 1, created_at, created_at
FROM bars;

INSERT OR IGNORE INTO bar_role_permissions (
  bar_id, role, can_edit_menu, can_manage_orders,
  can_add_custom_order_item, can_apply_order_adjustment, created_at, updated_at
)
SELECT id, 'staff', 0, 1, 0, 0, created_at, created_at
FROM bars;
