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
| 4 | Secrets | Service-role key, `GEMINI_API_KEY`, `APIFY_TOKEN` live only in edge-function env; client ships **only** the anon key. Provider errors are sliced + logged server-side, never returned raw. | ⚠️ **Verified for the code path only.** This row says where the code reads secrets from. It is not, and was never, a claim that no secret has ever left that path by another route — see `EXPOSED_SERVICE_ROLE_KEY_ROTATION_REQUIRED` and `UNVERIFIED_GEMINI_API_KEY_EXPOSURE_CLAIM` in Open security debt. |
| 5 | AuthN | All edge functions set `verify_jwt = true` **and** re-check `auth.getUser()` (defense in depth). | ✅ Verified. |
| 6 | **Admin** | **No platform-admin / super-admin existed.** | ✅ **Fixed** — `platform_admins` (roles: support/admin/superadmin), **not self-grantable** (seeded out-of-band; only superadmins manage the roster), additive cross-tenant **read** policies for support, and **every** privileged action written to `admin_audit_log`. Admin writes go through audited RPCs (`admin_grant_credits`, `admin_log`), never RLS. |
| 7 | **Cost/DoS** | **No rate limits** on paid endpoints — a script could burn Apify/Gemini budget. | ✅ **Fixed** — DB-enforced sliding-window `check_rate_limit` (service-role only). `generate-blueprint` 12/min; `start-dna` 8/hr (each scan = a paid Apify run). |
| 8 | Abuse | Unbounded user input flowed into model prompts. | ✅ **Fixed** — `reference_url` ≤ 2048, `reference_note` ≤ 2000, handle ≤ 60 + normalized. |
| 9 | CORS | `Access-Control-Allow-Origin: *` on 21 of 48 edge-function sources (measured 2026-08-26). | 🟢 **Accepted, and now enforced.** The acceptance rests on one premise: every endpoint authenticates from an explicit `Authorization: Bearer` header that a cross-origin page cannot read, never from a credential the browser attaches by itself. Measured 2026-08-26: **0** functions set `Access-Control-Allow-Credentials`, **0** read a cookie, **0** set one. While that holds, `*` grants an attacker page nothing it could not already do with `curl` — the bearer token is the boundary, not CORS. `scripts/ci/check_cors_assumption.mjs` now fails the build if any wildcarded function starts depending on ambient credentials, so the premise cannot rot silently. **An origin allow-list is deliberately NOT the fix** and adding one is not what closing this looks like: it would stop nothing (an attacker holding a token calls from a server, where CORS does not exist) while introducing a real availability failure — a preview deployment, a native shell or a localhost origin nobody remembered, silently broken. Re-open this row if the guard ever fires, or if an endpoint is ever added that authenticates from something other than a bearer header. |
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

## Open security debt

⚠️ **This section is machine-read.** `scripts/ci/check_security_debt.mjs` parses the
table below and fails the build if an unresolved entry is missing its trigger, its
completion criterion, or its status — and if an entry is marked `RESOLVED` without a
dated line saying what was actually done. Deleting an entry to make the guard quiet
is itself a failure: the guard requires every `BLOCKING_SECURITY_CLEANUP` id it has
ever been told about to still be present.

| id | reason | trigger | completion criterion | status |
|---|---|---|---|---|
| `EXPOSED_SERVICE_ROLE_KEY_ROTATION_REQUIRED` | A live production service-role JWT for project `jmdecibuytznsonrasxw` was pasted into a conversation transcript on 2026-08-21. It was used for exactly one read-only schema verification and was written to no file, committed to no repo, and placed in no environment. | The first real #58 visual pilot reaching `LOCKED`. | **The key is rotated in the Supabase dashboard and the old one no longer authenticates.** Not "we stopped using it" — the transcript is permanent, so ceasing to use the pasted key is not a completion criterion. Anything that still holds the old key (edge function env, worker VPS env, CI secrets) must be updated in the same pass, and the guard's entry updated with the date and the list of places rotated. | `BLOCKING_SECURITY_CLEANUP` |
| `UNVERIFIED_GEMINI_API_KEY_EXPOSURE_CLAIM` | A system audit dated 2026-08-26 asserted that a `GEMINI_API_KEY` had been pasted in plaintext into a session transcript and needed rotation. The claim could be neither confirmed nor refuted from here, and what was actually measured on 2026-08-26 is this: zero `AIza`-shaped strings in the worktree, zero across every ref in git history (`git log --all -S'AIza'`), and zero in the only conversation transcript present on this machine — where every `GEMINI_API_KEY` occurrence is a variable name, a `MISSING`/`NOT set` diagnostic, or the literal `'stub-gemini-key'`. One transcript is not every session, and a Vertex service-account credential would not match `AIza` at all, so absence here is not absence. | The next time the owner is in the Google AI Studio / Cloud console for any reason — this needs no dedicated trip, only that the question is answered rather than carried. | **The owner checks the key's creation date and last-use in the console and records one of two outcomes here, with the date.** Either (a) the key was rotated — name when, and list every place updated (edge function env, worker VPS env, CI secrets) — and the row becomes `RESOLVED`; or (b) the audit's claim is established as an error, in which case the row becomes `RESOLVED` with the dated finding that no exposure occurred. A third outcome is not available: leaving it unanswered is what this row exists to prevent. Nothing CI can run closes this, because proving a credential no longer authenticates would mean holding it. | `BLOCKING_SECURITY_CLEANUP` |

### Why this is recorded here rather than in a ticket

A credential in a transcript has no expiry and no owner. The one durable place a
future reader will look before shipping is the security spec, and the one mechanism
that survives a context window is a CI guard that refuses to go quiet.

**A note on a claim that was made and was wrong.** It was stated in this project's
notes that the owner had removed the service role key. The owner corrected that:
**the key was not removed.** What is verifiable is narrower and is the only thing that
should be repeated — `SUPABASE_SERVICE_ROLE_KEY` is unset in the assistant's session
environment, and there is no `.env` in the repository. Neither of those facts is
rotation, and neither retires this entry.
