-- PRODUCT SHAPE FROM ITS SHOP PHOTO. Measured 2026-09-26: 0 of 20 physical
-- products had an `object_shape` fact, because extraction from a link reads
-- page text only. A worker sweep now reads the shop's product photo once and
-- appends the fact; this column records that it looked, so a product whose
-- photo cannot be read is not re-fetched forever.
alter table public.product_entities add column if not exists shape_checked_at timestamptz;
