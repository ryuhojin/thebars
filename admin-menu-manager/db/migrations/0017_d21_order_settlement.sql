PRAGMA foreign_keys = OFF;

CREATE TABLE order_tabs_d21_new (
  id TEXT PRIMARY KEY,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  tab_number INTEGER NOT NULL CHECK (tab_number >= 1),
  table_label TEXT NOT NULL CHECK (length(table_label) BETWEEN 1 AND 40),
  guest_description TEXT NOT NULL DEFAULT '' CHECK (length(guest_description) <= 200),
  status TEXT NOT NULL CHECK (status IN ('open', 'checkout_requested', 'closed', 'cancelled')),
  total_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (total_amount_minor >= 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  active_item_count INTEGER NOT NULL DEFAULT 0 CHECK (active_item_count >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  opened_at TEXT NOT NULL,
  checkout_requested_at TEXT,
  closed_at TEXT,
  cancelled_at TEXT,
  final_total_amount_minor INTEGER CHECK (final_total_amount_minor IS NULL OR final_total_amount_minor >= 0),
  settled_at TEXT,
  settled_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  cancelled_reason TEXT CHECK (cancelled_reason IS NULL OR length(cancelled_reason) BETWEEN 1 AND 160),
  cancelled_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    status <> 'closed'
    OR (closed_at IS NOT NULL AND settled_at IS NOT NULL AND final_total_amount_minor IS NOT NULL)
  ),
  CHECK (
    status <> 'cancelled'
    OR (cancelled_at IS NOT NULL AND cancelled_reason IS NOT NULL)
  )
);

INSERT INTO order_tabs_d21_new (
  id,
  bar_id,
  tab_number,
  table_label,
  guest_description,
  status,
  total_amount_minor,
  currency,
  active_item_count,
  version,
  opened_at,
  checkout_requested_at,
  closed_at,
  cancelled_at,
  final_total_amount_minor,
  settled_at,
  settled_by_user_id,
  cancelled_reason,
  cancelled_by_user_id,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
)
SELECT
  id,
  bar_id,
  tab_number,
  table_label,
  guest_description,
  status,
  total_amount_minor,
  currency,
  active_item_count,
  version,
  opened_at,
  checkout_requested_at,
  closed_at,
  cancelled_at,
  CASE WHEN status = 'closed' THEN total_amount_minor ELSE NULL END,
  CASE WHEN status = 'closed' THEN COALESCE(closed_at, updated_at) ELSE NULL END,
  CASE WHEN status = 'closed' THEN updated_by_user_id ELSE NULL END,
  CASE WHEN status = 'cancelled' THEN 'migration' ELSE NULL END,
  CASE WHEN status = 'cancelled' THEN updated_by_user_id ELSE NULL END,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
FROM order_tabs;

DROP TABLE order_tabs;
ALTER TABLE order_tabs_d21_new RENAME TO order_tabs;

CREATE UNIQUE INDEX IF NOT EXISTS order_tabs_bar_tab_number_unique
  ON order_tabs (bar_id, tab_number);

CREATE INDEX IF NOT EXISTS order_tabs_bar_status_updated_idx
  ON order_tabs (bar_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS order_tabs_bar_label_idx
  ON order_tabs (bar_id, table_label);

CREATE TABLE order_tab_events_d21_new (
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
      'item_voided',
      'checkout_requested',
      'tab_reopened',
      'tab_settled',
      'tab_cancelled'
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

INSERT INTO order_tab_events_d21_new (
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
ALTER TABLE order_tab_events_d21_new RENAME TO order_tab_events;

CREATE INDEX IF NOT EXISTS order_tab_events_tab_created_idx
  ON order_tab_events (order_tab_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_tab_events_bar_created_idx
  ON order_tab_events (bar_id, created_at DESC);

CREATE TABLE idempotency_keys_d21_new (
  id TEXT PRIMARY KEY,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN ('order_item_add', 'order_custom_item_add', 'order_adjustment_add', 'order_settle')),
  scope_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 120),
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL CHECK (response_status BETWEEN 200 AND 599),
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

INSERT INTO idempotency_keys_d21_new (
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
ALTER TABLE idempotency_keys_d21_new RENAME TO idempotency_keys;

CREATE UNIQUE INDEX IF NOT EXISTS idempotency_keys_scope_unique
  ON idempotency_keys (bar_id, actor_user_id, operation, scope_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idempotency_keys_expiry_idx
  ON idempotency_keys (expires_at);

CREATE TABLE daily_order_summaries (
  id TEXT PRIMARY KEY,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  business_date TEXT NOT NULL CHECK (business_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  settled_tab_count INTEGER NOT NULL DEFAULT 0 CHECK (settled_tab_count >= 0),
  cancelled_tab_count INTEGER NOT NULL DEFAULT 0 CHECK (cancelled_tab_count >= 0),
  settled_total_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (settled_total_amount_minor >= 0),
  settled_item_count INTEGER NOT NULL DEFAULT 0 CHECK (settled_item_count >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_order_summaries_bar_date_unique
  ON daily_order_summaries (bar_id, business_date);

CREATE INDEX IF NOT EXISTS daily_order_summaries_bar_updated_idx
  ON daily_order_summaries (bar_id, updated_at DESC);

PRAGMA foreign_keys = ON;
