-- THE OFFER WAS A PROPERTY OF THE ACCOUNT, AND IT IS A PROPERTY OF THE PRODUCT.
--
-- ⚠️ MEASURED 2026-09-20: 52 of 54 ready voices carry a scanned `profile.offer`
-- — a single sentence guessed from their posts, stored once per ACCOUNT. The
-- Product Library, which is where a creator actually describes the things they
-- sell, has no offer field at all. So a creator with two products has one offer
-- between them, written by a model, editable nowhere.
--
-- ⚖️ AND THE WRITER ALREADY WANTS THE PRODUCT'S VERSION. `generate-blueprint`
-- resolves `answers.offer ?? brief.offer ?? vp.offer ?? dna.product` — a chain
-- that reaches for the account-level guess because nothing narrower exists. This
-- column is the narrower thing, and it slots in ahead of the guess.
--
-- ⚠️ NULLABLE, AND NULL IS A REAL ANSWER. A product with no offer recorded is
-- not a product being given away: it is one nobody has described yet, and the
-- chain above must keep falling through to what it used before rather than
-- reading a blank as "no offer".

alter table public.product_entities
  add column if not exists offer text;

-- ⚖️ NOTHING IS BACKFILLED FROM `brand_voices.profile.offer`. That sentence
-- describes an ACCOUNT and was written by a scan, not by the creator; copying it
-- onto every product would put a guess about the whole business into a field
-- whose purpose is one specific thing the creator sells. Forward-only, so the
-- first offer on a product is one somebody actually typed.

grant update (offer) on public.product_entities to authenticated;
