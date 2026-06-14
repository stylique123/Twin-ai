-- Auto-edit cover thumbnail: store the path of the generated cover image so the
-- finished render can show a real thumbnail (closes the "no thumbnail produced"
-- gap). Written by the worker (service role); read by the app.
alter table public.generations add column if not exists thumb_path text;
