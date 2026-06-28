-- Fix: brand-kit saves were rejected by column-level privileges.
-- 0002 did `revoke update on brand_voices from authenticated` then granted only
-- (profile, label, is_default). 0043 added the brand_kit column but never granted
-- UPDATE on it, so saveBrandKit()'s `update({ brand_kit })` hit a permission denial.
-- The row-level update policy (0049 workspace brand voices) already permits the row;
-- this adds the missing column grant.
grant update (brand_kit) on public.brand_voices to authenticated;
