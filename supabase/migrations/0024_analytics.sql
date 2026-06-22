-- Analytics / data layer — the foundation for product metrics, case studies, and
-- the pre-seed data room. ONE append-only event table captures everything (no
-- table-per-metric sprawl); `time_saved_minutes` makes the headline "hours saved"
-- number trivially aggregatable. A metrics_overview view rolls up the KPIs.

create table if not exists public.analytics_events (
  id                 bigint generated always as identity primary key,
  user_id            uuid references auth.users (id) on delete set null,
  event              text not null,                 -- e.g. blueprint_generated, edit_rendered, gallery_remix, post_logged
  props              jsonb not null default '{}'::jsonb,
  time_saved_minutes integer not null default 0,    -- estimated creator time saved by this event
  created_at         timestamptz not null default now()
);
create index if not exists analytics_events_event_idx on public.analytics_events (event, created_at desc);
create index if not exists analytics_events_user_idx  on public.analytics_events (user_id, created_at desc);

alter table public.analytics_events enable row level security;
-- Clients may log their OWN actions (gallery clicks, etc.); server events use the
-- service role (bypasses RLS). Reads are admin-only (the data room is not public).
create policy "own analytics insert" on public.analytics_events for insert to authenticated
  with check (auth.uid() = user_id);
create policy "admin analytics read" on public.analytics_events for select using (public.is_platform_admin(auth.uid()));

-- Headline KPIs for the data room / investor deck. Query via service role or as a
-- platform admin. Activation funnel + engagement + the hero "hours saved" metric.
create or replace view public.metrics_overview as
select
  (select count(*) from public.profiles)                                            as total_users,
  (select count(*) from public.profiles where onboarded)                            as onboarded_users,
  (select count(*) from public.brand_voices where status = 'ready')                 as voices_built,
  (select count(*) from public.generations)                                         as blueprints_generated,
  (select count(*) from public.jobs where type = 'autoedit' and status = 'done')    as edits_rendered,
  (select count(*) from public.posts where status = 'posted')                       as posts_logged,
  (select count(*) from public.referrals)                                           as referrals_redeemed,
  round((select coalesce(sum(time_saved_minutes), 0) from public.analytics_events) / 60.0, 1) as total_hours_saved,
  (select count(distinct user_id) from public.analytics_events where created_at > now() - interval '7 days')  as wau,
  (select count(distinct user_id) from public.analytics_events where created_at > now() - interval '30 days') as mau;

revoke all on public.metrics_overview from anon, authenticated;
