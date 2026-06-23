-- Big build 3 (agency), stage 1: white-label CLIENT REPORT links.
-- An agency can share a login-free, branded report of ONE client brand's results.
-- An unguessable token maps to a brand_voice; a public (anon) security-definer
-- function returns ONLY that brand's aggregate numbers (no PII). The token is the
-- access control. No seats/auth-model change required for this slice.

alter table public.brand_voices add column if not exists share_token text unique;

-- Owner-gated: generate (once, lazily) and return a brand's share token.
create or replace function public.ensure_brand_share_token(p_brand uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare tok text;
begin
  select share_token into tok from public.brand_voices where id = p_brand and owner_id = auth.uid();
  if not found then raise exception 'not your brand'; end if;
  if tok is null then
    tok := encode(gen_random_bytes(12), 'hex');
    update public.brand_voices set share_token = tok where id = p_brand;
  end if;
  return tok;
end $$;

-- Public (anon-callable): token -> the brand's label + aggregate results only.
create or replace function public.brand_report(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_brand uuid; v_owner uuid; v_label text; v_handle text;
        v_blueprints int; v_edits int; v_posts int; v_views bigint;
begin
  select id, owner_id, coalesce(nullif(label,''), '@'||handle), handle
    into v_brand, v_owner, v_label, v_handle
    from public.brand_voices where share_token = btrim(p_token);
  if v_brand is null then return null; end if;
  select count(*) into v_blueprints from public.generations where brand_voice_id = v_brand;
  select count(*) into v_edits from public.generations where brand_voice_id = v_brand and edit_path is not null;
  select count(*) into v_posts from public.posts p where p.owner_id = v_owner
    and exists (select 1 from public.generations g where g.id = p.generation_id and g.brand_voice_id = v_brand);
  select coalesce(sum(p.views),0) into v_views from public.posts p where p.owner_id = v_owner
    and exists (select 1 from public.generations g where g.id = p.generation_id and g.brand_voice_id = v_brand);
  return jsonb_build_object(
    'label', v_label, 'handle', v_handle,
    'blueprints', v_blueprints, 'edits', v_edits, 'posts', v_posts, 'views', v_views,
    'hours_saved', round((v_blueprints * 0.5 + v_edits * 1.5))
  );
end $$;
revoke all on function public.brand_report(text) from public;
grant execute on function public.brand_report(text) to anon, authenticated;
