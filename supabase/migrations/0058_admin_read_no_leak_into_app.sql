-- SECURITY: stop platform-admin accounts from seeing every user's data in the
-- NORMAL creator app.
--
-- Root cause: brand_voices / generations / profiles each carried an "admin read"
-- SELECT policy gated on is_platform_admin(auth.uid()). RLS policies are OR'd, so
-- for an admin session that policy returns EVERY row. The creator app (Dashboard,
-- Gallery, Library, Workspaces) has no admin-vs-normal distinction — it just does
-- `select * from <table>` — so an admin logged into the app sees the entire
-- platform's brand voices, scripts and profiles piled into their own views
-- (18 brand voices on a Free plan, 24 "scripts" that are everyone's, etc.).
--
-- Regular users were never affected: their reads are scoped by workspace_peers(),
-- which returns just themselves when workspace_members is empty. Verified.
--
-- Fix: drop the admin-read policies on the three tables that surface in the
-- creator app. Admin oversight of this data already goes exclusively through the
-- service-role edge functions (admin-metrics, admin), which bypass RLS entirely,
-- so nothing legitimate depends on these policies. The truly admin-only tables
-- (admin_audit_log, analytics_events, credit_events, jobs, ops_events,
-- platform_admins, transcripts) keep their admin-read — they never render in the
-- creator app, so they can't leak into it.

drop policy if exists "admin read brand_voices" on public.brand_voices;
drop policy if exists "admin read generations" on public.generations;
drop policy if exists "admin read profiles" on public.profiles;
