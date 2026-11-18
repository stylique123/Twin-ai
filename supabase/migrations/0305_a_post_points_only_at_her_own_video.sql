-- A POST POINTS ONLY AT HER OWN VIDEO (security audit #14).
-- Users can write every column of posts, and the insert/update policies (0007,
-- 0049) only checked owner_id. The publisher (social, service role) then signs
-- and posts whatever media_path / generation / output the row names, so a post
-- could publish another creator's private video on the caller's account.
-- Both policies now also require:
--   media_path      - inside the post owner's own folder (post-media uploads go
--                     to <uid>/...), with no '.', '..', empty segment, % or \
--   generation_id, edit_project_id, output_asset_id - a row the caller can see
--                     (each table's own RLS: her or her workspace's).
-- Files only; applied by hand.
create or replace function public.post_refs_belong_to_owner(
  p_owner uuid, p_media_path text, p_generation uuid, p_edit_project uuid, p_output_asset uuid
) returns boolean language sql stable set search_path = public as $$
  select (p_media_path is null or (split_part(p_media_path, '/', 1) = p_owner::text
                                   and p_media_path !~ '(^|/)\.{0,2}(/|$)'
                                   and p_media_path !~ '[%\\]'))
     and (p_generation is null or exists (select 1 from public.generations g where g.id = p_generation))
     and (p_edit_project is null or exists (select 1 from public.edit_projects e where e.id = p_edit_project))
     and (p_output_asset is null or exists (select 1 from public.media_assets m where m.id = p_output_asset))
$$;
revoke all on function public.post_refs_belong_to_owner(uuid, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.post_refs_belong_to_owner(uuid, text, uuid, uuid, uuid) to authenticated;

drop policy if exists "posts own insert" on public.posts;
create policy "posts own insert" on public.posts for insert to authenticated
  with check (owner_id = auth.uid()
              and public.post_refs_belong_to_owner(owner_id, media_path, generation_id, edit_project_id, output_asset_id));

drop policy if exists "workspace posts update" on public.posts;
create policy "workspace posts update" on public.posts for update
  using (owner_id in (select public.workspace_peers()))
  with check (owner_id in (select public.workspace_peers())
              and public.post_refs_belong_to_owner(owner_id, media_path, generation_id, edit_project_id, output_asset_id));
