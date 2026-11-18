-- ONLY TWIN CHANGES A VOICE'S STATUS (security audit #13).
-- 0063 lets a signed-in user update brand_voices.status directly. start-dna
-- counts every voice whose status is not 'failed' against the plan's limit, so
-- a free user could mark a voice 'failed', add another, then flip the old one
-- back to 'ready': unlimited voices. Each flip to 'ready' with a new niche also
-- fires kick_discovery_on_new_niche, which dispatches a GitHub deploy workflow.
-- The app itself makes one status change: the manual voice form saves the
-- profile and moves the row to 'ready' (saveVoiceProfile), from 'building', or
-- from 'failed' when the 10-minute reaper (0018) failed it while she was still
-- typing. A signed-in user may now only:
--   building -> ready   always;
--   failed   -> ready   while the owner is under the plan's voice limit (the same
--                       limit as start-dna BRAND_LIMIT: agency 15, others 1);
-- and nothing else. Service role unaffected; the column grant stays.
-- Files only; applied by hand.
create or replace function public.brand_voice_status_guard()
returns trigger language plpgsql set search_path = public as $$
declare v_plan text; v_active integer;
begin
  if current_user <> 'authenticated' or new.status is not distinct from old.status then return new; end if;
  if old.status = 'building' and new.status = 'ready' then return new; end if;
  if old.status = 'failed' and new.status = 'ready' then
    -- One check at a time per owner, so two simultaneous saves cannot both fit under the limit.
    perform pg_advisory_xact_lock(hashtext('voice-limit:' || old.owner_id::text));
    select plan into v_plan from public.profiles where id = old.owner_id;
    select count(*) into v_active from public.brand_voices
     where owner_id = old.owner_id and status <> 'failed' and id <> old.id;
    if v_active < (case when v_plan = 'agency' then 15 else 1 end) then return new; end if;
  end if;
  raise exception 'Only Twin can change a voice''s status.' using errcode = '42501';
end $$;
revoke all on function public.brand_voice_status_guard() from public, anon, authenticated;

drop trigger if exists brand_voices_status_guard on public.brand_voices;
create trigger brand_voices_status_guard before update of status on public.brand_voices
  for each row execute function public.brand_voice_status_guard();
