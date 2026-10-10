-- Plan 11.1-1: what a model call costs, per 1M tokens. Seeded 2026-10-10 from
-- third-party price listings (Google's own page could not be reached), so every
-- row is UNCONFIRMED until checked against the real Google bill. Output price
-- includes thinking tokens. Service role only.
create table if not exists public.ai_model_prices (
  model text primary key,
  input_per_m numeric not null,
  output_per_m numeric not null,
  cached_per_m numeric,
  confirmed boolean not null default false,
  source text not null,
  as_of date not null default current_date
);
alter table public.ai_model_prices enable row level security;

insert into public.ai_model_prices (model, input_per_m, output_per_m, cached_per_m, confirmed, source) values
  ('gemini-3.8-flash', 0.75, 3.75, 0.075, false, 'UNCONFIRMED third-party listings (eesel, pricepertoken); intro rate to 2026-12-31'),
  ('gemini-3.7-flash', 0.75, 3.75, 0.075, false, 'UNCONFIRMED third-party listings (anotherwrapper); another lists 0.375/1.88'),
  ('gemini-3.1-pro-preview', 2.00, 12.00, 0.20, false, 'UNCONFIRMED third-party listings (artificialanalysis, pricepertoken); prompts under 200k'),
  ('gemini-3.5-flash', 1.50, 9.00, 0.15, false, 'UNCONFIRMED third-party listings (anotherwrapper, pricepertoken)')
on conflict (model) do nothing;

-- Worker jobs: cost by day, traffic and stage (stage = job type).
create or replace view public.ai_cost_by_stage_worker with (security_invoker = true) as
select date_trunc('day', l.created_at) as day, l.traffic, l.stage, l.model,
  sum(l.calls) as calls, sum(l.input_tokens) as input_tokens,
  sum(l.output_tokens + l.thinking_tokens) as output_tokens,
  round(sum(l.input_tokens * p.input_per_m + (l.output_tokens + l.thinking_tokens) * p.output_per_m) / 1e6, 4) as est_usd,
  bool_and(coalesce(p.confirmed, false)) as prices_confirmed
from public.ai_usage_ledger l left join public.ai_model_prices p on p.model = l.model
group by 1, 2, 3, 4;

-- Scripts: cost per generation by stage (writer, editor, repair, lengthen,
-- judge, other), from blueprint.ai_usage_by_stage keyed "stage|model".
create or replace view public.ai_cost_by_stage_script with (security_invoker = true) as
select g.id as generation_id, g.created_at, split_part(e.key, '|', 1) as stage, split_part(e.key, '|', 2) as model,
  (e.value->>'calls')::int as calls, (e.value->>'input')::bigint as input_tokens,
  ((e.value->>'output')::bigint + (e.value->>'thinking')::bigint) as output_tokens,
  round((((e.value->>'input')::bigint) * p.input_per_m + (((e.value->>'output')::bigint + (e.value->>'thinking')::bigint)) * p.output_per_m) / 1e6, 5) as est_usd,
  coalesce(p.confirmed, false) as price_confirmed
from public.generations g
cross join lateral jsonb_each(coalesce(g.blueprint->'ai_usage_by_stage', '{}'::jsonb)) e
left join public.ai_model_prices p on p.model = split_part(e.key, '|', 2);
