-- 0054 — Close the client-side generations INSERT hole.
--
-- The original 0001 policy `"own generations insert"` let any authenticated
-- user INSERT rows straight into public.generations from the browser. That was
-- the root cause of three separate CRITICAL findings in the production audit:
--
--   1. Billing bypass — every generation row anchors one FREE auto-edit render
--      in enqueue-autoedit (the "first edit of each blueprint is free" rule), so
--      a paid user could mint unlimited free renders by inserting empty rows.
--   2. Fabricated blueprints — clients could stamp arbitrary blueprint/credits
--      values and pollute funnel/metrics counts.
--   3. Cross-tenant private-storage read — review 'get' and social 'publish'
--      service-role-sign generations.edit_path / thumb_path; an attacker-seeded
--      row could point those signed URLs at another tenant's storage path.
--
-- Nothing legitimate writes generations from the client: the only INSERT is in
-- the generate-blueprint edge function via the service-role client (admin.from
-- ('generations').insert, index.ts:525), which BYPASSES RLS entirely. So this
-- drop + revoke has zero impact on the real create flow.

drop policy if exists "own generations insert" on public.generations;

revoke insert on public.generations from authenticated;
revoke insert on public.generations from anon;
