-- Per-workspace brand kit: default caption style + highlight color (and a logo
-- path for the future burn-in). Rides the existing EDL caption fields, so applying
-- it needs no render-engine change. Lives on the brand voice (one kit per workspace).
alter table public.brand_voices add column if not exists brand_kit jsonb;
