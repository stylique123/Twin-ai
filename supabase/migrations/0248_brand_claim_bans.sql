-- CLAIMS A BRAND'S SCRIPTS MUST NEVER MAKE (Sunflower session #6).
--
-- Only one claims list existed, set once at onboarding. A brand (and each of
-- its products) can need its own — "can't claim this exact origin will return"
-- belongs to one limited release, not to everything she says. Product-level
-- bans live in product_entities.restrictions.forbiddenClaims (already read by
-- generate-blueprint); this adds the brand level, inherited by its products.
alter table public.brands add column if not exists forbidden_claims text[] not null default '{}';
