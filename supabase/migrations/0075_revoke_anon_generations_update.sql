-- Corrective migration for the manual-editor Stage-4 cleanup.
--
-- 0074 revoked the old-editor columns at the COLUMN level, but `anon` held a
-- TABLE-level UPDATE grant on public.generations that shadows column-level revokes,
-- so anon still nominally had UPDATE on edit_style/edl_path/scene_timeline (and every
-- other column). This migration removes that table-level grant so the 0074 intent is
-- actually effective for anon.
--
-- Safe + inert: anon can never pass the generations UPDATE RLS policy
-- (`user_id in (select workspace_peers())` — empty without a session), so anon could
-- not update any row regardless. anon legitimately needs no UPDATE on generations
-- (all writes are authenticated or service-role). This is defence in depth.
--
-- After this migration:
--   authenticated UPDATE columns : approved, selected_hook   (no editor columns)
--   anon UPDATE                  : none

revoke update on public.generations from anon;
