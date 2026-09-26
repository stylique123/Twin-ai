-- TEST VIEWERS — every new script is read by ~10 pretend viewers from her
-- audience before she films it, and what they say is kept so the brain learns.
--
-- ⚖️ ON TOP OF THE SYSTEM. Written only by the worker, after the script exists.
-- A failed or missing test means the "Why it works" tab shows what it showed
-- before; the script itself is never touched here.
--
-- Also: corpus reads that FAILED (timeouts) are retried, at most 3 times.

-- ── 1. RETRY FAILED CORPUS READS ────────────────────────────────────────────
alter table public.corpus_reads add column if not exists attempts integer not null default 1;

create or replace function public.corpus_reads_count_attempt()
returns trigger language plpgsql as $$
begin
  new.attempts := coalesce(old.attempts, 0) + 1;
  return new;
end;
$$;
drop trigger if exists corpus_reads_count_attempt on public.corpus_reads;
create trigger corpus_reads_count_attempt before update on public.corpus_reads
  for each row execute function public.corpus_reads_count_attempt();

create or replace function public.brain_unread(p_version integer, p_limit integer default 15)
returns setof public.gallery_items
language sql stable security definer set search_path = public as $$
  select g.* from public.gallery_items g
  where not exists (
    select 1 from public.corpus_reads r
    where r.gallery_item_id = g.id and r.version >= p_version
      -- a timeout says nothing about the video: try again later, three times at most
      and not (r.status = 'failed' and r.attempts < 3 and r.read_at < now() - interval '6 hours')
  )
  order by g.created_at desc
  limit greatest(1, least(p_limit, 100));
$$;
revoke all on function public.brain_unread(integer, integer) from public, anon, authenticated;
grant execute on function public.brain_unread(integer, integer) to service_role;

-- ── 2. THE TESTS ────────────────────────────────────────────────────────────
create table if not exists public.audience_tests (
  generation_id uuid primary key references public.generations(id) on delete cascade,
  owner_id      uuid not null references auth.users(id) on delete cascade,
  status        text not null check (status in ('done','failed')),
  panel_size    integer,
  -- [{ hook, stopped }]  — how many of the panel would stop for each hook option
  hooks         jsonb not null default '[]'::jsonb,
  best_hook     integer,
  -- [{ who, quote, stops_for, leaves_at, question }]
  viewers       jsonb not null default '[]'::jsonb,
  -- [{ issue, fix, beat, count }]  — what Twin would change, and how many flagged it
  fixes         jsonb not null default '[]'::jsonb,
  summary       text,
  model         text,
  failure       text,
  learned_at    timestamptz,
  created_at    timestamptz not null default now()
);
alter table public.audience_tests enable row level security;
drop policy if exists audience_tests_own_read on public.audience_tests;
create policy audience_tests_own_read on public.audience_tests for select to authenticated
  using (owner_id = auth.uid());

-- Scripts written in the last hour that have not been tested yet.
create or replace function public.audience_untested(p_limit integer default 3)
returns table (id uuid, user_id uuid, blueprint jsonb, reference_note text, profile jsonb)
language sql stable security definer set search_path = public as $$
  select g.id, g.user_id, g.blueprint, g.reference_note, v.profile
  from public.generations g
  left join public.brand_voices v on v.id = g.brand_voice_id
  where g.created_at > now() - interval '1 hour'
    and coalesce(g.is_heartbeat, false) = false
    and g.blueprint ? 'hook_options'
    and not exists (select 1 from public.audience_tests t where t.generation_id = g.id)
  order by g.created_at desc
  limit greatest(1, least(p_limit, 10));
$$;
revoke all on function public.audience_untested(integer) from public, anon, authenticated;
grant execute on function public.audience_untested(integer) to service_role;

-- What the test viewers keep flagging for HER — the mistakes log.
create or replace function public.creator_audience_lessons(p_owner uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.n desc), '[]'::jsonb) from (
    select f->>'issue' issue, count(*)::int n, max(t.created_at) last_seen
    from public.audience_tests t, jsonb_array_elements(t.fixes) f
    where t.owner_id = p_owner and t.status = 'done' and t.created_at > now() - interval '60 days'
    group by f->>'issue' order by count(*) desc limit 6) x;
$$;
revoke all on function public.creator_audience_lessons(uuid) from public, anon, authenticated;
grant execute on function public.creator_audience_lessons(uuid) to service_role;
