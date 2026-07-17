-- Corrective follow-up to 0076 (found during post-merge posture verification):
-- the platform's default privileges also granted TRUNCATE/REFERENCES/TRIGGER
-- on media_assets to authenticated. None of these are reachable through
-- PostgREST, but the audited posture is explicit-grants-only — authenticated
-- keeps exactly SELECT (RLS-scoped), nothing else.
revoke truncate, references, trigger on public.media_assets from authenticated;
