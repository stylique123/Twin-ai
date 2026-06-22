-- Watermark policy (panel: let free users verify real output before paying). A free
-- user's FIRST auto-edit export is clean; this flag records that they've consumed it,
-- so every export after carries a subtle TwinAI mark. Paid users are never watermarked
-- and never set this. Service-role only (the worker sets it); no client write needed.
alter table public.profiles add column if not exists free_export_used boolean not null default false;
