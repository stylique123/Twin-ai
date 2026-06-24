-- Big build 3 (agency), stage 3: login-free CLIENT APPROVAL on a finished video.
-- An agency shares /review/:token with a client; the client watches the rendered
-- reel + reads the script and clicks Approve or Request changes — no account.
-- Mirrors the white-label client report (0035): an unguessable token IS the access
-- control. The public read/submit run through the `review` edge function (service
-- role, so it can sign the private edits-bucket video); minting the token is
-- owner-gated here via an RPC (mirrors ensure_brand_share_token).

alter table public.generations add column if not exists review_token  text unique;
alter table public.generations add column if not exists review_status text not null default 'none';
alter table public.generations add column if not exists review_note   text;
alter table public.generations add column if not exists reviewed_at   timestamptz;

-- review_status: 'none' (never shared) | 'pending' (link live, awaiting client)
--               | 'approved' | 'changes' (client asked for changes)
alter table public.generations drop constraint if exists generations_review_status_chk;
alter table public.generations add constraint generations_review_status_chk
  check (review_status in ('none', 'pending', 'approved', 'changes'));

-- Owner-gated: mint (once, lazily) and return a generation's client-review token,
-- flipping status to 'pending' the first time it's shared.
create or replace function public.ensure_review_token(p_gen uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare tok text; st text;
begin
  select review_token, review_status into tok, st
    from public.generations where id = p_gen and user_id = auth.uid();
  if not found then raise exception 'not your generation'; end if;
  if tok is null then
    tok := encode(gen_random_bytes(12), 'hex');
    update public.generations set review_token = tok,
      review_status = case when review_status = 'none' then 'pending' else review_status end
      where id = p_gen;
  end if;
  return tok;
end $$;
revoke all on function public.ensure_review_token(uuid) from public;
grant execute on function public.ensure_review_token(uuid) to authenticated;
