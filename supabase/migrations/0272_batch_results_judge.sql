-- The creator's-eye score for each batch script (owner 2026-10-03): hook,
-- structure, angle, her info, outside info, invention, value, conversion,
-- voice, scenes, overall, and the biggest fix. Written by the script-batch
-- workflow only.
alter table public.script_batch_results add column if not exists judge jsonb;
