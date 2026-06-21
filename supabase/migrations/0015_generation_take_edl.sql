-- Persist the take + EDL paths on the generation so the Refine editor can be
-- opened from ANYWHERE (Result, Library) for a past video — not just right after
-- recording. take_path = the raw recorded clip in the private `takes` bucket;
-- edl_path = the Edit Decision List JSON in the `edits` bucket. The worker
-- (service role) writes these when an edit finishes; the owner can read them.

alter table public.generations
  add column if not exists take_path text,
  add column if not exists edl_path text;
