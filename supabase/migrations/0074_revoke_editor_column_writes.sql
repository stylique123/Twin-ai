-- Manual-editor remnant cleanup (Stage 4): stop the client from writing the old
-- editor's per-generation columns at the DATABASE level, so no manual-editor /
-- EDL / editing-timeline value can be persisted even if some future code tried.
--
-- Two roles, two different grant shapes (both verified before writing this):
--   * authenticated — had COLUMN-level UPDATE grants: approved, edit_style,
--     selected_hook. Only `edit_style` is old-editor; revoke just that column.
--     This closes the one LIVE residual manual-editor write path (nothing in code
--     writes it anymore — updateGenerationChoice no longer accepts edit_style).
--   * anon — had a TABLE-level UPDATE grant (all columns). A column-level revoke
--     is shadowed by the table grant, so to actually remove anon's write access to
--     edit_style / edl_path / scene_timeline we revoke the table-level grant.
--     This is safe and inert: the generations UPDATE RLS policy requires
--     workspace_peers(), which is empty without a session, so anon could never
--     update any row regardless. anon legitimately needs no UPDATE on generations
--     (all writes are authenticated or service-role), so this is defence in depth.
--
-- Deliberately UNCHANGED (active product): authenticated keeps approved (agency)
-- and selected_hook (recording); edit_path (finished-video playback), take_path
-- (recording), thumb_path / ai_thumb_path (covers) are untouched. NO data is
-- dropped; historical column values remain fully readable.

revoke update (edit_style) on public.generations from authenticated;
revoke update            on public.generations from anon;
