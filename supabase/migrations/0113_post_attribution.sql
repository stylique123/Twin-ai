-- 0113 — LEARNING-1, THE LINEAGE HALF: how a business outcome is ATTRIBUTED.
--
-- 0105 built the outcome log and was explicit about the rule this migration
-- exists to make possible:
--
--   "Attributed, never inferred. An unattributed sale next to a video is a
--    coincidence with a timestamp."
--
-- It enforced that on `dna_claims`: a `business_outcome` claim cannot be
-- inserted without an `attribution`. But `attribution` is FREE TEXT, and nothing
-- in the product ever produces the thing that text is supposed to name. Its own
-- comment says what it should be — "a UTM, a promo code, a CRM id" — and no
-- code path mints a UTM, generates a code, or records a CRM reference. So the
-- only attribution anybody could ever supply is a sentence someone typed, which
-- satisfies the constraint and proves nothing.
--
-- That is the gap: the rule is enforced against a value that cannot be earned.
--
-- ── WHAT AN ATTRIBUTION IS, HERE ──────────────────────────────────────────
--
-- An identifier that existed BEFORE the outcome and is carried by the thing the
-- audience touched. That ordering is the whole mechanism: a code minted on
-- Tuesday and printed in Tuesday's link cannot explain Monday's sale, and a
-- reference invented after the money arrived explains nothing at all. So these
-- rows are created when the post is, and are immutable afterwards.
--
-- Three kinds, and no free-text fourth:
--
--   utm         a query parameter on the link the post carries. Measures the
--               click, which is the only thing a link can measure.
--   promo_code  a code the audience types. Measures the purchase, and survives
--               the platforms that strip or shorten links.
--   crm_ref     an id in a system we do not own. Measures whatever that system
--               measures, and is the honest home for "they mentioned the video
--               on the call" — recorded as a reference, not as a metric.
--
-- A `text` kind column with no CHECK is how "instagram_bio_link_v2" appears and
-- stops being comparable to anything, including to itself six months on. Same
-- reasoning as 0105's closed metric list.
--
-- ── IMMUTABLE, AND WHY THAT IS THE POINT RATHER THAN TIDINESS ─────────────
--
-- If `post_id` could be changed, every outcome ever attributed through this row
-- would silently transfer to a different video — retroactively, with no record
-- that it happened, and the correlations built on top would move with it. That
-- is the same argument 0105 makes for the observation log being append-only,
-- one table upstream: evidence that can be edited afterwards is not evidence.
--
-- DELETE is allowed and is NOT the same hole. Removing an attribution removes
-- its future ability to explain anything; it cannot reassign the past, because
-- the observations that reference it hold it with `on delete restrict` and the
-- delete simply fails while any exist.

create table if not exists public.post_attributions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  kind text not null check (kind in ('utm', 'promo_code', 'crm_ref')),
  -- As the creator gave it, so the product can show them the exact string they
  -- put in the world.
  value text not null check (length(btrim(value)) between 1 and 200),
  -- THE COMPARISON KEY, generated rather than supplied.
  --
  -- A creator types CREATOR10 on the checkout page and creator10 in the sheet
  -- they paste back. Those are one code, and a uniqueness rule over the raw
  -- string would happily let both exist and attribute half the sales to each.
  -- Generated so it cannot drift from `value`, and so no writer can set it to
  -- something `value` is not.
  value_norm text generated always as (upper(btrim(value))) stored,
  created_at timestamptz not null default now()
);

-- ONE code, ONE meaning, per creator. Not globally unique: two creators may
-- both run CREATOR10, and forbidding that would make one of them rename a code
-- already printed on their storefront because a stranger got there first.
create unique index if not exists post_attributions_owner_value_uniq
  on public.post_attributions (owner_id, kind, value_norm);

create index if not exists post_attributions_post_idx
  on public.post_attributions (post_id, kind);

create or replace function public.post_attributions_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception
    'post_attributions is immutable — changing what a code points at retroactively re-attributes every outcome recorded through it';
end;
$$;
drop trigger if exists trg_post_attributions_immutable on public.post_attributions;
create trigger trg_post_attributions_immutable
  before update on public.post_attributions
  for each row execute function public.post_attributions_immutable();
revoke all on function public.post_attributions_immutable() from public, anon, authenticated;

alter table public.post_attributions enable row level security;

drop policy if exists post_attributions_read on public.post_attributions;
create policy post_attributions_read on public.post_attributions
  for select to authenticated using (owner_id in (select public.workspace_peers()));

-- The creator mints these — they are the one who owns the storefront the code
-- goes on and the CRM the reference lives in. Same posture as the observation
-- log's insert policy, and unlike `dna_claims`, which is the product SPEAKING
-- and is therefore service-role only.
drop policy if exists post_attributions_insert on public.post_attributions;
create policy post_attributions_insert on public.post_attributions
  for insert to authenticated with check (owner_id = (select auth.uid()));

drop policy if exists post_attributions_delete on public.post_attributions;
create policy post_attributions_delete on public.post_attributions
  for delete to authenticated using (owner_id = (select auth.uid()));

revoke all on public.post_attributions from public, anon;
grant select, insert, delete on public.post_attributions to authenticated;
grant all on public.post_attributions to service_role;

-- ---------------------------------------------------------------------------
-- An observation may name what attributed it.
-- ---------------------------------------------------------------------------
-- NULLABLE, and null is not "unattributed by mistake" — it is the correct and
-- common state. `views` is not attributed by anything; it is a platform
-- reporting its own number. Requiring an attribution on every reading would
-- make the column meaningless by making it universal.
--
-- It is also not made REQUIRED for the business metrics, which is the tempting
-- version of this and the wrong one. A creator who knows they made three sales
-- should be able to write that down; refusing the row would trade a weak fact
-- for no fact. The rule that matters — a business CLAIM needs an attribution —
-- already lives on `dna_claims`, which is where the product would be putting a
-- causal sentence in front of a person. This column is what lets that claim
-- point at something real instead of at prose.
--
-- `on delete restrict`: deleting an attribution that explains recorded outcomes
-- would leave those outcomes explained by nothing while still counted.
alter table public.post_outcome_observations
  add column if not exists attribution_id uuid
    references public.post_attributions(id) on delete restrict;

create index if not exists post_outcome_observations_attribution_idx
  on public.post_outcome_observations (attribution_id)
  where attribution_id is not null;

comment on column public.post_outcome_observations.attribution_id is
  'LEARNING-1 lineage. WHAT attributed this reading — the UTM, code or CRM reference '
  'that existed before the outcome did. NULL is normal and honest: a platform view '
  'count is attributed by nothing. Never inferred.';

-- The same pointer on a claim, so "3 sales from this video" can name the code
-- rather than describe it. The free-text `attribution` column stays: 0105 made
-- it required for a business outcome, every existing row satisfies it in prose,
-- and dropping it would invalidate real claims to enforce a rule they predate.
alter table public.dna_claims
  add column if not exists attribution_id uuid
    references public.post_attributions(id) on delete restrict;

comment on column public.dna_claims.attribution_id is
  'The attribution row this claim rests on, when there is one. The text `attribution` '
  'column remains the required field for a business outcome (0105); this is the '
  'machine-checkable version of the same fact, and its presence is what separates '
  'an attributed claim from a described one.';
