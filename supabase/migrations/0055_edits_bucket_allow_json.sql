-- The worker uploads the Edit Decision List (EDL) as application/json into the
-- `edits` bucket alongside the render (worker/src/jobs/autoedit.ts), but the
-- bucket's allowed_mime_types (set in 0013) only covers video + image types —
-- so every EDL upload was rejected, edl_path stayed null, and the whole Refine
-- (fine-tune) flow was dead. Allow JSON so the EDL persists with its render.
update storage.buckets
set allowed_mime_types = array['video/webm', 'video/mp4', 'video/quicktime', 'image/jpeg', 'image/png', 'application/json']
where id = 'edits';
