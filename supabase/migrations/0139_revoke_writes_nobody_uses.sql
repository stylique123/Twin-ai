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
-- and is unaffected by anything below. `TRUNCATE` in particular has no legitimate
-- client caller anywhere in this product.
--
-- REVOKE, NOT `GRANT SELECT`. An earlier migration in this repo learned that
-- `grant select` ADDS a privilege rather than replacing the set — writing the
-- narrow grant would have left every write grant in place while reading as if it
-- had removed them.

revoke insert, update, delete, truncate on table public.admin_audit_log from anon, authenticated;
revoke insert, update, delete, truncate on table public.billing_events from anon, authenticated;
revoke insert, update, delete, truncate on table public.credit_events from anon, authenticated;
revoke insert, update, delete, truncate on table public.dna_claims from anon, authenticated;
revoke insert, update, delete, truncate on table public.edit_review_overlays from anon, authenticated;
revoke insert, update, delete, truncate on table public.jobs from anon, authenticated;
revoke insert, update, delete, truncate on table public.rate_events from anon, authenticated;
revoke insert, update, delete, truncate on table public.referrals from anon, authenticated;
revoke insert, update, delete, truncate on table public.script_attempts from anon, authenticated;
revoke insert, update, delete, truncate on table public.subscriptions from anon, authenticated;
revoke insert, update, delete, truncate on table public.transcripts from anon, authenticated;
revoke insert, update, delete, truncate on table public.workspace_invites from anon, authenticated;

-- SELECT IS DELIBERATELY UNTOUCHED. Several of these are read by the client
-- under an owner-scoped read policy — a creator sees their own credit events and
-- their own jobs — and revoking reads here would break the app to close nothing,
-- because the read policy is doing its job.
