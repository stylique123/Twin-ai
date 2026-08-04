-- 0104 — THE PERMANENT GLOSSARY: "any hard words?"
--
-- §6 calls this "quietly the highest-value field in the product: every hard
-- word ever typed is saved forever, and accent stops being a risk permanently."
--
-- ── WHAT A TERM ACTUALLY DOES, SO THE SHAPE MAKES SENSE ───────────────────
--
-- Captions already take the SCRIPT'S SPELLING at the RECORDING'S TIME: the
-- aligner pairs each script word to the spoken word it became, and a
-- SUBSTITUTION above a similarity floor puts the script's letters on screen
-- instead of the ASR's. The floor exists because a substitution is the
-- aligner's GUESS that two words are the same word.
--
-- A glossary term is evidence that lowers that risk for exactly one word — the
-- creator typed it, deliberately, as a word they expect to be got wrong. So a
-- term LOWERS THE FLOOR for a pairing the aligner already made. It never
-- matches against the transcript on its own, which is what keeps every existing
-- caption property intact.
--
-- ── ONE WORD, ALWAYS ──────────────────────────────────────────────────────
--
-- A term becomes CAPTION TEXT. An entry containing whitespace would let one
-- spoken word render as several — the same door the review overlay's respelling
-- rule closes, and it has to be closed here too, because a row can be written
-- by anything holding the owner's credentials rather than only by the screen
-- that will eventually ask the question.
--
-- ── CASE-FOLDED IDENTITY, VERBATIM DISPLAY ────────────────────────────────
--
-- "TwinAI", "twinai" and "TWINAI" are one entry in a glossary and three rows in
-- a table keyed on the raw string. The unique index is on the FOLDED form; the
-- stored `term` is exactly what the creator typed, because that is what reaches
-- the screen. Postgres cannot fold accents without unaccent (an extension this
-- project does not install), so the index folds CASE only and the worker's
-- resolver does the accent fold when it dedupes into the pinned list — stated
-- here rather than left as a surprise: two rows differing only by an accent can
-- both exist, and the pin keeps the first.

create table if not exists public.brand_glossary_terms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- Exactly as typed. This string becomes caption text.
  term text not null,
  created_at timestamptz not null default now(),
  -- ONE WORD, ALWAYS — enforced here and not only in the client, because the
  -- client is not the only writer a table ever gets.
  constraint brand_glossary_terms_one_word check (
    length(term) between 1 and 64
    and term !~ '\s'
  )
);

-- One entry per owner per word, case-insensitively. `lower()` rather than a
-- citext column: no extension, and the fold is then visible in the index
-- definition rather than hidden in a type.
create unique index if not exists brand_glossary_terms_owner_term_uniq
  on public.brand_glossary_terms (owner_id, lower(term));
create index if not exists brand_glossary_terms_owner_idx
  on public.brand_glossary_terms (owner_id, created_at desc);

alter table public.brand_glossary_terms enable row level security;

-- The creator's own words about their own setup: the owner reads and writes
-- them, and workspace peers read them for the same reason they read the brand
-- voice — a team sharing a brand shares its vocabulary. Writing stays with the
-- owner, so a seat cannot quietly change what appears on someone else's
-- captions.
drop policy if exists brand_glossary_owner_select on public.brand_glossary_terms;
create policy brand_glossary_owner_select on public.brand_glossary_terms
  for select to authenticated using (owner_id in (select public.workspace_peers()));
drop policy if exists brand_glossary_owner_insert on public.brand_glossary_terms;
create policy brand_glossary_owner_insert on public.brand_glossary_terms
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists brand_glossary_owner_delete on public.brand_glossary_terms;
create policy brand_glossary_owner_delete on public.brand_glossary_terms
  for delete to authenticated using (owner_id = (select auth.uid()));

-- NO UPDATE POLICY, deliberately. A term is a word, not a document: correcting
-- one is deleting it and adding the right one, which leaves a truthful
-- `created_at` on the entry that is actually in force. An UPDATE would let a
-- term change under a pinned manifest's feet — the manifest stores the terms
-- themselves, so a rewritten row cannot retro-alter a running edit, but it
-- would make the table disagree with what the render used and nobody could tell
-- which had changed.
revoke all on public.brand_glossary_terms from public, anon;
grant select, insert, delete on public.brand_glossary_terms to authenticated;
grant all on public.brand_glossary_terms to service_role;
