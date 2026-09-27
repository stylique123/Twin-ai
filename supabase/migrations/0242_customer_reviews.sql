-- CUSTOMER REVIEWS FROM THE PRODUCT PAGE (24-ideas #14). The extractor reads
-- the page's own schema.org rating and review bodies — no model — and stores
-- them apart from `knowledge`, because a customer's words are never the
-- creator's facts. The writer may quote one, attributed to "a customer".
alter table public.product_entities add column if not exists customer_reviews jsonb;
