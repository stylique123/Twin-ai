-- Align the agency per-brand stats with the ONE lifecycle used everywhere else:
-- drafts / ready / published, mutually exclusive, derived from the generation
-- (never from the jobs table). Matches getDashboardStats + the Library chips so a
-- brand-scoped Dashboard reads identically to the all-brands view.
--   draft     = generation with no finished video (edit_path is null), not posted
--   ready     = finished video (edit_path not null), not posted
--   published = generation referenced by a posted post
create or replace function public.brand_stats(p_brand uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare ok boolean;
begin
  select exists (select 1 from public.brand_voices where id = p_brand and owner_id = auth.uid()) into ok;
  if not ok then return null; end if;
  return jsonb_build_object(
    'published', (select count(distinct g.id) from public.generations g
                    join public.posts p on p.generation_id = g.id and p.status = 'posted'
                   where g.brand_voice_id = p_brand),
    'ready',     (select count(*) from public.generations g
                   where g.brand_voice_id = p_brand and g.edit_path is not null
                     and not exists (select 1 from public.posts p where p.generation_id = g.id and p.status = 'posted')),
    'drafts',    (select count(*) from public.generations g
                   where g.brand_voice_id = p_brand and g.edit_path is null
                     and not exists (select 1 from public.posts p where p.generation_id = g.id and p.status = 'posted'))
  );
end $function$;
