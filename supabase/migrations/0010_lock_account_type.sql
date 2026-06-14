-- Security fix: lock down profiles.account_type.
--
-- account_type is an entitlement column ('agency' unlocks multi-brand workspaces
-- and is also set by the billing webhook on the agency plan). 0002 granted it to
-- the client-updatable column set alongside dna/display_name/onboarded, which let
-- any authenticated user self-promote to 'agency' via a direct PostgREST
-- UPDATE (confirmed exploitable in production). Only server-side code (admin /
-- billing-webhook, via the service role) may change it now.
revoke update (account_type) on public.profiles from authenticated, anon;
