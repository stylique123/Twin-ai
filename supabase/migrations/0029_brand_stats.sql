-- Per-client (brand voice) dashboard stats for agencies. Counts scoped to one
-- brand by joining through generations.brand_voice_id, owner-checked so a user can
-- only ever see their own brands' numbers (security definer + auth.uid() guard).

create or replace function public.brand_stats(p_brand uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  select exists (select 1 from public.brand_voices where id = p_brand and owner_id = auth.uid()) into ok;
  if not ok then return null; end if;
  return jsonb_build_object(
    'blueprints', (select count(*) from public.generations where brand_voice_id = p_brand),
    'edits',      (select count(*) from public.generations where brand_voice_id = p_brand and edit_path is not null),
    'posts',      (select count(*) from public.posts p
                     join public.generations g on g.id = p.generation_id
                    where g.brand_voice_id = p_brand and p.status = 'posted')
  );
end $$;

grant execute on function public.brand_stats(uuid) to authenticated;
