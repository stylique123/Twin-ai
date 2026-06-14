-- Security fix (H3): gallery_items.url is user-submitted, public-readable, and
-- flows into the remix/ingest path. Require it to be an https URL so a
-- javascript:/data:/http: scheme can never be stored (defense-in-depth; the
-- ingest-reference allowlist already re-validates the host on use). NOT VALID so
-- existing rows are left untouched; enforced on all new inserts.
alter table public.gallery_items
  add constraint gallery_items_url_https check (url like 'https://%') not valid;
