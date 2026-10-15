-- RELEASE S1 SHADOW (docs/release/shadow-and-flags.md). One row per shadow run:
-- the new pipeline ran silently after the real response was sent, and its
-- output is compared with the live one. Ids, numbers and flags only; script
-- text stays in the private jsonb columns below and is NEVER logged.
-- Service role only (RLS on, no policies); no client can read it.
-- FILE ONLY: not applied. Nothing writes it until a component reaches S1.
create table if not exists public.shadow_runs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  generation_id uuid,
  owner_id uuid,
  component text not null,
  registry_version text not null,
  status text not null check (status in ('ok', 'failed', 'timeout', 'budget_skipped', 'killed')),
  live_latency_ms integer,
  shadow_latency_ms integer,
  shadow_cost_usd numeric(10, 5) not null default 0,
  live_invented integer,
  shadow_invented integer,
  live_postable boolean,
  shadow_postable boolean,
  error_code text,
  live_output jsonb,
  shadow_output jsonb
);
create index if not exists shadow_runs_component_created on public.shadow_runs (component, created_at);
alter table public.shadow_runs enable row level security;
revoke all on public.shadow_runs from anon, authenticated;
