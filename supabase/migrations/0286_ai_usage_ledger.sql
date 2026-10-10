-- Plan 11.1-2: THE USAGE LEDGER. One row per model per worker job: the job
-- type is the stage, tokens as Gemini reports them, and a traffic tag (test
-- for owners in the worker's TEST_OWNER_IDS, else real). Price per model lives
-- elsewhere. Service role only; no client access.
create table if not exists public.ai_usage_ledger (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  job_id uuid,
  stage text not null,
  owner_id uuid,
  model text not null,
  calls integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  thinking_tokens bigint not null default 0,
  cached_tokens bigint not null default 0,
  traffic text not null check (traffic in ('test', 'audit', 'real'))
);
create index if not exists ai_usage_ledger_created on public.ai_usage_ledger (created_at);
alter table public.ai_usage_ledger enable row level security;
