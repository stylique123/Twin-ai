-- THE SCRIPT TEST BATCH (owner 2026-10-02): every scenario the batch runs, the
-- writer's answer and the code checks on the script it returned. Written only by
-- the batch workflow with the service key; read by the audit. No client access.
create table if not exists public.script_batch_results (
  id bigint generated always as identity primary key,
  batch text not null,
  n int not null,
  scenario jsonb not null,
  status int,
  code text,
  reason text,
  generation_id uuid,
  duration_ms int,
  findings jsonb not null default '[]'::jsonb,
  script_text text,
  hooks jsonb,
  created_at timestamptz not null default now()
);
create index if not exists script_batch_results_batch on public.script_batch_results (batch, n);
alter table public.script_batch_results enable row level security;
