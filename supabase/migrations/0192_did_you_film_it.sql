-- 0192 — SHE WAS NEVER ASKED, SO `was_filmed` COULD ONLY EVER BE NULL.
--
-- ⚠️ 0191 BUILT THE TABLE AND LEFT THE QUESTION UNASKED. `was_filmed` is
-- three-state by design — true filmed, false looked at it and did not film it,
-- NULL not answered — and `false` is the only negative signal in this product,
-- because everything else Twin measures is enthusiasm at the moment of
-- clicking. Grepped before building: nothing anywhere writes the column. NULL
-- was the only reachable state, and a three-state column with two unreachable
-- states is a boolean that always says "unknown".
--
-- ⚖️ AND IT CANNOT BE DERIVED. `posts` holds 4 rows with status 'posted'
-- against 85 generations, because posting THROUGH Twin is rare — 5% coverage is
-- not a proxy for the other 95%, and treating "no post row" as "not filmed"
-- would invent 81 declines. Measured today, not assumed.
--
-- ── `filmed_answered_at` ARRIVES NOW, WITH ITS WRITER AND ITS READER ──────
--
-- ⚠️ 0191 CARRIED THIS COLUMN AND DROPPED IT, AND WAS RIGHT TO.
-- `check_column_readers` failed that build: "written and read by nothing — say
-- why it exists, or drop it." Its header records the rule it settled on:
--
--   "When did she answer" is a real question, and the change that starts
--   asking her is the change that should add the column -- with a writer, a
--   reader and a reason on the same day.
--
-- ⚖️ THIS IS THAT CHANGE. The writer is `set_generation_filmed` below; the
-- reader is `filmedAsk` in packages/shared, which shows her the answer she gave
-- and when, so a creator who changed her mind can see what Twin currently
-- believes. Both land in this PR.
alter table public.generation_outcomes
  add column if not exists filmed_answered_at timestamptz;

comment on column public.generation_outcomes.filmed_answered_at is
  'When she answered "did you film it". NULL means unanswered, which is also '
  'what was_filmed NULL means -- the two move together and are written by '
  'set_generation_filmed in one statement so they cannot disagree.';

-- ── THE FUNCTION THAT MAY SET THAT ONE COLUMN AND NO OTHER ────────────────
--
-- ⚠️ THE ANSWER DOES NOT COME THROUGH A TABLE GRANT, AND 0191 SAYS WHY:
--
--   The context half is written by the edge function under the service role,
--   and a client that could INSERT could report a shape that was never
--   generated. The creator's own answer to "did you film it" still does not
--   come through a table grant: it goes through a function that may set that
--   one column and no other, so answering a question can never become
--   rewriting the context it is about.
--
-- `authenticated` keeps SELECT and nothing else. This function is the entire
-- write surface, and its UPDATE names two columns.
--
-- ⚖️ THE GRANT IS ONLY SAFE BECAUSE OF THE OWNERSHIP CHECK — 0114's rule, and
-- 0115's, arrived at there after two wrong attempts. The function is `security
-- definer`, so RLS does not apply inside it; granting execute to
-- `authenticated` without an ownership test would let any signed-in user
-- rewrite anyone's outcome by id.
--
-- ⚠️ THE TEST IS `auth.uid()`, NOT A ROLE NAME. A guard keyed to a role NAME
-- changes meaning with the connection, which is how 0114's second attempt
-- failed against `postgres`. A NULL uid means no end user is making the
-- request, and execute stays revoked from `anon` and `public`, so a null uid
-- cannot arrive from the internet.
create or replace function public.set_generation_filmed(
  p_generation uuid,
  p_filmed boolean
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_updated integer;
begin
  -- No signed-in caller: refuse. This function exists for one creator
  -- answering one question about her own video.
  if v_uid is null then
    return false;
  end if;

  -- ⚠️ NULL IS NOT AN ANSWER AND MUST NOT BE WRITABLE THROUGH HERE. Silence is
  -- already represented by the column's own NULL; letting a caller SET null
  -- would make "she un-answered" and "she was never asked" the same row, and
  -- the second is the state this whole table is trying to shrink.
  if p_filmed is null then
    return false;
  end if;

  -- ⚖️ THE OWNERSHIP TEST IS ON THE OUTCOME ROW'S OWN `owner_id`, joined to
  -- nothing. `generation_outcomes.owner_id` is written at generation time from
  -- the authenticated user; reading ownership from `generations` instead would
  -- add a second source of truth for the same fact and a second thing to keep
  -- in step.
  --
  -- ⚠️ AND THE UPDATE NAMES EXACTLY TWO COLUMNS. Every frozen-context column --
  -- niche, sub_niche, substance_budget_beats, reference_duration_sec,
  -- had_reference -- is deliberately absent, so answering a question can never
  -- become rewriting the context the answer is about.
  update public.generation_outcomes
     set was_filmed = p_filmed,
         filmed_answered_at = now(),
         updated_at = now()
   where generation_id = p_generation
     and owner_id = v_uid;

  get diagnostics v_updated = row_count;

  -- ⚠️ MISSING AND NOT-YOURS ANSWER IDENTICALLY, which is 0114's rule: a
  -- distinct "not yours" would let anyone probe which generation ids exist.
  -- The client never needs the difference — it only offers the question when
  -- its own SELECT already returned a row.
  return v_updated > 0;
end;
$$;

-- ⚠️ REVOKE FIRST. `create or replace function` leaves any existing grants in
-- place, and the default on a new function is EXECUTE to public — so granting
-- to `authenticated` without this would ADD to a permission set that already
-- includes anon, rather than replacing it. The same defaults trap 0191 hit on
-- table privileges, in its function-shaped form.
revoke all on function public.set_generation_filmed(uuid, boolean) from public;
revoke all on function public.set_generation_filmed(uuid, boolean) from anon;
grant execute on function public.set_generation_filmed(uuid, boolean) to authenticated;

comment on function public.set_generation_filmed(uuid, boolean) is
  'The creator answering "did you film it" about her OWN generation. Sets '
  'was_filmed and filmed_answered_at and NOTHING else -- the frozen context is '
  'not writable from the client at all. Returns false for a row that does not '
  'exist or is not yours, without distinguishing the two.';
