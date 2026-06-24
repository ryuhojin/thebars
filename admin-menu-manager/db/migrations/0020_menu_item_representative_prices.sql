ALTER TABLE menu_item_prices
  ADD COLUMN is_representative INTEGER NOT NULL DEFAULT 0 CHECK (is_representative IN (0, 1));

WITH typed_prices AS (
  SELECT
    p.id,
    p.bar_id,
    p.menu_item_id,
    p.normalized_label,
    p.display_order,
    COALESCE(bit.template, sit.template, 'general') AS template
  FROM menu_item_prices p
  JOIN menu_items mi ON mi.id = p.menu_item_id AND mi.bar_id = p.bar_id
  LEFT JOIN system_item_types sit ON sit.id = mi.system_item_type_id
  LEFT JOIN bar_item_types bit ON bit.id = mi.bar_item_type_id AND bit.bar_id = mi.bar_id
),
ranked_prices AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY bar_id, menu_item_id
      ORDER BY
        CASE
          WHEN template = 'whisky' AND normalized_label IN ('샷', '1샷', 'shot', '1 shot', 'one shot') THEN 0
          WHEN template = 'wine' AND normalized_label IN ('바틀', '보틀', '병', 'bottle', 'btl') THEN 0
          ELSE 1
        END,
        display_order ASC,
        normalized_label ASC
    ) AS representative_rank
  FROM typed_prices
)
UPDATE menu_item_prices
SET is_representative = 1
WHERE id IN (SELECT id FROM ranked_prices WHERE representative_rank = 1);

CREATE UNIQUE INDEX IF NOT EXISTS menu_item_prices_single_representative_idx
  ON menu_item_prices (bar_id, menu_item_id)
  WHERE is_representative = 1;
