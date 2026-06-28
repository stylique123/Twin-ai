-- Lock down notification UPDATEs to the `read` flag only.
-- 0047 granted full UPDATE on notifications to authenticated, so an owner could
-- rewrite title/body/type/link of their own rows (e.g. craft a misleading in-app
-- link). The only legitimate client write is marking-as-read, so restrict the
-- column grant to match — mirroring the profiles/brand_voices lockdown pattern.
-- The row-level "notifications_update_own" policy (0047) still applies.
revoke update on public.notifications from authenticated;
grant update (read) on public.notifications to authenticated;
