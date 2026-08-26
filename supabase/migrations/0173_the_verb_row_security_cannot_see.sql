-- THE ONE WRITE VERB ROW SECURITY NEVER CONSULTS.
--
-- ── HOW THIS WAS FOUND ────────────────────────────────────────────────────
--
-- 0172 revoked `insert, update, delete` on its new ledger and looked complete.
-- The staging matrix refused it:
--
--   client roles hold TRUNCATE on: scan_events. Row security does not gate
--   TRUNCATE, so the grant is the whole permission.
--
-- Enumerating verbs is how a table ends up holding the fourth one. Checking
-- production for the same shape afterwards turned up a second instance that had
-- been live the whole time, and it breaks BOTH of `check_client_write_grants`'
-- rules rather than one (measured 2026-08-26):
--
--   publish_intents  anon + authenticated hold  TRUNCATE  -- rule 2, no exceptions
--   publish_intents  anon + authenticated hold  DELETE    -- rule 1, no DELETE policy exists
--
-- ⚠️ THE MATRIX DID NOT CATCH IT BECAUSE THE MATRIX NEVER HAD THE TABLE. The
-- staging apply loop does not carry `publish_intents`' migration, and a guard
-- run against a schema that lacks the table reports zero for it forever. That is
-- the same gap `check_staging_migration_coverage` exists to close, seen from the
-- other side: absent is not zero.
--
-- ⚖️ ANON LOSES EVERYTHING; AUTHENTICATED KEEPS WHAT A POLICY BACKS. The three
-- policies (`publish_intents_insert_own`, `_select_own`, `_update_own`) all gate
-- on the owner, so an anonymous caller could never satisfy one -- its grants buy
-- it nothing today and are pure standing risk. `authenticated` keeps exactly
-- insert/select/update, the three commands a policy actually decides.
--
-- ⚠️ DELETE IS NOT GRANTED BACK, AND THAT IS THE POINT. There is no DELETE
-- policy, so the grant was a permission nobody decided to give. If a creator
-- should be able to withdraw a publish intent, that is a policy somebody writes
-- deliberately -- not a default grant nobody noticed.
--
-- Re-runnable: `revoke` and `grant` are idempotent, and the table is guarded by
-- `to_regclass` so a database that has never had it is skipped rather than
-- aborting.
do $$
begin
  if to_regclass('public.publish_intents') is null then
    raise notice 'publish_intents absent -- nothing to revoke';
    return;
  end if;

  revoke all on table public.publish_intents from anon, authenticated;
  grant select, insert, update on table public.publish_intents to authenticated;
end $$;
