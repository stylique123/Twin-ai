-- THREE PLACES AGREED THAT A CREATOR SELLS EXACTLY ONE THING.
--
-- ⚠️ MEASURED ON REAL ACCOUNTS: three of the five scanned break the model. A
-- baker who sells bread AND bagels, a coach with a course AND a membership, a
-- maker with two product lines — each is one voice with two owned entities, and
-- each was refused by `OwnedEntityExistsError`: "Only one owned product is
-- supported per voice."
--
-- The assumption lived in three places that had to move together:
--
--   1. this index, `product_entities_one_owned_per_voice`;
--   2. `saveMintedEntity`, which answers the 23505 it raises;
--   3. `generate-blueprint`'s `.maybeSingle()`, which THROWS on a second row.
--
-- ⚠️ AND DROPPING THE INDEX ALONE WOULD HAVE BEEN WORSE THAN LEAVING IT. Without
-- (3), the first creator to own two products would not get a clean refusal — the
-- read would throw and no script would generate at all. A rejection turned into
-- an outage.
--
-- ── THE INDEX IS NARROWED, NOT DROPPED, AND THAT IS THE POINT ─────────────
--
-- ⚠️ IT WAS DOING TWO JOBS AND ONLY ONE OF THEM IS WRONG. Its own comment says
-- so: "`Onboarding` re-runs its confirm step on remount — the same class of
-- defect as the V2Building replay that charged three times for one video — so
-- without this a creator who navigates back and forward accumulates a duplicate
-- product on every pass."
--
-- So the index is BOTH a (wrong) business rule — one owned product per voice —
-- and a (correct) idempotency guard against a replay that really happens. Drop
-- it outright and the bakery gets her second product AND a Product Library that
-- fills with copies of her first. That is the triple-charge defect returning
-- through the door opened to fix something else.
--
-- ⚖️ SO THE GUARD IS KEPT EXACTLY WHERE THE REPLAY IS, AND NOWHERE ELSE. The
-- replacement covers only entities that were MINTED rather than claimed:
-- `source = 'inferred' and user_confirmed = false`. That is precisely what
-- `mintFromWorkKind` writes, so a remount re-mint still collides, still returns
-- 23505, and `saveMintedEntity` still updates in place — idempotent, unchanged.
-- Everything a creator does DELIBERATELY — confirming the mint, adding a product
-- from the Library — is unlimited.
--
-- ⚖️ AND A REPLAY ARRIVING AFTER CONFIRMATION IS STILL COVERED, which is the
-- case that makes this safe rather than merely narrow. The mint always writes
-- `inferred/false`, so even once the creator has confirmed their first product,
-- a late remount writes a row the guard still catches.
--
-- ⚖️ NO NEW COLUMN. `source` and `user_confirmed` have carried this fact since
-- 0120. A `provenance` column would be a second spelling of an answer already on
-- the row, and the two would drift.
--
-- ── WHAT THIS DOES NOT DO ─────────────────────────────────────────────────
--
-- It does not promote anything. A guessed entity stays `inferred/false` and is
-- flagged for what it is by `0187`; this migration only stops the schema from
-- refusing a second product. The readers that must become plural — the writer's
-- entity query, the product picker — are separate commits, because each is a
-- behaviour change a person should be able to read on its own.

drop index if exists public.product_entities_one_owned_per_voice;

-- ⚠️ AT MOST ONE UNCONFIRMED AUTO-MINTED OWNED ENTITY PER VOICE. Not "one owned
-- entity": one GUESS. The creator may own as many things as they own.
create unique index if not exists product_entities_one_unconfirmed_mint_per_voice
  on public.product_entities (voice_id)
  where relationship in ('OWN_PRODUCT', 'OWN_SERVICE')
    and voice_id is not null
    and source = 'inferred'
    and user_confirmed = false;
