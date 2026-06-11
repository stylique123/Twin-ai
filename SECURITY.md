# TwinAI — Security model & panel review

This is the living security spec. It records the security **panel** (expert review),
the current **model**, and the **per-phase security gate** every future phase must
pass before it ships.

## The security panel (review #1)

Three reviewer personas, each pushing a different threat lens:

- **CTO-A — Multi-tenant SaaS isolation.** "Can user A ever see, edit, or affect
  user B's data, products, credits, or jobs? Prove isolation, don't assert it."
- **CTO-B — Abuse / cost / DoS.** "Where can a script burn our money (Apify,
  Gemini, render), enumerate accounts, or take the service down? Every paid call
  needs a throttle and a quota."
- **CTO-C — Secrets, AuthZ & admin.** "Where can a secret leak? Who is allowed to
  do privileged things, how is that granted, and is every privileged action
  logged and reversible?"

### Findings & disposition

| # | Lens | Finding | Status |
|---|---|---|---|
| 1 | Isolation | Every business table (profiles/generations/brand_voices/jobs/credit_events) has RLS with **own-row** policies; `auth.uid()` gates read/write. | ✅ Verified strong. |
| 2 | Isolation | Sensitive columns (credits/plan/email/id/status/handle/owner) are **revoked** from clients; users can only update non-sensitive fields via explicit column grants. | ✅ Verified. |
| 3 | AuthZ | Credit mutations are **service-role-only** SECURITY DEFINER RPCs (`spend_credits`/`refund_credits`) with `search_path` pinned; never callable from the browser. | ✅ Verified. |
| 4 | Secrets | Service-role key, `GEMINI_API_KEY`, `APIFY_TOKEN` live only in edge-function env; client ships **only** the anon key. Provider errors are sliced + logged server-side, never returned raw. | ✅ Verified. |
| 5 | AuthN | All edge functions set `verify_jwt = true` **and** re-check `auth.getUser()` (defense in depth). | ✅ Verified. |
| 6 | **Admin** | **No platform-admin / super-admin existed.** | ✅ **Fixed** — `platform_admins` (roles: support/admin/superadmin), **not self-grantable** (seeded out-of-band; only superadmins manage the roster), additive cross-tenant **read** policies for support, and **every** privileged action written to `admin_audit_log`. Admin writes go through audited RPCs (`admin_grant_credits`, `admin_log`), never RLS. |
| 7 | **Cost/DoS** | **No rate limits** on paid endpoints — a script could burn Apify/Gemini budget. | ✅ **Fixed** — DB-enforced sliding-window `check_rate_limit` (service-role only). `generate-blueprint` 12/min; `start-dna` 8/hr (each scan = a paid Apify run). |
| 8 | Abuse | Unbounded user input flowed into model prompts. | ✅ **Fixed** — `reference_url` ≤ 2048, `reference_note` ≤ 2000, handle ≤ 60 + normalized. |
| 9 | CORS | `Access-Control-Allow-Origin: *`. | 🟢 **Accepted** — every endpoint requires a Bearer JWT (not an ambient cookie), so classic CSRF doesn't apply. Tightening to an allow-list is optional hardening, tracked. |
| 10 | Cost | A user can scan **any** handle (by design — references aren't only your own), so scraping cost isn't tied to ownership. | ⚠️ Throttled by #7; **plan-based quota** on total brand voices tracked for the payments phase. |
| 11 | Reliability | Frontend-driven `dna-poll` means a job can stall if the tab closes. | 📌 **→ worker / job-queue hardening** (server-side cron advance). Security-adjacent (stuck jobs ≠ data exposure). |
| 12 | Privacy | We scrape third-party public profiles and **discard** raw media after analysis. | 📌 Formalize retention + DPA + "analyze-and-discard" guarantee in the publish/legal phase. |

## Current model (one-paragraph version)

Supabase Postgres with **RLS on every table**; tenants are isolated by `auth.uid()`.
Clients hold only the anon key and act under their own JWT. Anything privileged or
costly happens in **edge functions** (service role, secrets server-side) or in
**SECURITY DEFINER RPCs** with `search_path` pinned. Money-moving and cross-tenant
actions are **service-role-only and audited**. Paid endpoints are **rate-limited**
in the database. Super-admin is a **separate, non-self-grantable role** whose every
action is logged to an append-only audit trail.

## Per-phase security gate (every future phase must pass)

Before a phase is marked done, it must clear this checklist (recorded in the PR):

1. **Isolation** — new tables have RLS + own-row policies; no cross-tenant path
   except an explicit, audited admin policy.
2. **Least privilege** — sensitive columns revoked from clients; mutations that
   touch money/quotas/roles are service-role-only RPCs.
3. **Secrets** — no new secret reaches the client bundle; provider errors are not
   echoed to users.
4. **Abuse/cost** — every new paid/external call (scrape, model, render, publish)
   is behind `check_rate_limit` and, where relevant, a plan quota.
5. **Input bounds** — all user-controlled inputs that reach a model/URL/shell are
   length- and type-bounded; SSRF/command-injection considered for the worker.
6. **Audit** — any new privileged action calls `admin_log` (or its own audit row).
7. **Verify with the panel** — re-run the three lenses on the diff (the
   `/security-review` skill) and attach the result.

## Bootstrapping the first admin

```sql
-- run via the Supabase SQL console / service role, never from the app:
insert into public.platform_admins (user_id, role) values ('<your-auth-uid>', 'superadmin');
```
