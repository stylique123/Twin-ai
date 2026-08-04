-- 0101: what did that model call actually cost?
--
-- WHAT WAS MISSING
--
-- Gemini returns `usageMetadata` on every generateContent response.
-- directorProvider parsed the body, took the text, and dropped the rest, so
-- LLM spend per project has never been recorded anywhere. §9a.3 names it:
-- "Gemini usageMetadata token counts are parsed and dropped too, so LLM spend
-- per project is unknown."
--
-- It is the same defect the render-timing item had and the same one
-- `posts.edit_project_id` had: a number that exists at the moment of the call
-- and nowhere afterwards. Unlike a retention curve, it cannot be backfilled —
-- the provider does not retain a per-call ledger keyed by anything this system
-- stored, so every director call made before this migration is permanently
-- uncosted.
--
-- NULL AND ZERO ARE DIFFERENT, AND THE COLUMNS ARE NULLABLE FOR THAT REASON.
-- NULL means the provider did not report a count. 0 would mean it reported that
-- none were used. If those shared a representation, `sum(total_tokens)` would
-- read a missing count as zero and understate spend — silently, and by more as
-- more calls fail to report. A cost query that is wrong in the cheap direction
-- is worse than one that is obviously incomplete, because nobody investigates
-- good news.
--
-- WHY THEY GO ON THE CALL AND NOT THE DECISION. `edit_director_calls` is the
-- record of the CALL — one row per project, carrying state, model, provider and
-- the envelope digest. A call that reached the provider and then failed to
-- parse still cost money, and `edit_director_decisions` has no row for it. Cost
-- belongs with the charge, not with the outcome.
--
-- NOT A CHECK ON PLAUSIBILITY. The columns bound only what is arithmetically
-- meaningful (non-negative). A count that disagrees with the envelope's size is
-- the provider's claim about its own billing, and rejecting it would discard
-- the evidence that the disagreement happened. The worker already refuses
-- anything that is not a non-negative safe integer before it gets here.

alter table public.edit_director_calls
  add column if not exists prompt_tokens   integer,
  add column if not exists response_tokens integer,
  add column if not exists total_tokens    integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'edit_director_calls_tokens_non_negative'
      and conrelid = 'public.edit_director_calls'::regclass
  ) then
    alter table public.edit_director_calls
      add constraint edit_director_calls_tokens_non_negative check (
        coalesce(prompt_tokens, 0) >= 0
        and coalesce(response_tokens, 0) >= 0
        and coalesce(total_tokens, 0) >= 0
      );
  end if;
end $$;

comment on column public.edit_director_calls.prompt_tokens is
  'Provider-reported input tokens for this call. NULL means NOT REPORTED — never 0, which would mean none were used.';
comment on column public.edit_director_calls.response_tokens is
  'Provider-reported output tokens for this call. NULL means NOT REPORTED.';
comment on column public.edit_director_calls.total_tokens is
  'Provider-reported total for this call. NULL means NOT REPORTED. Not derived from the other two: the provider may count cached or reasoning tokens neither of them includes, and recomputing it here would overwrite what was actually billed with what we assumed.';

-- ── receive, now carrying the cost ─────────────────────────────────────────
--
-- The counts land at RECEIVE rather than at SUCCEED, because that is the moment
-- the charge is known: the response is in hand and has not yet been parsed into
-- a decision. A call that is received and then fails to yield a valid decision
-- still cost exactly this much, and recording it only on success would hide the
-- spend of precisely the calls worth investigating.
--
-- APPENDED, NOT REPLACED, and the old signature is dropped explicitly. Postgres
-- keys functions by (name, argument types), so `create or replace` with three
-- extra parameters creates a SECOND function and leaves the old one callable —
-- which is exactly the orphan overload found on staging for
-- editor_create_output_asset, where a removed parameter kept working because
-- nobody dropped it. Dropped first, so there is one.
drop function if exists public.editor_director_receive(uuid, uuid, text, integer, text);

create function public.editor_director_receive(
  p_project uuid, p_job uuid, p_worker text, p_attempt integer, p_response_sha256 text,
  p_prompt_tokens integer default null,
  p_response_tokens integer default null,
  p_total_tokens integer default null
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  n integer;
begin
  -- THE GUARD AND THE PREDICATE ARE 0088'S, UNCHANGED, DELIBERATELY. Only the
  -- three token columns are added to the SET. `state = 'started'` (not `in
  -- ('started','received')`) is what makes this callable exactly once, and
  -- `n = 0` is the condition 0088 raises on; widening either while adding a
  -- telemetry column would change the single-call spine under cover of a cost
  -- metric, which is how a state machine acquires a second entry point nobody
  -- reviewed.
  perform public.editor_assert_lease(p_project, p_job, p_worker, p_attempt);
  update public.edit_director_calls
     set state = 'received',
         response_sha256 = p_response_sha256,
         prompt_tokens = p_prompt_tokens,
         response_tokens = p_response_tokens,
         total_tokens = p_total_tokens,
         updated_at = now()
   where edit_project_id = p_project and state = 'started';
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'director_state: no started director call for project %', p_project;
  end if;
end;
$$;

revoke all on function public.editor_director_receive(uuid, uuid, text, integer, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.editor_director_receive(uuid, uuid, text, integer, text, integer, integer, integer)
  to service_role;
