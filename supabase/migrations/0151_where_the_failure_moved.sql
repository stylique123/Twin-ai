-- "THE PROXY FAILED" WOULD POOL TWO OPPOSITE RESULTS.
--
-- ⚠️ THE CANARY'S REAL QUESTION IS NOT WHETHER RESIDENTIAL ROUTING SUCCEEDS. It
-- is whether residential routing MOVES THE WALL. If it turns "Unexpected response
-- from webpage request" (TikTok's challenge layer, where all three local canaries
-- died) into "media URL found, download began, then 403 from the CDN", the proxy
-- did NOT fail — it carried us through the challenge and a different boundary
-- with its own behaviour is now in front of us. Those two outcomes want opposite
-- next steps, and a single success/failure column cannot tell them apart.
--
-- ⚖️ ONE JSONB COLUMN, NOT SIX SCALARS. This is a diagnostic for an experiment,
-- not a dimension anybody aggregates yet; six columns would be six migrations of
-- commitment to a shape we are still learning. `download_route` stays its own
-- typed, constrained column precisely because that one IS aggregated — it decides
-- whether the TikTok library is effectively free or carries residential cost.
--
-- ⚠️ WHAT IT MAY NOT CONTAIN: credentials. `session_hash` is a hash, so it can
-- answer "were these requests one residential attempt?" without storing the
-- video URL or the proxy password. The raw error keeps its own column.

alter table public.reference_content_profiles
  add column if not exists download_trace jsonb;

comment on column public.reference_content_profiles.download_trace is
  'Diagnostic trace of the last acquisition attempt: {route, session_hash, failure_code, phase, elapsed_ms, bytes_downloaded}. Phase says WHERE it stopped, so a moved failure boundary is visible. Never contains credentials. See worker/src/downloadFailure.ts DOWNLOAD_PHASES.';

-- ⚠️ RLS does not gate TRUNCATE and 0140 covered only the tables that existed
-- when it ran. This table predates it, so the revoke is already in place —
-- asserted here rather than assumed, for the same reason 0149 learned to.
revoke truncate on table public.reference_content_profiles from anon, authenticated;
