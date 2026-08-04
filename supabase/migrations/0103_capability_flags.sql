-- 0103 — CAPABILITY FLAGS: what replaces creator archetypes.
--
-- Phase 11 item 9. §2.2 retired archetypes ("they sort the person; the variable
-- is the video") and named three booleans in their place:
--
--   can_film_objects     from "Can you show a product?"
--   can_record_screen    from "Can you record your screen?"
--   needs_approval       from "Who approves?" / org account
--
-- "Flags compose; archetypes don't. Flags change per video; archetypes don't."
--
-- ── WHAT LOOKING FOUND, BEFORE ANY OF THIS WAS WRITTEN ────────────────────
--
-- Item 9 says flags "replace archetype routing". THERE IS NO ARCHETYPE ROUTING
-- to replace — no Explainer/Demonstrator/Brand enum exists anywhere in this
-- repository. And §2.2 calls these "three booleans already being collected";
-- they are collected nowhere. So this migration builds a thing rather than
-- migrating one, and nothing has to be un-wired first.
--
-- ── UNSET IS A THIRD STATE, ENFORCED HERE AND NOT ONLY IN TYPESCRIPT ──────
--
-- `can_film_objects = false` means "never show this creator a footage
-- checklist" — a feature being REMOVED. Defaulting it to false for everyone who
-- has never been asked would silently remove that screen from every existing
-- account, which is this project's most-repeated defect (a missing value read
-- as a real one) landing where it costs the most.
--
-- So the column is NULLABLE with NO DEFAULT, an absent key means unanswered,
-- and the CHECK below refuses anything that is not a real JSON boolean or null.
-- `"true"`, `1` and `"yes"` are all things a client could send and all of them
-- become a confident `true` under a truthiness read; none of them can be
-- stored. A backfill is deliberately absent: there is no answer to backfill.
--
-- ── TWO PLACES, BECAUSE THE ANSWER HAS TWO SCOPES ─────────────────────────
--
-- `brand_voices.default_capability_flags` is what is USUALLY true of this
-- brand's setup. `generations.capability_flags` is what is true of THIS video,
-- and it wins whenever it is present — including when it says false. An account
-- default acting as a floor would make the per-video answer advisory, which is
-- the archetype trap in the other costume: a setting that sorts the person and
-- cannot be escaped for one video.
--
-- Neither is derived from the other, so `resolveCapabilities`
-- (packages/shared/src/editor/capabilities.ts) can always say WHICH ONE
-- answered — and "why was I not asked to film anything?" has an answer that
-- names the video or the brand rather than a rule nobody can see.
--
-- ── NOTHING READS THESE YET, AND THAT IS A COMPLETE STATE ─────────────────
--
-- Declared rather than left to be discovered, following the precedent set for
-- the alignment component (`analysis_components.json`'s `consumedByDirector`).
-- Each consumer §2.2 names is blocked on something real: the footage checklist
-- does not exist (Phase 12 item 12), the screen-recording clip type does not
-- exist (Phase 12 item 13), and the approval lock is a regulated-tier surface
-- on top of the review screen rather than a flag read. Storable-but-unread is
-- the honest state, and saying so is what stops the next reader assuming a flag
-- they set is changing something.

-- ---------------------------------------------------------------------------
-- The shape guard, shared by both columns
-- ---------------------------------------------------------------------------
-- An object; only the three known keys; each value a real JSON boolean or null.
-- Written as a function so the two CHECKs cannot drift apart — a fourth flag
-- added to one column and not the other would be two different vocabularies
-- resolving against each other.
create or replace function public.is_capability_flags(p jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select p is null
      or (
        jsonb_typeof(p) = 'object'
        -- no key outside the frozen set: a client cannot invent a fourth flag
        -- by writing one, which is how an enum grows back.
        and not exists (
          select 1 from jsonb_object_keys(p) k
           where k not in ('can_film_objects', 'can_record_screen', 'needs_approval')
        )
        -- every value a real boolean or an explicit null. `"true"` and `1` are
        -- refused rather than coerced.
        and not exists (
          select 1 from jsonb_each(p) e
           where jsonb_typeof(e.value) not in ('boolean', 'null')
        )
      );
$$;
revoke all on function public.is_capability_flags(jsonb) from public, anon, authenticated;
grant execute on function public.is_capability_flags(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Per-brand defaults: what is usually true of this setup
-- ---------------------------------------------------------------------------
alter table public.brand_voices
  add column if not exists default_capability_flags jsonb;

alter table public.brand_voices
  drop constraint if exists brand_voices_capability_flags_shape;
alter table public.brand_voices
  add constraint brand_voices_capability_flags_shape
  check (public.is_capability_flags(default_capability_flags));

-- ---------------------------------------------------------------------------
-- Per-video answers: what is true of THIS one, and what wins
-- ---------------------------------------------------------------------------
alter table public.generations
  add column if not exists capability_flags jsonb;

alter table public.generations
  drop constraint if exists generations_capability_flags_shape;
alter table public.generations
  add constraint generations_capability_flags_shape
  check (public.is_capability_flags(capability_flags));

-- ---------------------------------------------------------------------------
-- The COLUMN GRANTS, without which none of the above can be written
-- ---------------------------------------------------------------------------
-- The row-level policies already permit exactly the right people: "workspace
-- generations update" and "workspace brand voices update" (0049) allow the
-- owner and their workspace peers. But BOTH tables revoked table-level UPDATE
-- from `authenticated` long ago (0014 for generations, 0002 for brand_voices)
-- and grant it back one column at a time, so a new column is UNWRITABLE by
-- default and fails with a bare 42501 that names no column.
--
-- This has already happened twice, and both times the corrective migration is
-- still in the tree: 0053 because 0050 added `scene_timeline` without a grant —
-- and the V2 flow dead-ended on a raw permission error AFTER spending a
-- recreation — and 0051 for `brand_kit`. Granting in the same migration as the
-- column is what stops a third.
--
-- Only these columns, and only for `authenticated` — anon holds no UPDATE on
-- either table (0075 removed the last table-level grant) and needs none.
grant update (capability_flags) on public.generations to authenticated;
grant update (default_capability_flags) on public.brand_voices to authenticated;
