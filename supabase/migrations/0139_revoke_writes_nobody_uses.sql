-- TWELVE TABLES CARRY WRITE GRANTS THAT NOTHING IS ALLOWED TO USE.
--
-- Supabase's default privileges grant ALL on every new public table to `anon`
-- and `authenticated`. Row-level security is what actually stops the writes: on
-- each of these twelve, RLS is ON and there is NO write policy at all, so every
-- INSERT, UPDATE, DELETE and TRUNCATE from a client is already refused. Audited
-- on production 2026-08-17 — every write policy in the schema is owner-scoped
-- (`auth.uid() = owner_id`), and not one is `true`.
--
-- So this changes no behaviour today. What it removes is a second lock that is
-- currently unlocked: the day somebody adds a permissive read policy to
-- `billing_events` — or a broad `FOR ALL` where they meant `FOR SELECT` — the
-- grant is already sitting there and the write lands. Two things would have to
-- go wrong; right now only one does.
--
-- These twelve are written exclusively by the service role, which BYPASSES RLS
-- and is unaffected by anything below. `TRUNCATE` in particular has no
-- legitimate client caller anywhere in this product.
--
-- ⚖️ REVOKE, NOT `GRANT SELECT`. An earlier migration in this repo learned that
-- `grant select` ADDS a privilege rather than replacing the set — writing the
-- narrow grant would have left every write grant in place while reading as if it
-- had removed them.
--
-- ⚠️ AND IT SKIPS A TABLE THAT IS NOT THERE, WHICH IS WHY THIS IS A LOOP RATHER
-- THAN TWELVE STATEMENTS. Staging has five of these twelve; the rest belong to
-- billing, admin and workspace features it has never needed. A flat `revoke`
-- would abort the whole migration on the first absent table, which would force
-- this to be EXCLUDED from the staging matrix — and an excluded migration is one
-- staging can never rehearse. A grant cannot exist on a table that does not
-- exist, so skipping is not a weakened check; it is the same check, correctly
-- scoped to what is present.
do $$
declare
  t text;
begin
  foreach t in array array[
    'admin_audit_log', 'billing_events', 'credit_events', 'dna_claims',
    'edit_review_overlays', 'jobs', 'rate_events', 'referrals',
    'script_attempts', 'subscriptions', 'transcripts', 'workspace_invites'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format(
        'revoke insert, update, delete, truncate on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- SELECT IS DELIBERATELY UNTOUCHED. Several of these are read by the client
-- under an owner-scoped read policy — a creator sees their own credit events and
-- their own jobs — and revoking reads here would break the app to close nothing,
-- because the read policy is doing its job.
