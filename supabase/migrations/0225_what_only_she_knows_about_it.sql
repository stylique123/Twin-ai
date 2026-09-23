-- WHAT ONLY SHE KNOWS ABOUT IT.
--
-- CTO decision 2026-09-23: three optional questions on every product —
-- "What almost went wrong with this one?", "What do customers say back to you
-- about it?", "How is it actually made or delivered?". No page states these,
-- and they are what make a script sound like the person who makes the thing.
--
-- ⚖️ ONE JSONB OBJECT, NOT THREE COLUMNS: keys `almostWentWrong`,
-- `customersSay`, `howItsMade` (packages/shared/src/productStories.ts). Null
-- means never answered. Additive and nullable; nothing is backfilled.
--
-- ⚖️ READ SEPARATELY BY EVERY CONSUMER, so an unapplied migration costs these
-- answers and never the product library or a generation.

alter table public.product_entities
  add column if not exists creator_stories jsonb;

grant update (creator_stories) on public.product_entities to authenticated;
