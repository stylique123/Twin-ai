-- RELEASE REGISTRY SOURCE AND KILL SWITCH (docs/release/shadow-and-flags.md §2, §6).
-- One row per release component: its stage, rollout percentage and kill switch.
-- The edge reads it only when RELEASE_REGISTRY_SOURCE=table; the release monitor
-- (scripts/ops/releaseMonitor.mjs, once enabled) sets `killed`. A kill is cleared
-- only by a person. Every row is seeded at S0, 0%, not killed: today's behaviour.
-- Service role only (RLS on, no policies).
-- Also lets ai_usage_ledger carry shadow spend (traffic 'shadow'), which the
-- shadow runner's daily cap (SHADOW_DAILY_USD) is checked against.
-- FILE ONLY: not applied. Apply by hand together with 0290 before any component reaches S1.
create table if not exists public.release_flags (
  component text primary key check (component in ('planner', 'hook_engine', 'spine', 'templates', 'robot_phrases', 'outside_select', 'invention_gate')),
  stage text not null default 'S0' check (stage in ('S0', 'S1', 'S2', 'S3')),
  rollout_pct integer not null default 0 check (rollout_pct between 0 and 100),
  killed boolean not null default false,
  killed_reason text,
  killed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.release_flags enable row level security;
revoke all on public.release_flags from anon, authenticated;

insert into public.release_flags (component) values
  ('planner'), ('hook_engine'), ('spine'), ('templates'), ('robot_phrases'), ('outside_select'), ('invention_gate')
on conflict (component) do nothing;

alter table public.ai_usage_ledger drop constraint if exists ai_usage_ledger_traffic_check;
alter table public.ai_usage_ledger add constraint ai_usage_ledger_traffic_check
  check (traffic in ('test', 'audit', 'real', 'shadow'));
