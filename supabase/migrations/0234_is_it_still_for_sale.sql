-- IS IT STILL FOR SALE? (audit 2026-09-25, Sort Of Ceramics)
--
-- ⚠️ A script told viewers to buy a bowl whose listing was sold out, and
-- nothing in Twin knew: availability was never extracted. The worker now reads
-- the shop's own live stock (Shopify /products/<handle>.js) daily; the writer
-- refuses a buy CTA for a sold-out item; the Products page shows it.
--
-- ⚖️ ADDITIVE. null means UNKNOWN (not a shop we can read yet) — never "in stock".
alter table public.product_entities
  add column if not exists availability text check (availability in ('in_stock','sold_out','partly_sold_out')),
  add column if not exists sold_out_variants text[] not null default '{}',
  add column if not exists availability_checked_at timestamptz;
