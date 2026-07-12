-- Make the Dashboard/Library stat drift impossible at the source: an auto-edit
-- job may NOT exist without a generation (blueprint) to anchor it. This is what
-- caused "3 videos edited" while the Library (which reads generations) showed
-- nothing — old bare-upload edit jobs had no generation_id, so the jobs table
-- drifted from generations. Those orphans have been deleted; this constraint
-- guarantees no new one can ever be created.
--
-- Only autoedit jobs are constrained; every other job type (build_dna,
-- build_voice, ingest, scrape_dna, …) legitimately has no generation and is
-- unaffected. The edge function (enqueue-autoedit) also rejects a missing
-- generation up front with a clean 400 — this is the belt-and-braces DB backstop.
alter table public.jobs
  add constraint autoedit_requires_generation
  check (type <> 'autoedit' or (payload->>'generation_id') is not null);
