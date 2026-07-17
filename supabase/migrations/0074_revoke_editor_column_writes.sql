-- Manual-editor remnant cleanup (Stage 4): stop the client from writing the old
-- editor's per-generation columns.
--
-- This file matches EXACTLY what was applied + recorded to production as migration
-- `revoke_editor_column_writes` (version 20260717125117). It revokes the COLUMN-level
-- UPDATE grants for the three old-editor columns:
--   * edit_style     — old editor "look" (the LIVE residual write path; authenticated
--                      had a column grant on it). No code writes it anymore
--                      (updateGenerationChoice no longer accepts edit_style).
--   * edl_path       — old Edit Decision List pointer.
--   * scene_timeline — recording plan (authenticated already lacked this grant).
--
-- NOTE: `anon` held a TABLE-level UPDATE grant on generations, which shadows these
-- column-level revokes, so the three `... from anon` lines below are no-ops for anon.
-- The anon table-level grant is removed by the follow-up corrective migration
-- 0075_revoke_anon_generations_update.sql. (anon can never pass the generations
-- UPDATE RLS policy anyway — workspace_peers() is empty without a session — so this
-- is defence in depth, not a live hole.)
--
-- No data is dropped; historical column values remain readable. authenticated keeps
-- approved (agency) + selected_hook (recording); edit_path/take_path/thumb_path are
-- untouched.

revoke update (edit_style)     on public.generations from authenticated;
revoke update (edit_style)     on public.generations from anon;
revoke update (edl_path)       on public.generations from anon;
revoke update (scene_timeline) on public.generations from anon;
