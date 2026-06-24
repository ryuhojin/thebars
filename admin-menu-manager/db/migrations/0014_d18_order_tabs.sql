CREATE TABLE IF NOT EXISTS order_tab_counters (
  bar_id TEXT PRIMARY KEY REFERENCES bars(id) ON DELETE CASCADE,
  next_tab_number INTEGER NOT NULL DEFAULT 1 CHECK (next_tab_number >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO order_tab_counters (
  bar_id, next_tab_number, created_at, updated_at
)
SELECT id, 1, created_at, updated_at
FROM bars;

CREATE TABLE IF NOT EXISTS order_tabs (
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
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS order_tabs_bar_tab_number_unique
  ON order_tabs (bar_id, tab_number);

CREATE INDEX IF NOT EXISTS order_tabs_bar_status_updated_idx
  ON order_tabs (bar_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS order_tabs_bar_label_idx
  ON order_tabs (bar_id, table_label);

CREATE TABLE IF NOT EXISTS order_tab_events (
  id TEXT PRIMARY KEY,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  order_tab_id TEXT NOT NULL REFERENCES order_tabs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('tab_created', 'tab_updated')),
  before_status TEXT CHECK (before_status IS NULL OR before_status IN ('open', 'checkout_requested', 'closed', 'cancelled')),
  after_status TEXT NOT NULL CHECK (after_status IN ('open', 'checkout_requested', 'closed', 'cancelled')),
  expected_version INTEGER CHECK (expected_version IS NULL OR expected_version >= 1),
  resulting_version INTEGER NOT NULL CHECK (resulting_version >= 1),
  note TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS order_tab_events_tab_created_idx
  ON order_tab_events (order_tab_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_tab_events_bar_created_idx
  ON order_tab_events (bar_id, created_at DESC);
