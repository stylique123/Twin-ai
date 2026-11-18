-- ONLY TWIN CHANGES A VOICE'S STATUS (security audit #13).
-- 0063 lets a signed-in user update brand_voices.status directly. start-dna
-- counts every voice whose status is not 'failed' against the plan's limit, so
-- a free user could mark a voice 'failed', add another, then flip the old one
-- back to 'ready': unlimited voices. Each flip to 'ready' with a new niche also
-- fires kick_discovery_on_new_niche, which dispatches a GitHub deploy workflow.
-- The app itself makes exactly one status change: the manual voice form saves
-- the profile and moves the row from 'building' to 'ready' (saveVoiceProfile).
-- A signed-in user may now make only that change; the server (service role) is
-- unaffected. The column grant stays so saveVoiceProfile keeps working.
-- Files only; applied by hand.
create or replace function public.brand_voice_status_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated'
     and new.status is distinct from old.status
     and not (old.status = 'building' and new.status = 'ready') then
    raise exception 'Only Twin can change a voice''s status.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.brand_voice_status_guard() from public, anon, authenticated;

drop trigger if exists brand_voices_status_guard on public.brand_voices;
create trigger brand_voices_status_guard before update of status on public.brand_voices
  for each row execute function public.brand_voice_status_guard();
