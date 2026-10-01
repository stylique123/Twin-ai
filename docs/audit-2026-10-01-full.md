# Twin — full audit, 2026-10-01

Six read-only reviews, run in parallel against `main` at `6a3cd996` (after #1052), plus live production data. Nothing was changed by the audit. Each finding has a location, a severity and a minimal fix. Order of work is at the end.

Severity: **P0** broken for every creator now · **P1** wrong output or real risk · **P2** quality, trust, cost · **P3** polish.

---

## 1. AI editor — not working for anyone

**Live evidence.** `editor_v2` job failed 5 attempts in 28 s: `edit_plan_divergent: accepted capture windows overlap or touch`. The page showed "Queued" ~10 min, then "Something went wrong… your recording is safe".

| # | Sev | Finding | Where | Fix |
|---|---|---|---|---|
| E1 | P0 | **Two validators disagree on "touching" windows.** The capture manifest allows scene N to end on the exact ms scene N+1 starts (normal for continuous recording); the compiler merges touching windows and fails when the count changes. Every teleprompter take with abutting scenes fails, every time. | `packages/shared/src/editor/capture.ts:355-358, 490-495` vs `worker/src/jobs/editorCompile.ts:235, 840-846` | Fail only on true overlap (`start < prevEnd`); one shared `assertDisjointWindows` used by both; test with abutting windows. |
| E2 | P0 | **"Make my AI edit" is disabled for everyone** until a source asset reaches ready, which the code's own comment says has never happened in production. The capture screen promises "Twin edits your take". | `apps/web/src/pages/Result.tsx:1125-1168`, `pages/v2/V2Capture.tsx:977-993` | After E1, verify the source asset path end to end; add a timeout state ("edit not available — download your take"). |
| E3 | P1 | **5 retries of a deterministic error in 28 s** — the permanent-error path (#888) exists in code, so production was likely on an older worker, and the 30 s backoff was not in effect. | `worker/src/index.ts:281-289`, `env.ts:120` | Confirm deployed worker SHA and `WORKER_RETRY_BACKOFF_BASE_SECS`. |
| E4 | P1 | **"Queued" for 10 min** = the reconciler's 600 s threshold; the worker never settled the project on failure (settle errors swallowed). | `supabase/migrations/0102_editor_review_gate.sql:278, 353-369`, `worker/src/jobs/editorV2.ts:897-900` | Settle the project with the real code on dead-letter; reconcile dead-job projects immediately. |
| E5 | P1 | **Failure text is generic and promises things.** `edit_plan_divergent`, `job_dead_lettered`, `lost_job` are unmapped → "we are looking into it" (nobody is alerted); `retries_exhausted` offers "Try again" that will fail the same way. | `packages/shared/src/editor/failureExplain.ts:83, 94, 133, 151` | Map the codes, raise an ops event, only offer retry when it can help. |
| E6 | P2 | Polling stops for good on one transient error; spinner on the raw take never ends. | `packages/shared/src/editor/api.ts:398`, `Result.tsx:350-363, ~1115` | Throw and back off; failed state with Retry/Download. |
| E7 | P1 | **App and marketing disagree**: Landing/Auth say AI editing is "coming soon"; the app offers it. | `pages/Landing.tsx` (10 places), `pages/Auth.tsx:15` | One truth, behind one flag. |

## 2. Job queue — why everything says "queued"

| # | Sev | Finding | Where | Fix |
|---|---|---|---|---|
| Q1 | P0 | **No priority for creator jobs.** All jobs are priority 0, FIFO, one job per worker container. 119 background `assess_reference` jobs in 24 h sat ahead of her: `build_voice` waited 17 min, `sample_own_account` 18 min. | `0066_priority_queue_health_retention.sql:7-37`; enqueue sites `dna-poll/index.ts:321`, `0199:89`, `0176:73`, `transcribe.ts:167`, `ingest-reference/index.ts:146` | BEFORE INSERT trigger mapping type → priority (creator 100, background −10); reserve a worker slot for creator jobs. |
| Q2 | P1 | **`assess_reference` enqueued twice with no dedup** (ingest + cache hit); the "skip already assessed" guard only works after a profile exists. | `worker/src/jobs/transcribe.ts:164-178`, `ingest-reference/index.ts:145-155` | Partial unique index on `(type, dedup_key)` for queued/running; `max_attempts` 2. |
| Q3 | P1 | **Backoff grows twice** (worker ×2ⁿ, `fail_job` ×attempts) and the cap is never applied. | `index.ts:286-289`, `0081_editor_fencing_hardening.sql:115` | Remove the second multiplier. |
| Q4 | P2 | A crashed worker blocks its job 40 min; one global 35 min timeout; no per-type timeout. | `env.ts:111, 117` | 5 min lease + generic heartbeat; per-type timeouts. |
| Q5 | P2 | No queue position anywhere in the UI. | — | `job_queue_position` RPC → "queued, N ahead". |
| Q6 | P2 | Silent failures: enqueue errors only warned; dead-letter alert insert swallowed; job with no handler retried for hours. | `ingest-reference:158`, `index.ts:218, 296`, `db.ts:105` | Log as incidents; dead-letter unknown types at once. |

## 3. Scripting and fabrication

The final guards (private/excluded, unpicked product, follow ask, invented method) now run in every mode. The gaps are what runs **after** them and the fields they never read.

| # | Sev | Finding | Where | Fix |
|---|---|---|---|---|
| S1 | P1 | **The test-viewer rewrite changes the script after every guard**, checked only by `rewriteIsSafe`: follow asks, unpicked products, invented methods and facts she switched off can come back; it also sets the selected hook. | `worker/src/nicheBrain/audience.ts:110-204` | One shared `isLineAllowed` (privacy + rules + method) used everywhere; load the same excluded facts as the writer. |
| S2 | P1 | **Captions, titles, thumbnail text, visual hook, concept fields are never guarded** — a "Follow for Part 2" title or an unpicked brand in the thumbnail ships. | `generate-blueprint/index.ts` ~10896, publish_plan / caption_packet / packaging | Run every published string through `isLineAllowed`. |
| S3 | P1 | **If every hook option fails, all are kept.** | `index.ts:14012` | Always assign the safe list; empty = "no safe hook". |
| S4 | P2 | "Check before you record" figures computed before the final guards; never refreshed. | `index.ts:13210` | Recompute after the guards and after the worker rewrite. |
| S5 | P2 | Shot list: only spoken text is re-synced; on-screen text can still carry a removed figure/product. | `index.ts:13970, 14023, 14074` | Guard all shot text; drop shots of dropped beats. |
| S6 | P2 | Repair suggestions ("use this") bypass the rules check. | `index.ts:13760` | `isLineAllowed`. |
| S7 | P2 | Three different "allowed material" sets across guards. | `index.ts:12905, 13952`; worker | Build once, pass to all. |
| S8 | P2 | Beat plan / retention map / timing not re-derived after a guard drops a beat. | `index.ts` ~13185-13265 | Re-run syncs at the end. |

## 4. Brain and extraction

| # | Sev | Finding | Where | Fix |
|---|---|---|---|---|
| B1 | P1 | **Private facts rely on a keyword list only.** Debt, IVF, "my ex", a child's school, salary, "lost my job" pass and reach the writer. | `0252_private_facts_behind_a_view.sql:13-19`, `worker/src/voice.ts` ~300 | Add a `private` flag to extraction; sensitive = keyword OR model; widen the list. |
| B2 | P1 | **Press mentions and "change of mind" summaries stored as things she said** (`basis: stated`). | `nicheBrain/mentions.ts:52-54`, `shifts.ts:57-59` | `demonstrated` / `inferred`. |
| B3 | P1 | Test-viewer panel ignores facts she switched off. | `audience.ts:111-113` | Include `creator_excluded_at`. |
| B4 | P2 | Lesson learner turns rating tags into "her" rules that are system rules; one tag = a standing lesson; failures block the queue; lessons stamped as learned even when saving failed; hook lessons never dedupe. | `worker/src/generated/creatorLessons.ts:37-42`, `nicheBrain/lessons.ts:33-83` | Tag → signal, not lesson; weight ≥2 to surface; attempt counter; stamp only on success. |
| B5 | P2 | Re-reading a video inflates `times_seen`, so one video looks like a pattern. | `nicheBrain/sweep.ts:64-73` | Skip counts when the source is already recorded. |
| B6 | P2 | URLs, hashtags, @handles kept in knowledge text; `times_seen` can exceed the number of source posts. | `worker/src/knowledgeRows.ts:85, 92` | Strip; clamp to sources. |
| B7 | P3 | Daily moments searched for buckets nobody is in; change-of-mind compares only her 60 oldest opinions. | `nicheBrain/moments.ts:21-38`, `shifts.ts:30-32` | Active buckets only; newest first. |

## 5. Security

The codebase is well hardened: RLS on every table, definer functions pinned, webhooks verified, no secrets committed, no public buckets, rate limits on paid endpoints.

| # | Sev | Finding | Where | Fix |
|---|---|---|---|---|
| X1 | **High** | **SSRF in the product-page reader.** Only an `https://` prefix check; redirects followed; no private-IP block. A product URL that redirects to `169.254.169.254` or a 10.x host is fetched by the worker and the response is stored where the user can read it. | `worker/src/jobs/extractProduct.ts:110-140, 357, 440`; `enqueue-extraction/index.ts:64` | Resolve DNS, reject private/loopback/link-local, `redirect: 'manual'` and re-check each hop. |
| X2 | P2 | Scraped product page text enters the model with no untrusted-content fence. | `extractProduct.ts:438-443` | Fence + "data, not instructions". |
| X3 | P3 | CORS `*` on DNA endpoints (bearer auth, so low). | `_shared/dna.ts:9` | Restrict to app origin. |
| X4 | P3 | Comment claims signup `intended_plan` "can't be spoofed" (it can; harmless today). Reset relies on Supabase "secure password change". | `Auth.tsx:97-117` | Fix comment; confirm the Supabase setting. |
| X5 | Ops | **Heartbeat monitor down**: test account login invalid. | GitHub secrets | Owner updates `HEARTBEAT_USER_PASSWORD`. |

## 6. Web app flows

| # | Sev | Finding | Where | Fix |
|---|---|---|---|---|
| W1 | P1 | Billing loop: `/billing` → Settings → "coming soon" → no way to pay. | `pages/Billing.tsx:43, 90`, `Settings.tsx:954, 995, 1324` | Hide upgrade asks until checkout is live, or wire cards to checkout. |
| W2 | P1 | **Phone users can't reach Products, My Twin or Settings** (mobile tab bar has 5 items only). | `components/AppShell.tsx:37-41` | Add a "More" tab. |
| W3 | P2 | Calendar says "Queued with {platform}" while posting is "coming soon". | `pages/Calendar.tsx:232, 245, 346` | "Scheduled (you post it)". |
| W4 | P2 | Internal pages render inside the creator shell; `/metrics` unlinked and forces sideways scroll on phones. | `App.tsx:318-350`, `Metrics.tsx:246` | Separate admin layout; overflow wrapper. |
| W5 | P3 | "Coming soon" repeated ~10× on Landing. | `Landing.tsx` | Once. |

---

## Order of work

1. **Editor works again** — E1 (touch rule), E3 (confirm worker/backoff), E4/E5 (honest status and text), E2 (source asset + timeout).
2. **Creators never wait behind background work** — Q1 priorities, Q2 dedup, Q3 backoff.
3. **Security** — X1 SSRF, X2 fence.
4. **Nothing made-up after the guards** — S1, S2, S3, then S4–S8.
5. **Brain quality** — B1, B2, B3, then B4–B7.
6. **App flows** — W2, W1, W3, W4.

Owner inputs: heartbeat password (X5); decide whether AI editing is advertised as live or "coming soon" (E7).
