-- RE-TEST WITH HER PANEL — a script tested with generic viewers before her own
-- panel existed is tested again once the panel is built, so every result she
-- sees comes from her regular viewers. Measured 2026-09-26: 132 scripts were
-- tested before any of the 47 voices had a panel (the builder ran 1 per 5 min).

drop function if exists public.audience_untested(integer);
create or replace function public.audience_untested(p_limit integer default 3)
returns table (id uuid, user_id uuid, blueprint jsonb, reference_note text, profile jsonb, voice_id uuid)
language sql stable security definer set search_path = public as $$
  select g.id, g.user_id, g.blueprint, g.reference_note, v.profile, g.brand_voice_id
  from public.generations g
  left join public.brand_voices v on v.id = g.brand_voice_id
  left join public.audience_tests t on t.generation_id = g.id
  left join public.audience_panels p on p.voice_id = g.brand_voice_id
  where g.created_at > now() - interval '30 days'
    and coalesce(g.is_heartbeat, false) = false
    and g.blueprint ? 'hook_options'
    and (t.generation_id is null
         -- tested before her panel existed: test again with it
         or (t.status = 'done' and t.panel_voice_id is null and p.built_at > t.created_at))
  -- never-tested first, then newest
  order by (t.generation_id is null) desc, g.created_at desc
  limit greatest(1, least(p_limit, 10));
$$;
revoke all on function public.audience_untested(integer) from public, anon, authenticated;
grant execute on function public.audience_untested(integer) to service_role;
