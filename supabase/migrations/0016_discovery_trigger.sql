-- Auto-trigger discovery when a brand voice goes ready with a NICHE the gallery
-- doesn't cover yet, so a new creator's niche/sub-niche appears in the gallery
-- within seconds instead of waiting for the periodic discovery cron. Fires for
-- BOTH the edge (Apify) and worker (yt-dlp) DNA paths, since both UPDATE the row.
--
-- The GitHub dispatch token lives in Supabase Vault under 'gh_dispatch_token'
-- (set out-of-band, NEVER committed). Rotate it on GitHub and update the Vault
-- secret to replace it:
--   select vault.update_secret(
--     (select id from vault.secrets where name='gh_dispatch_token'), '<new-token>');
create extension if not exists pg_net;
create extension if not exists supabase_vault;

create or replace function public.kick_discovery_on_new_niche()
returns trigger language plpgsql security definer set search_path = public, vault, net as $fn$
declare
  tok text;
  v_niche text;
  v_sub text;
  new_list text;
begin
  -- Only on the building -> ready transition.
  if new.status <> 'ready' or old.status is not distinct from 'ready' then
    return new;
  end if;

  v_niche := lower(coalesce(new.profile->>'niche', ''));
  v_sub := lower(coalesce(new.profile->>'sub_niche', ''));

  -- The niche/sub-niche values that are genuinely NEW (not already in the gallery),
  -- in their original case, so discovery only ever scrapes what's actually missing.
  new_list := array_to_string(array_remove(array[
    case when v_niche <> '' and not exists (select 1 from public.gallery_items gi where lower(gi.niche) = v_niche)
         then new.profile->>'niche' end,
    case when v_sub <> '' and not exists (select 1 from public.gallery_items gi where lower(gi.niche) = v_sub)
         then new.profile->>'sub_niche' end
  ], null), ',');

  if new_list <> '' then
    select decrypted_secret into tok from vault.decrypted_secrets where name = 'gh_dispatch_token';
    if tok is not null then
      perform net.http_post(
        url := 'https://api.github.com/repos/stylique123/Twin-ai/actions/workflows/deploy-discovery.yml/dispatches',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || tok,
          'Accept', 'application/vnd.github+json',
          'User-Agent', 'twinai-discovery-trigger',
          'Content-Type', 'application/json'
        ),
        -- Scrape ONLY the new niche(s) via the workflow input, not a full sweep.
        body := jsonb_build_object('ref', 'main', 'inputs', jsonb_build_object('only_niche', new_list))
      );
    end if;
  end if;

  return new;
end
$fn$;

drop trigger if exists trg_kick_discovery on public.brand_voices;
create trigger trg_kick_discovery
  after update on public.brand_voices
  for each row execute function public.kick_discovery_on_new_niche();
