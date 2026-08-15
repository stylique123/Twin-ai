-- A CODE WITHOUT A CAUSE IS A CODE THAT SENDS YOU TO THE LOGS.
--
-- ⚠️ C8 ITEM 2. `edit_director_calls` is the one state machine in this system
-- that has ever answered "how often has that failed, ever" with a number instead
-- of a guess — three times in its whole history, on 2026-08-08, which is how that
-- failure was correctly called transient rather than assumed to be. What it does
-- NOT record is WHY. `directorProvider.ts` throws `director provider HTTP
-- ${res.status}` and the code stored is `director_provider_http` for all of them.
--
-- ⚖️ SO A 429, A 503 AND A 400 ARE ONE ROW SHAPE, AND THEY CALL FOR THREE
-- DIFFERENT RESPONSES: buy more quota or slow down; wait for Google; fix our own
-- malformed request. The distinction exists at the moment of failure, in the
-- status line, and was dropped one throw later — the same shape as the script
-- path before 0129, which is why C8 names them together.
alter table public.edit_director_calls
  add column if not exists failure_detail text;

-- ⚠️ BOUNDED, BECAUSE IT HOLDS A PROVIDER'S RESPONSE BODY. Long enough to carry
-- Google's own error text (which names the quota or the offending field), short
-- enough that a runaway response cannot bloat a ledger read on every project.
-- 300 matches `script_attempts.failure_detail`, so the two failure records are
-- comparable rather than merely similar.
alter table public.edit_director_calls
  drop constraint if exists edit_director_calls_failure_detail_short;
alter table public.edit_director_calls
  add constraint edit_director_calls_failure_detail_short
  check (failure_detail is null or length(failure_detail) <= 300);

comment on column public.edit_director_calls.failure_detail is
  'The provider''s own message for a failed director call — status line and a '
  'bounded slice of the body. NULL means not recorded (every row before 0132), '
  'never "no detail available".';

-- ── The writer ─────────────────────────────────────────────────────────────
--
-- ⚠️ A NEW PARAMETER WITH A DEFAULT, NOT A NEW FUNCTION. The worker calls this by
-- name; adding an overload would leave two callable functions where one is the
-- old behaviour, and the wrong one would keep working silently. The default is
-- NULL so the signature change cannot break an in-flight deploy mid-rollout.
--
-- ⚖️ AND IT IS `create or replace`, WHICH KEEPS THE EXISTING GRANTS. Dropping and
-- recreating would revoke service_role's execute and fail every director call
-- until the grant below ran — a self-inflicted outage on the render path.
create or replace function public.editor_director_fail(
  p_project uuid, p_job uuid, p_worker text, p_attempt integer, p_failure_code text,
  p_failure_detail text default null
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  n integer;
begin
  perform public.editor_assert_lease(p_project, p_job, p_worker, p_attempt);
  update public.edit_director_calls
     set state = 'failed',
         failure_code = p_failure_code,
         -- ⚠️ TRUNCATED HERE TOO, not only in the worker. A caller that forgets
         -- is a constraint violation that fails the whole director-fail write —
         -- and losing the record of a failure because the failure was verbose is
         -- the worst possible trade.
         failure_detail = left(p_failure_detail, 300),
         updated_at = now()
   where edit_project_id = p_project and state in ('started','received');
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'director_state: no in-flight director call to fail for project %', p_project;
  end if;
end;
$$;

-- The 5-arg signature is gone (replaced in place by the 6-arg one with a
-- default), so the grants are restated against the new signature.
revoke all on function public.editor_director_fail(uuid, uuid, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.editor_director_fail(uuid, uuid, text, integer, text, text) to service_role;
