PRAGMA foreign_keys = OFF;

CREATE TABLE order_tab_events_d20_new (
  id TEXT PRIMARY KEY,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  order_tab_id TEXT NOT NULL REFERENCES order_tabs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'tab_created',
      'tab_updated',
      'menu_item_added',
      'custom_item_added',
      'adjustment_added',
      'item_quantity_updated',
      'item_voided'
    )
  ),
  before_status TEXT CHECK (before_status IS NULL OR before_status IN ('open', 'checkout_requested', 'closed', 'cancelled')),
  after_status TEXT NOT NULL CHECK (after_status IN ('open', 'checkout_requested', 'closed', 'cancelled')),
  expected_version INTEGER CHECK (expected_version IS NULL OR expected_version >= 1),
  resulting_version INTEGER NOT NULL CHECK (resulting_version >= 1),
  note TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

INSERT INTO order_tab_events_d20_new (
  id,
  bar_id,
  order_tab_id,
  event_type,
  before_status,
  after_status,
  expected_version,
  resulting_version,
  note,
  actor_user_id,
  created_at
)
SELECT
  id,
  bar_id,
  order_tab_id,
  event_type,
  before_status,
  after_status,
  expected_version,
  resulting_version,
  note,
  actor_user_id,
  created_at
FROM order_tab_events;

DROP TABLE order_tab_events;
ALTER TABLE order_tab_events_d20_new RENAME TO order_tab_events;

CREATE INDEX IF NOT EXISTS order_tab_events_tab_created_idx
  ON order_tab_events (order_tab_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_tab_events_bar_created_idx
  ON order_tab_events (bar_id, created_at DESC);

CREATE TABLE order_tab_items_d20_new (
  id TEXT PRIMARY KEY,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  order_tab_id TEXT NOT NULL REFERENCES order_tabs(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('menu', 'custom', 'adjustment')),
  status TEXT NOT NULL CHECK (status IN ('active', 'voided')),
  menu_item_id TEXT REFERENCES menu_items(id) ON DELETE SET NULL,
  menu_item_public_id TEXT,
  menu_item_name TEXT NOT NULL CHECK (length(menu_item_name) BETWEEN 1 AND 80),
  menu_item_price_id TEXT REFERENCES menu_item_prices(id) ON DELETE SET NULL,
  price_label TEXT NOT NULL CHECK (length(price_label) BETWEEN 1 AND 40),
  volume_text TEXT NOT NULL DEFAULT '' CHECK (length(volume_text) <= 40),
  unit_amount_minor INTEGER NOT NULL CHECK (unit_amount_minor BETWEEN -10000000 AND 10000000),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  line_total_amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  reason TEXT CHECK (reason IS NULL OR length(reason) BETWEEN 1 AND 160),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  void_reason TEXT CHECK (void_reason IS NULL OR length(void_reason) BETWEEN 1 AND 160),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  voided_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  voided_at TEXT,
  CHECK (line_total_amount_minor = unit_amount_minor * quantity),
  CHECK (
    (status = 'active' AND void_reason IS NULL AND voided_at IS NULL AND voided_by_user_id IS NULL)
    OR
    (status = 'voided' AND void_reason IS NOT NULL AND voided_at IS NOT NULL)
  ),
  CHECK (
    (
      item_type = 'menu'
      AND menu_item_id IS NOT NULL
      AND menu_item_public_id IS NOT NULL
      AND menu_item_price_id IS NOT NULL
      AND reason IS NULL
      AND unit_amount_minor >= 0
      AND line_total_amount_minor >= 0
    )
    OR
    (
      item_type = 'custom'
      AND menu_item_id IS NULL
      AND menu_item_public_id IS NULL
      AND menu_item_price_id IS NULL
      AND reason IS NOT NULL
      AND unit_amount_minor >= 0
      AND line_total_amount_minor >= 0
    )
    OR
    (
      item_type = 'adjustment'
      AND menu_item_id IS NULL
      AND menu_item_public_id IS NULL
      AND menu_item_price_id IS NULL
      AND reason IS NOT NULL
      AND quantity = 1
      AND unit_amount_minor <> 0
    )
  )
);

INSERT INTO order_tab_items_d20_new (
  id,
  bar_id,
  order_tab_id,
  item_type,
  status,
  menu_item_id,
  menu_item_public_id,
  menu_item_name,
  menu_item_price_id,
  price_label,
  volume_text,
  unit_amount_minor,
  quantity,
  line_total_amount_minor,
  currency,
  reason,
  version,
  void_reason,
  created_by_user_id,
  updated_by_user_id,
  voided_by_user_id,
  created_at,
  updated_at,
  voided_at
)
SELECT
  id,
  bar_id,
  order_tab_id,
  item_type,
  status,
  menu_item_id,
  menu_item_public_id,
  menu_item_name,
  menu_item_price_id,
  price_label,
  volume_text,
  unit_amount_minor,
  quantity,
  line_total_amount_minor,
  currency,
  NULL,
  version,
  void_reason,
  created_by_user_id,
  updated_by_user_id,
  voided_by_user_id,
  created_at,
  updated_at,
  voided_at
FROM order_tab_items;

DROP TABLE order_tab_items;
ALTER TABLE order_tab_items_d20_new RENAME TO order_tab_items;

CREATE INDEX IF NOT EXISTS order_tab_items_tab_status_idx
  ON order_tab_items (order_tab_id, status, created_at);

CREATE INDEX IF NOT EXISTS order_tab_items_bar_menu_idx
  ON order_tab_items (bar_id, menu_item_id);

CREATE TABLE idempotency_keys_d20_new (
  id TEXT PRIMARY KEY,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN ('order_item_add', 'order_custom_item_add', 'order_adjustment_add')),
  scope_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 120),
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL CHECK (response_status BETWEEN 200 AND 599),
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

INSERT INTO idempotency_keys_d20_new (
  id,
  bar_id,
  actor_user_id,
  operation,
  scope_id,
  idempotency_key,
  request_hash,
  response_status,
  response_json,
  created_at,
  expires_at
)
SELECT
  id,
  bar_id,
  actor_user_id,
  operation,
  scope_id,
  idempotency_key,
  request_hash,
  response_status,
  response_json,
  created_at,
  expires_at
FROM idempotency_keys;

DROP TABLE idempotency_keys;
ALTER TABLE idempotency_keys_d20_new RENAME TO idempotency_keys;

CREATE UNIQUE INDEX IF NOT EXISTS idempotency_keys_scope_unique
  ON idempotency_keys (bar_id, actor_user_id, operation, scope_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idempotency_keys_expiry_idx
  ON idempotency_keys (expires_at);

PRAGMA foreign_keys = ON;
