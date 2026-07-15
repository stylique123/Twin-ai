-- 0065: create the core storage buckets IN a migration.
--
-- Every render/upload flow depends on the private `takes` (raw recordings) and
-- `edits` (finished renders, EDLs, thumbs, logos) buckets, but they were created
-- out-of-band via the Storage API (see the note in 0006) — so a fresh project
-- restored from migrations alone had NO buckets and every upload 404'd, and the
-- `update storage.buckets` statements in 0013/0055 silently no-op'd.
-- Idempotent: on the live project (buckets already exist) this does nothing.
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('takes', 'takes', false, 52428800),
  ('edits', 'edits', false, 52428800)
on conflict (id) do nothing;
