-- ⚠️ MEASURED 2026-09-23: "Reversible Scrunchie Bandana" is not a title on
-- thedogdaysco.com — the shop names each bandana by its print ("Posy Patch
-- Scrunchie Bandana", …). The strict name match correctly refused to guess, and
-- the creator was left with nothing. The worker now keeps the closest shop
-- products here so the Library can ask "is it one of these?". Nullable; cleared
-- on any match or when she answers.
alter table public.product_entities
  add column if not exists lookup_candidates jsonb;
grant update (lookup_candidates) on public.product_entities to authenticated;
