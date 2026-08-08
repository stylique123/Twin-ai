-- 0117 — FINISH WHAT 0116 STARTED.
--
-- 0116 revoked two trigger functions and its commit message claimed the class
-- was handled: "0112 is from this session, and 0099 is the same shape." That
-- was the wrong unit of work. 0116 fixed the one the linter named and the one
-- author remembered — which is exactly the failure mode 0116 itself diagnosed:
--
--   "someone remembered twice and forgot twice, which is the definition of a
--    rule that belongs in the schema rather than in a habit."
--
-- Reading the catalog instead of the migrations found ELEVEN more, five of
-- them SECURITY DEFINER. The linter had not reported them because it flags
-- what it samples, not what is true. A rule enforced by remembering is not
-- enforced, and this author demonstrated that on his own rule inside an hour.
--
-- ── WHY IT MATTERS MORE FOR THESE FIVE ────────────────────────────────────
--
-- Supabase exposes every `public` function at `/rest/v1/rpc/<name>`, and a
-- function created without an explicit REVOKE keeps Postgres's default grant
-- to PUBLIC. SECURITY DEFINER means the body would run with the OWNER's
-- rights, not the caller's:
--
--   refund_failed_autoedit        credits ledger    (on public.jobs)
--   notify_admins_on_ops_alert    admin notify      (on public.ops_events)
--   kick_discovery_on_new_niche   enqueues work     (on public.brand_voices)
--   log_signup_event              writes events     (on public.profiles)
--   log_onboarded_event           writes events     (on public.profiles)
--
-- Every one of them fails today if called over REST, because a trigger
-- function reads `tg_op` and dereferences `new`/`old`, none of which exist
-- outside a trigger. That is the same thin protection 0116 refused to lean on,
-- and it is thinner here: `refund_failed_autoedit` moves credits.
--
-- The remaining six are not SECURITY DEFINER, so the exposure is smaller, but
-- there is no argument for an integrity guard being a public endpoint at all.
--
-- ── REVOKING DOES NOT STOP THE TRIGGER ────────────────────────────────────
--
-- The trigger machinery checks EXECUTE when the trigger is CREATED, not on
-- every fire. 0116 verified that claim by exercising both of its triggers
-- after the revoke rather than asserting it. The same is done here, against
-- production inside a rollback, across every ownership domain these touch:
-- credits, capture, creative lineage, profiles and subscriptions.

revoke all on function public.kick_discovery_on_new_niche()    from public, anon, authenticated;
revoke all on function public.log_onboarded_event()            from public, anon, authenticated;
revoke all on function public.log_signup_event()               from public, anon, authenticated;
revoke all on function public.notify_admins_on_ops_alert()     from public, anon, authenticated;
revoke all on function public.refund_failed_autoedit()         from public, anon, authenticated;

revoke all on function public.assert_transfer_plan_lineage()   from public, anon, authenticated;
revoke all on function public.creative_lineage_is_append_only() from public, anon, authenticated;
revoke all on function public.editor_capture_no_mutate()       from public, anon, authenticated;
revoke all on function public.editor_capture_ready_guard()     from public, anon, authenticated;
revoke all on function public.reject_new_autoedit_job()        from public, anon, authenticated;
revoke all on function public.touch_subscription_updated_at()  from public, anon, authenticated;
