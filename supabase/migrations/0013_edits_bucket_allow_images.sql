-- The auto-edit worker uploads a cover thumbnail (JPEG) alongside the finished
-- MP4 into the `edits` bucket. The bucket previously allowed only video mime
-- types, so every thumbnail upload was rejected (400) and the cover silently
-- never appeared. Allow images so covers persist next to their render.
update storage.buckets
set allowed_mime_types = array['video/webm', 'video/mp4', 'video/quicktime', 'image/jpeg', 'image/png']
where id = 'edits';
