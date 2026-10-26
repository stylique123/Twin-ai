-- Ops audit 2026-10-26: complete spend reports. Files only; applied by hand.
--
-- 1. The edge writer (generate-blueprint) now writes ai_usage_ledger rows with
--    stage 'script:<stage>' (writer, editor, repair, ...), one per stage and
--    model per request, including failed requests. ai_cost_by_stage_worker
--    already reads the whole ledger, so it picks them up; this view says where
--    each row came from so the two sources are never summed twice against
--    ai_cost_by_stage_script (which reads the saved blueprint instead).
-- 2. A price for gemini-embedding-001 (the writer's embed call). UNCONFIRMED,
--    like every other row; embeddings bill on input only.

insert into public.ai_model_prices (model, input_per_m, output_per_m, cached_per_m, confirmed, source) values
  ('gemini-embedding-001', 0.15, 0, null, false, 'UNCONFIRMED third-party listings; input only, output not billed')
on conflict (model) do nothing;

-- All AI spend by day, source (script = edge writer, shadow, worker), stage and model.
create or replace view public.ai_cost_by_day with (security_invoker = true) as
select date_trunc('day', l.created_at) as day, l.traffic,
  case when l.stage like 'script:%' then 'script'
       when l.stage like 'shadow_%' then 'shadow'
       else 'worker' end as source,
  l.stage, l.model,
  sum(l.calls) as calls, sum(l.input_tokens) as input_tokens,
  sum(l.output_tokens + l.thinking_tokens) as output_tokens,
  round(sum(l.input_tokens * p.input_per_m + (l.output_tokens + l.thinking_tokens) * p.output_per_m) / 1e6, 4) as est_usd,
  bool_and(coalesce(p.confirmed, false)) as prices_confirmed
from public.ai_usage_ledger l left join public.ai_model_prices p on p.model = l.model
where l.model not like 'apify:%'
group by 1, 2, 3, 4, 5;
revoke all on public.ai_cost_by_day from anon, authenticated;
