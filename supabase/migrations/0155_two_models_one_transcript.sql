-- ASKING THE SAME QUESTION TWICE AND KEEPING BOTH ANSWERS.
--
-- ⚠️ THE ROUTING LOOKS INVERTED, AND NOBODY CHOSE IT. model_routing_v1.json
-- records the finding in its own header: `decide` — the Director, which picks
-- cuts, hook, pacing, captions and zooms, and shapes every video — runs on
-- FLASH. `extract` — pulling structured facts out of a transcript under a fixed
-- schema, the most mechanical of the three, whose own env comment argues a flash
-- model costs "no quality loss on these schema-constrained tasks" — runs on PRO.
-- That is what three independent decisions added up to, not a judgement anybody
-- made.
--
-- ⚖️ AND THE CATALOG SAYS THE NEXT MOVE IS AN EVAL, NOT AN EDIT. This project
-- has picked a number by reasoning three times and been wrong three times: a
-- 50-minute CI cap against a real 77, a 25% hook-trim threshold against a
-- legitimate 28.7% case, an 80ms caption tail guard against a real 93-120ms
-- shortfall. Re-pointing extract because the argument sounds right would be the
-- fourth.
--
-- ⚠️ ONE TRANSCRIPT, TWO MODELS, STORED SIDE BY SIDE. Both arms must see
-- BYTE-IDENTICAL input or a difference is unattributable — it could be the
-- model, or it could be that the second download got a different encode. The
-- trial acquires once and asks twice.
--
-- ⚖️ WHAT IS COMPARED IS WHAT TWIN USES, not prose quality. This is extraction,
-- not creative writing: the container it named, the beats it found, where it put
-- the rehook, the slots it says a creator must supply, how transferable it
-- called the structure, and which fields it got REJECTED. A model that writes a
-- lovelier topic sentence and loses a content slot is worse here.
create table if not exists public.extraction_parity_trials (
  id uuid primary key default gen_random_uuid(),

  url text not null,
  -- ⚠️ THE DIGEST OF THE EXACT TEXT BOTH ARMS SAW. Without it, "same input" is a
  -- claim rather than a fact, and the whole comparison rests on that claim.
  transcript_sha256 text not null,
  transcript_chars integer not null,

  model_a text not null,
  model_b text not null,

  -- The full parsed profiles. Stored whole because the questions worth asking
  -- later are not all known now, and re-running costs two more model calls
  -- against a 250/day allowance.
  profile_a jsonb,
  profile_b jsonb,
  rejections_a jsonb,
  rejections_b jsonb,
  fields_accepted_a integer,
  fields_accepted_b integer,

  -- ⚠️ AN ARM THAT FAILED IS A ROW, NOT A GAP. A model that 429s or returns
  -- rubbish is a real property of that model on this task, and a trial table
  -- that silently omitted it would report a parity rate computed only over the
  -- cases where both happened to work.
  error_a text,
  error_b text,

  created_at timestamptz not null default now(),

  constraint extraction_parity_trials_models_differ check (model_a <> model_b),
  constraint extraction_parity_trials_chars_sane check (transcript_chars > 0)
);

create unique index if not exists extraction_parity_trials_one_per_url_pair
  on public.extraction_parity_trials (url, model_a, model_b);

-- ── ACCESS ───────────────────────────────────────────────────────────────
--
-- ⚠️ SYSTEM-OWNED, AND IT HOLDS TRANSCRIPT-DERIVED CONTENT. Written only by the
-- worker under the service role. Supabase grants ALL on new public tables by
-- default, so this must be revoked explicitly rather than left to 0141's sweep.
alter table public.extraction_parity_trials enable row level security;

revoke all on table public.extraction_parity_trials from anon, authenticated;
