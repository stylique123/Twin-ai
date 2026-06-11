-- TwinAI Phase 3 wiring — real reference structure into generation.
-- The worker derives a `structure` from the transcript (hook window, beats, CTA,
-- pacing, why-it-works) and stores it on the transcript. A generation records the
-- transcript it was built from, so the blueprint's analysis is now LITERAL.

alter table public.transcripts
  add column if not exists structure jsonb;

alter table public.generations
  add column if not exists transcript_id uuid references public.transcripts (id) on delete set null;
