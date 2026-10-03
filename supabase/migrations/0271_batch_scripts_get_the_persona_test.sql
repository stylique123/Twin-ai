-- ⚠️ SCRIPT BATCH 2026-10-02: the persona test skipped every heartbeat-account
-- generation (so the heartbeat never biases the corpus), which meant the test
-- batch could not test personas at all — 78 product scripts, 0 viewer tests.
-- A heartbeat generation the batch recorded is now tested like a creator's;
-- every other heartbeat generation is still skipped.
create or replace function public.audience_untested(p_limit integer default 3)
returns table(id uuid, user_id uuid, blueprint jsonb, reference_note text, profile jsonb, voice_id uuid)
language sql stable security definer set search_path to 'public' as $function$
  select g.id, g.user_id, g.blueprint, g.reference_note, v.profile, g.brand_voice_id
  from public.generations g
  left join public.brand_voices v on v.id = g.brand_voice_id
  left join public.audience_tests t on t.generation_id = g.id
  left join public.audience_panels p on p.voice_id = g.brand_voice_id
  where g.created_at > now() - interval '30 days'
    and (coalesce(g.is_heartbeat, false) = false
         or exists (select 1 from public.script_batch_results b where b.generation_id = g.id))
    and g.blueprint ? 'hook_options'
    and (t.generation_id is null
         or (t.status = 'done' and t.panel_voice_id is null and p.built_at > t.created_at))
  order by (t.generation_id is null) desc, g.created_at desc
  limit greatest(1, least(p_limit, 10));
$function$;
revoke all on function public.audience_untested(integer) from public, anon, authenticated;
grant execute on function public.audience_untested(integer) to service_role;
