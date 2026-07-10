-- Agency tier: make workspace content genuinely shared across the team.
--
-- Reads of `generations` already use workspace_peers() (0049), so members see the
-- workspace library. But two things were still creator-only, breaking the agency
-- flow:
--   1. Storage read on the finished video (edits) + raw take (takes) was
--      own-folder-only, so a teammate could see a generation row but could NOT
--      play/download its video. Broaden to any workspace peer's folder.
--   2. ensure_review_token only let the CREATOR mint a client-approval link, so an
--      agency owner couldn't send a teammate's video for client approval. Allow any
--      workspace peer to create/read the token.
--
-- workspace_peers() (SECURITY DEFINER) returns the caller's whole workspace (owner
-- + all members), resolving correctly whether the caller is the owner or a member.

-- 1a. edits (finished renders) — workspace-peer read
drop policy if exists "twinai edits read" on storage.objects;
create policy "twinai edits read" on storage.objects for select to authenticated
  using (bucket_id = 'edits' and (storage.foldername(name))[1] in (select workspace_peers()::text));

-- 1b. takes (raw recordings) — workspace-peer read
drop policy if exists "twinai takes read" on storage.objects;
create policy "twinai takes read" on storage.objects for select to authenticated
  using (bucket_id = 'takes' and (storage.foldername(name))[1] in (select workspace_peers()::text));

-- 2. Client-approval links: any workspace peer can mint/read the token for a
--    workspace generation (not just the original creator).
create or replace function public.ensure_review_token(p_gen uuid)
returns text language plpgsql security definer set search_path to 'public','extensions'
as $function$
declare tok text; st text; begin
  select review_token, review_status into tok, st
    from public.generations
    where id = p_gen and user_id in (select workspace_peers());
  if not found then raise exception 'not your generation'; end if;
  if tok is null then
    tok := encode(gen_random_bytes(12),'hex');
    update public.generations
      set review_token = tok,
          review_status = case when review_status='none' then 'pending' else review_status end
      where id = p_gen;
  end if;
  return tok;
end $function$;
