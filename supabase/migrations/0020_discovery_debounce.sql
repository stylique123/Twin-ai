-- Wave 1 (#9 + trust hardening) — debounce and sanitize the discovery auto-trigger.
--
-- BEFORE (0016): EVERY building->ready transition with a niche the gallery didn't
-- cover fired a GitHub workflow_dispatch. A signup burst — or scripted voice
-- builds within the 8/hour cap across accounts — fanned out into one CI run plus
-- a paid Apify discovery scrape PER event, with no cap. And the niche string is
-- user-influenced (brand_voices.profile is user-writable) yet flowed straight into
-- the workflow input.
--
-- AFTER: a strict sanitize/allowlist on the niche, and a per-niche 1-hour debounce
-- backed by a log table, so a given niche dispatches at most once an hour no matter
-- how many voices resolve to it.

-- Per-niche debounce ledger (service-role only).
create table if not exists public.discovery_dispatch_log (
  niche         text primary key,   -- lower-cased
  last_dispatch timestamptz not null default now()
);
alter table public.discovery_dispatch_log enable row level security;
revoke all on public.discovery_dispatch_log from anon, authenticated;

-- Allow only letters/digits/space/hyphen, collapse whitespace, cap length. Any
-- other input (control chars, quotes, shell/JSON metacharacters) is stripped, so a
-- tampered profile can't inject into the workflow input.
create or replace function public.sanitize_niche(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(nullif(
    left(btrim(regexp_replace(regexp_replace(coalesce(p, ''), '[^a-zA-Z0-9 -]', '', 'g'), '\s+', ' ', 'g')), 40),
  ''), '');
$$;

-- Re-defines the function the existing trg_kick_discovery trigger (0016) points at.
create or replace function public.kick_discovery_on_new_niche()
returns trigger
language plpgsql
security definer set search_path = public, vault, net
as $fn$
declare
  tok         text;
  raw_niche   text;
  raw_sub     text;
  cand        text;
  cands       text[] := '{}';
  to_send     text[] := '{}';
  window_secs integer := 3600;
begin
  -- Only on the building -> ready transition.
  if new.status <> 'ready' or old.status is not distinct from 'ready' then
    return new;
  end if;

  raw_niche := public.sanitize_niche(new.profile->>'niche');
  raw_sub   := public.sanitize_niche(new.profile->>'sub_niche');

  -- Candidates that are genuinely new to the gallery.
  if raw_niche <> '' and not exists (
    select 1 from public.gallery_items gi where lower(gi.niche) = lower(raw_niche)
  ) then
    cands := array_append(cands, raw_niche);
  end if;
  if raw_sub <> '' and lower(raw_sub) <> lower(raw_niche) and not exists (
    select 1 from public.gallery_items gi where lower(gi.niche) = lower(raw_sub)
  ) then
    cands := array_append(cands, raw_sub);
  end if;

  -- Debounce: dispatch a niche at most once per window. Record the ones we send.
  foreach cand in array cands loop
    if not exists (
      select 1 from public.discovery_dispatch_log d
       where d.niche = lower(cand)
         and d.last_dispatch > now() - make_interval(secs => window_secs)
    ) then
      to_send := array_append(to_send, cand);
      insert into public.discovery_dispatch_log (niche, last_dispatch)
      values (lower(cand), now())
      on conflict (niche) do update set last_dispatch = excluded.last_dispatch;
    end if;
  end loop;

  if array_length(to_send, 1) is null then
    return new;
  end if;

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
      body := jsonb_build_object('ref', 'main', 'inputs', jsonb_build_object('only_niche', array_to_string(to_send, ',')))
    );
  end if;

  return new;
end
$fn$;
