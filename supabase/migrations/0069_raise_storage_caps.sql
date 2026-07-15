-- Production-readiness (Phase 2/4) — raise storage bucket size caps to match the
-- worker's assumption.
--
-- 0065 created `takes` and `edits` with a 50MB (52428800) file_size_limit, but the
-- worker streams media up to WORKER_MAX_DOWNLOAD_BYTES (default 600MB, see
-- worker/src/env.ts). A real 1080x1920 recording of a minute-plus easily exceeds
-- 50MB, so the take upload was rejected by Storage while the worker would have
-- happily processed it — the "longer recordings silently fail to upload" bug. This
-- also blocks server-side autosave of takes.
--
-- 0065's insert is `on conflict do nothing`, so editing 0065 is a no-op on a live
-- project where the buckets already exist — the cap must be changed with an UPDATE.
-- Raise both to 600MB to match the worker (raw takes AND finished renders both live
-- in these buckets).

update storage.buckets
   set file_size_limit = 629145600  -- 600 * 1024 * 1024
 where id in ('takes', 'edits');
