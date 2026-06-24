ALTER TABLE bars ADD COLUMN description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 500);
ALTER TABLE bars ADD COLUMN address TEXT NOT NULL DEFAULT '' CHECK (length(address) <= 300);
ALTER TABLE bars ADD COLUMN map_url TEXT NOT NULL DEFAULT '' CHECK (
  map_url = '' OR map_url LIKE 'http://%' OR map_url LIKE 'https://%'
);
ALTER TABLE bars ADD COLUMN phone_number_digits TEXT NOT NULL DEFAULT '' CHECK (
  phone_number_digits = '' OR (
    length(phone_number_digits) BETWEEN 8 AND 11
    AND phone_number_digits GLOB '0*'
    AND phone_number_digits NOT GLOB '*[^0-9]*'
  )
);
ALTER TABLE bars ADD COLUMN opening_note TEXT NOT NULL DEFAULT '' CHECK (length(opening_note) <= 300);
ALTER TABLE bars ADD COLUMN settings_draft_hash TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS bar_business_hours (
  id TEXT PRIMARY KEY,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  opens_at TEXT NOT NULL CHECK (
    opens_at GLOB '[0-2][0-9]:[0-5][0-9]'
    AND CAST(substr(opens_at, 1, 2) AS INTEGER) BETWEEN 0 AND 23
  ),
  closes_at TEXT NOT NULL CHECK (
    closes_at GLOB '[0-2][0-9]:[0-5][0-9]'
    AND CAST(substr(closes_at, 1, 2) AS INTEGER) BETWEEN 0 AND 23
  ),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS bar_business_hours_bar_day_idx
  ON bar_business_hours (bar_id, day_of_week, sort_order);

CREATE TABLE IF NOT EXISTS bar_links (
  id TEXT PRIMARY KEY,
  bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 40),
  url TEXT NOT NULL CHECK (url LIKE 'http://%' OR url LIKE 'https://%'),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS bar_links_bar_order_idx
  ON bar_links (bar_id, sort_order);
