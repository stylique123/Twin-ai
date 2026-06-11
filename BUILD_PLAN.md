# TwinAI — Complete Build Plan (macro + micro)

The objective: a creator inputs a viral reference (link or gallery) → TwinAI understands their brand DNA from their own handle → generates hooks + script + edit steps in their voice → they record in-app (teleprompter) or upload clips → auto-edit + captions → save to their gallery → publish to their socials → analytics. **One flow, charged once, posting included. Credits are invisible and the credit↔video rate is server-adjustable and never exposed.**

---

## 0. System architecture — the pieces and how they connect

```
            ┌──────────────────────────── BROWSER (Vite + React SPA) ───────────────────────────┐
            │  Landing · Auth · Onboarding(DNA) · Studio · Recorder · Editor · Gallery · Publish │
            └───────────────┬───────────────────────────────────────────────┬──────────────────┘
                            │ supabase-js (auth + RLS reads/writes)          │ invoke()
                            ▼                                                ▼
          ┌──────────────────────────── SUPABASE ────────────────────────────┐
          │  Auth │ Postgres + RLS │ Storage (videos/renders) │ Edge Functions │
          │                                   │  (light orchestration only)    │
          └─────────────┬─────────────────────┴───────────────┬───────────────┘
                        │ enqueue job (DB row in `jobs`)        │ direct LLM calls (fast)
                        ▼                                       ▼
          ┌──────────── WORKER SERVICE (Node, Fly/Railway/Render) ────────────┐   ┌─────────────┐
          │  Polls `jobs` queue. Runs heavy/long tasks that edge fns can't:    │   │  Gemini 3.1 │
          │  • yt-dlp ingest   • faster-whisper transcribe                     │──▶│  Apify      │
          │  • Revideo render (ffmpeg)   • Ayrshare publish   • DNA build      │   │  Ayrshare   │
          └───────────────────────────────────────────────────────────────────┘   └─────────────┘
```

**Why two backends?** Supabase Edge Functions (Deno, ~short timeout, no ffmpeg/yt-dlp binaries) are perfect for *fast* LLM orchestration (script generation — already built). But ingestion, transcription, and video render are **long, binary-heavy CPU jobs** — those run in a separate **worker service** driven by a `jobs` queue table. This split is the single most important architectural decision; everything below respects it.

**Build vs fork vs buy (final):**
| Capability | Decision | Tool |
|---|---|---|
| Ingestion | fork | yt-dlp (worker) |
| Transcription | own | faster-whisper (batch, worker) + whisper.cpp WASM (live, browser) |
| Brand-DNA | build (moat) | Apify scrape + whisper + Gemini 3.1 Pro |
| Script/hooks | build (moat) | Gemini 3.1 Pro (edge function — done) |
| Record + teleprompter | fork | addyosmani/recorder + voice-scroll |
| Auto-edit/render | fork | Revideo (MIT) + auto-editor |
| Publish + analytics | buy → fork | Ayrshare → Postiz later |
| Payments | buy | Stripe |

---

## 1. Data model (full schema, built incrementally per phase)

| Table | Key columns | Phase | Notes |
|---|---|---|---|
| `profiles` | id, email, plan, credits, onboarded, account_type(creator/agency) | ✅1 | credits = hidden internal unit |
| `brand_voices` | id, owner_id, handle, platform, profile(jsonb), is_default, created_at | 2 | one per brand; agency = many |
| `references` | id, owner_id, url, platform, transcript, structure(jsonb), status | 3 | analyze-and-discard the source file |
| `gallery_items` | id, niche, platform, title, metrics(jsonb), why_it_worked, structure(jsonb), source | 4 | curated viral feed + "why it worked" (no copyrighted media stored) |
| `transcripts` | id, owner_id, source_url, language, text, words(jsonb), segments(jsonb) | ✅3 | worker output; raw media discarded |
| `generations` | id, user_id, brand_voice_id, reference_id, blueprint(jsonb), fidelity | ✅1 | the script/hooks/shot list output |
| `recordings` | id, generation_id, storage_path, duration, source(record/upload) | 5 | raw take in Storage |
| `renders` | id, generation_id, recording_id, storage_path, status, options(jsonb) | 6 | finished captioned video |
| `posts` | id, render_id, generation_id, brand_voice_id, platform, external_id, is_twin, scheduled_at, status, metrics(jsonb) | 7 | publish + analytics; `is_twin` powers before/after-Twin lift |
| `credit_events` | id, user_id, delta, reason, created_at | ✅1 | audit ledger |
| `platform_admins` · `admin_audit_log` · `rate_events` | super-admin roster · audit trail · rate limiter | ✅sec | see `SECURITY.md` |
| `subscriptions` | id, user_id, plan, stripe_customer, status, period_end | 8 | Stripe-driven; resets credits |
| `jobs` | id, owner_id, type, payload(jsonb), status, attempts, run_after, locked_*, result(jsonb) | ✅3 | hardened worker queue (claim/retry/reclaim) |

All tables: **RLS on, owner-scoped.** `gallery_items` is the only public-read table.

---

## 2. The job queue (the spine of all heavy work)

A single `jobs` table + a worker loop. Job `type` ∈ `ingest | transcribe | build_dna | render | publish | refresh_gallery`.

Flow: edge function (or frontend) inserts a `jobs` row → worker polls `where status='queued'` → runs it → writes `result` + flips `status` → frontend subscribes via Supabase Realtime to show progress. Retries with backoff; `attempts` cap; dead-letter on repeated failure. **Every job that spends credits refunds on terminal failure** (the never-shorted rule, system-wide).

---

## 3. Phases — macro goal, micro tasks, components, connections, acceptance

### ✅ Phase 0/1 — Spine (BUILT)
Auth, profiles, credit ledger (atomic `spend_credits` + auto-refund), Gemini 3.1 Pro script/hooks generation, Studio/Result/History, brand-aligned UI, invisible credits + hidden rate.
**Remaining to go LIVE:** provision Supabase project → `db push` → deploy `generate-blueprint` → set `GEMINI_API_KEY` secret → deploy frontend to Vercel with `VITE_SUPABASE_*`. **Acceptance:** a real user signs up, gets a real AI blueprint, sees "recreations left."

### ✅ Phase 2 — Brand-DNA from handle (the moat) — BUILT (text DNA)
**Macro:** replace the quiz with "@handle → we read your last N posts → a voice profile you confirm in one tap."
**Status:** built on Supabase Edge Functions alone (no separate worker host yet): `brand_voices` + `jobs` tables (migration `0002`), `start-dna` (kicks the Apify scrape async) + `dna-poll` (advances the job: Apify status → Gemini voice synthesis → ready), handle-first onboarding with live progress + editable confirm card (manual quiz kept as fallback), and `generate-blueprint` now writes in the confirmed voice. **Remaining:** set `APIFY_TOKEN` secret + deploy the two functions; video transcription (faster-whisper) is the worker enhancement that lands with Phase 3.
Micro tasks:
1. DB: `brand_voices` table + RLS; `profiles.account_type`.
2. Edge fn `start-dna`: validate handle, enqueue `build_dna` job, return job id.
3. Worker `build_dna`: Apify profile scrape (last 15–25 posts + captions) → faster-whisper transcribe the videos → Gemini 3.1 Pro prompt → emit `profile` JSON {tone, pacing, vocabulary, hook_style, niche, recurring_ctas, do/dont}.
4. Frontend: handle input screen → live progress (Realtime) → **DNA confirm card** (editable chips) → save as default brand voice.
5. Wire generation to pull `brand_voices.profile` instead of the quiz `dna`.
6. Agency: allow N brand voices; switcher in the workspace.
**Connects to:** generation (Phase 1) reads the voice profile. **Keys:** Apify. **Acceptance:** paste a handle, get an accurate voice profile in <60s, generate a script that sounds like them.

### Phase 3 — Real reference ingestion  *(worker SCAFFOLDED — see `/worker`)*
**Macro:** "analyze any video" becomes literal — real transcript + structure, not inference.
**Worker shipped (panel-gated):** the keystone `/worker` service is built — atomic job
claiming (`claim_job` / `0004_job_claim.sql`), retries+backoff+dead-letter, stale-reclaim,
and an `ingest`/`transcribe` handler (yt-dlp audio-only → faster-whisper word timestamps →
`public.transcripts`, raw media discarded). SSRF allow-list + bounded inputs + service-key
server-side (security gate cleared). Dockerfile + fly.toml + README included.
Micro:
1. ✅ DB: `jobs` (hardened) + `transcripts` (+ `structure`) + `generations.transcript_id`.
2. ✅ Worker `ingest`/`transcribe` (faster-whisper, word timestamps + discard).
3. ✅ Worker derives real `structure` (format, hook window, timestamped beats, CTA, WPM, why-it-works) via Gemini from the actual transcript (`structure.ts`).
4. ✅ `ingest-reference` edge fn (JWT, rate-limited, SSRF allow-list) → enqueues; `generate-blueprint` takes optional `transcript_id` → builds from the REAL transcript + structure (drops the format-pattern caveat when real data is present).
5. ✅ Studio "Read the actual video" toggle → ingest → progress → generate from transcript. **Additive** (default off) so the instant path keeps working pre-worker-deploy.
6. ✅ Legal guardrail: never persist source media; store transcript/metadata only.
7. **Next (P2.5):** **voice-from-audio** — move the DNA build onto the worker and synthesize the brand voice from the creator's own *spoken* transcripts (not just captions). Also a server-side cron to advance jobs (removes frontend-poll stall).
**Panel-verified** (LLM/prompt · backend/data · ASR) + security-gated. **Acceptance:** with a worker running, paste a TikTok with "Read the actual video" → real retention map from its true transcript.

### Phase 4 — Gallery (with analytics — "why it worked")
**Macro:** curated, niche-filtered, daily-refreshed viral feed → recreate without a link, **with the numbers and the reason it performed.**
Micro:
1. DB: `gallery_items` (structure + **metrics(jsonb)** + `why_it_worked` + no copyrighted media).
2. Worker `refresh_gallery` (cron): Apify trending by niche → extract **metrics (views, likes, comments, shares, engagement-rate, est. retention)** + structure → Gemini explains **why it worked** (hook/pattern/timing) → upsert.
3. Frontend: gallery grid filter by niche/platform, **sort by performance (views / engagement-rate / "rising")**; each card shows the metrics + a short "why this worked"; "Recreate this" reuses the Phase 3 pipeline with the pre-analyzed item.
4. Gallery is the default landing for logged-in users (fastest time-to-first-value) and the cold-start answer (premortem #9).
**Acceptance:** a cold user with no link sees *what's working in their niche and why*, and hits "Recreate" in <30s.

### Phase 5 — Record in-app (the differentiator)
**Macro:** camera + teleprompter + voice-paced scroll + live captions, fully in browser.
Micro:
1. Fork addyosmani/recorder: MediaRecorder capture (cam/mic), teleprompter overlay scrolling the generated script.
2. Live captions: whisper.cpp compiled to WASM → caption stream paces the teleprompter (voice-activated scroll).
3. Upload-clips alternative (drag-drop) → same downstream.
4. Save take → Supabase Storage → `recordings` row.
**Connects to:** consumes the Phase 1 script; outputs to Phase 6. **Acceptance:** open camera, script scrolls as you talk, recording lands in Storage.

### Phase 6 — Auto-edit / render
**Macro:** raw take → polished captioned vertical short.
Micro:
1. Worker `render`: auto-editor strips silence/jump-cuts → WhisperX word timestamps → **Revideo** burns animated captions + hook overlay + (optional) B-roll → output MP4 to Storage.
2. `renders` table + Realtime progress; render options (caption style, aspect) from brand voice.
3. Editor screen: preview, tweak caption style, re-render, save to **user's gallery**.
**Acceptance:** a recorded take comes back as a captioned 9:16 MP4 in ~1–2 min.

### Phase 7 — Publish + analytics dashboard (results + before/after Twin)
**Macro:** one-tap publish to their socials (creator vs agency brand), and a real **analytics dashboard** that shows every post's results and **proves TwinAI's lift (before vs after Twin).**
Micro:
1. Connect-accounts flow via **Ayrshare** (absorbs TikTok audit + IG business reqs).
2. Worker `publish`: post render via Ayrshare (user-initiated, original content — ToS-safe positioning baked in).
3. `posts` table (`render_id`, `generation_id`, `brand_voice_id`, `external_id`, `is_twin` flag, `metrics(jsonb)`); scheduling calendar; per-brand account mapping (agency).
4. Worker `sync_metrics` (cron): pull per-post metrics back (views/likes/comments/shares/saves/watch-through) over time into `posts.metrics`.
5. **Dashboard** (`/dashboard`): all their postings + results; per-post and aggregate trends; **Before-vs-After-Twin comparison** — baseline = their pre-Twin median (seeded from the DNA scan's historical posts) vs Twin-made posts (`is_twin=true`); headline stat *"Twin posts average N× your baseline views / +X% engagement."* Filters by brand voice (agencies → per client).
6. Tie it back: each post links to the gallery reference + blueprint it came from, so "why it worked" carries through from inspiration → result.
**Keys:** Ayrshare. **Acceptance:** publish to a connected account; within a day the dashboard shows the post's metrics and updates the before/after-Twin lift.

> **Note (premortem #13 — ROI proof):** pull a *lightweight* version of the before/after stat forward as soon as posting exists — businesses/agencies buy outcomes, so the lift number is the retention and upsell hook, not an end-of-roadmap nicety.

### Phase 8 — Payments
**Macro:** Stripe checkout for the intro tiers + monthly credit grant (with hidden buffer) + extra-brand-voice add-on.
Micro:
1. Stripe products/prices for Aspiring/Pro/Agency (monthly+annual) + $9 extra-voice add-on.
2. Checkout + customer portal; webhook → `subscriptions` → grant credits (videos+buffer)×rate on each period; downgrade/cancel handling.
3. Soft paywall when recreations hit 0 ("upgrade to keep going").
**Acceptance:** pay → credits granted → create beyond free cap; cancel → access ends at period end.

---

## 4. External services & keys needed (in order)
1. **Gemini API key** — Phase 1 (generation). *(have it; set as secret)*
2. **Apify token** — Phase 2 & 4 (handle scrape, trending).
3. **Worker host** (Fly.io/Railway/Render) — Phase 3+ (yt-dlp, whisper, render).
4. **Ayrshare key** — Phase 7 (publish + analytics).
5. **Stripe keys** — Phase 8 (payments).

## 5. Dependency order (critical path)
`Go live (P1)` → `DNA (P2)` → **`Worker + transcription (keystone)`** → `Ingestion/real analysis (P3)` + `Voice-from-audio (P2.5)` → `Gallery (P4)` ⟶ `Record (P5)` → `One-click edit (P6)` → **`Re-panel gate`** → `Publish (P7)` → `Payments (P8)` → `Agency workspace (P9)`.
The **worker service is the keystone** (premortem §7): transcription fixes the fake-analysis *and* shallow-voice problems at once; render fixes time-saved. Build it next, transcription first. P5 (record) can run in parallel with P3/P4 since it only needs the P1 script. **Start platform API audits (TikTok/IG via Ayrshare) during P5 — they take weeks.** **Re-panel gate (§8):** after the editor ships, re-run the discovery panel before claiming PMF.

## 6. Pricing/economics (updated — quality-first)
**Decision (quality-first, per founder):** optimize for best output quality, which raises true per-video cost (real transcription + render + optional VLM). To protect margin we nudge prices up a couple dollars AND trim included counts — but never so far that it stops feeling like value-for-money or blocks a real try.

Current tiers (price / advertised recreations · ~price-per-video):
- **Free** — $0 · **2** (buffer→3). Trial must reach the "aha"; do not shrink below 2.
- **Aspiring** — $16 (annual $13) · **9** · ~$1.78/video.
- **Professional** — $31 (annual $26) · **18** · ~$1.72/video. *Most popular.*
- **Agency** — $109 (annual $89) · **70** (15 brand voices, +$9/mo each extra) · ~$1.56/video.

Credits stay invisible; hidden grace buffer (Free 2→3, Aspiring 9→11, Pro 18→21, Agency 70→78); failures auto-refund; credit↔video rate server-adjustable via `RECREATION_COST`, never exposed. Source of truth: `src/lib/brand.ts`.

**Economics guardrails (from premortem):** the old ~$0.40/video assumed cheap everything — real costs stack (Apify per scrape, whisper + ffmpeg CPU-minutes, optional VLM). Before scaling, re-validate unit cost against the live render path. Ingestion failures will be common (hostile platforms) and we auto-refund on failure, so **make failed jobs cheap and fail-fast**; watch free-tier render burn (a render-heavy free user can go net-negative). Keep the VLM/video-understanding pass **optional and cost-gated, off by default**.

---

## 7. Premortem — failure modes & where each is addressed

**The one finding that matters most:** as of P1–P2 the product *fakes the two things it sells and outsources the third* — it doesn't actually read the reference video (the URL is passed to Gemini as a string; `retention_map`/`why_it_works` are confident hallucination), it doesn't actually hear how you sound (voice is built from captions+bio+hashtags, and TikTok captions are often empty), and it hands the expensive step (editing) to Submagic. Net failure mode: **churn-after-first-use** once a savvy creator realizes the intelligence is generic. Everything below converges on one keystone: **the worker service** (transcription unlocks *real analysis* + *real voice*; render unlocks *real time-saved*).

| # | Finding | Sev | Disposition |
|---|---|---|---|
| 1 | Reference not actually read → hallucinated analysis | 🔴 | **Real fix → P3** (yt-dlp + WhisperX transcript → real structure). **Shipped now (honesty):** softened framing — "Why this format works" / "Format retention pattern" + disclaimer; system prompt forbids invented per-clip specifics. |
| 2 | Voice is shallow (captions+bio, not spoken audio) | 🔴 | **→ P2.5 voice upgrade** (re-run DNA from their own recent videos via WhisperX; depends on worker/P3). Interim: bio+hashtags signal already added. |
| 3 | Outsources the edit to Submagic | 🔴 | **Real fix → P6** (own one-click auto-editor). **Shipped now:** killed the leak — `submagic_packet` → `caption_packet` (our renderer's spec), UI relabeled "Caption & edit spec". |
| 4 | DNA/ingest jobs hang (frontend-poll only) | 🟠 | **→ P3 job-queue hardening** (scheduled edge fn / pg_cron advances jobs server-side; `dna-poll` is already idempotent). |
| 5 | Strict 9-section schema + token cap → parse-fail → silent refund | 🟠 | **→ P1 reliability hardening** (retry once, segment the generation, or relax/raise `maxOutputTokens`; alert on refund-rate). |
| 6 | Handle-path user with failed scan → empty-DNA "unspecified niche" blueprint | 🟠 | **Shipped now:** `generate-blueprint` returns `NO_VOICE` (409) before spending credits if neither a confirmed voice nor quiz DNA exists. |
| 7 | Ingestion/publish hostage to hostile platforms (scrapers/ToS, IG/TikTok audits) | 🟠 | **→ P3 / P7 risk plan** (actor fallbacks, official APIs where possible, graceful degradation, fail-fast + cheap; never block the whole flow on one broken actor). |
| 8 | Unit economics can invert (real render/scrape cost vs $0.40 assumption + auto-refund) | 🟠 | **Addressed → §6** (quality-first pricing: prices +$1–10, counts trimmed, value preserved; failed jobs cheap; free-tier render watched; VLM cost-gated). |
| 9 | Cold start kills core ICP (<5 posts → empty scan) | 🟠 | **→ P2/P4** (gallery-first for cold users; bio/niche starter voice; "your voice sharpens as you post"). |
| 10 | English- & video-first bias (weak for B2B/long-form/non-English) | 🟡 | **→ P2/P3** (WhisperX multilingual; support long-form/educational formats; scope ICP accordingly). |
| 11 | No iteration (one-shot; no regenerate/A-B/compare) | 🟡 | **→ P1/P5 enhancement** (cheap "regenerate hook", variant compare). |
| 12 | Agency tier priced but workflow absent | 🟠 | **→ NEW Phase 9 (Agency workspace).** Do not push the $109 agency tier until it exists. |
| 13 | ROI proof comes dead last (analytics = P7) | 🟡 | **Consider pulling forward** a lightweight "this beat your average" signal — businesses buy outcomes. |

**Ship-now fixes (this commit):** #1 (honesty framing), #3 (Submagic→`caption_packet`), #6 (NO_VOICE guard), #8 (pricing). The rest are tagged to their phase above.

### Phase 9 — Agency workspace (NEW, from the panel)
**Macro:** make TwinAI usable as an agency's daily driver, not just a single-creator tool.
Micro: client workspaces (group brand voices + content per client) · approval/review step before publish · team seats & roles · scheduling calendar · per-client analytics/reporting · white-label · bulk/queue generation. **Don't sell the agency tier as "agency-ready" until the workspace + approvals + per-client reporting exist.** Closest fit *today* is the solo freelancer managing a few clients (voice-per-handle already works per client).

---

## 8. Discovery panels (customer signal) + re-panel milestone

**Panel #1 (pre-build, P1–P2):** 15 simulated personas (5 aspiring · 5 professional · 5 agency). Verdicts recorded in `/docs` of this plan's history. Synthesis:
- **Want-to-try is high (~12/15); want-to-pay is low** until three proofs exist: (1) the analysis is *real*, (2) it *actually sounds like me*, (3) it *actually does the edit*.
- **Saves time only conditionally** — everyone says "yes, *if it does the edit*." Today it saves ~20 min of scripting and hands the 2-hour edit back.
- **The trap:** highest-WTP segments (pros/agencies) are exactly the ones who detect the faked analysis / missing edit/workflow; easiest-to-grab (aspiring) have lowest WTP + worst cold-start.
- **Free = 2 is too stingy** to reach the "aha" for aspiring creators.
- **Beachhead (win first):** *UGC creators & solo freelancers who post for multiple brands* (#9/#12/#7) — voice-per-handle is genuinely killer for them, they have WTP, and they don't need the full agency suite.

**Re-panel milestone (SCHEDULED — do not skip):** after the worker + transcription + one-click editor ship (post-P3 voice upgrade and/or P6), **re-run a discovery panel with more niche-specific personas closer to the beachhead ICP.** Measure not just "would you try" but: **do they actually USE it, do they get the benefit, and compare before/after this build vs Panel #1's verdicts.** Gate: **don't claim PMF until a re-panel shows want-to-*pay* (not just want-to-try) for the beachhead segment.**

---

## 9. Operating model — expert panel per phase (REQUIRED ritual)

Every phase runs through a panel of **2–3 experts in that specific field** (CTOs / senior
practitioners / consultants) before *and* after the build. This is not optional — it is how
we make each phase successful and scalable.

**For each phase:**
1. **Convene** the right panel for the domain (see roster below).
2. **Elicit the micro-needs** — ask the panel: *What exactly must exist? What connects to
   what? How does it actually work in production? Where does it break at scale? What's the
   minimum that's still correct?*
3. **Write the spec** from their answers (macro intent + micro checklist) into this plan.
4. **Build** to the spec.
5. **Verify** with the same panel (re-review the diff) **and** clear the
   **security gate** (`SECURITY.md` §"Per-phase security gate"). Attach both to the PR.
6. A phase is **not done** until panel-verified + security-gated.

**Panel roster by domain:**
| Phase | Panel (experts to seat) |
|---|---|
| Worker / ingestion / transcription (keystone, P3) | Distributed-systems/infra CTO · ML/ASR engineer (Whisper) · platform-ToS/anti-bot specialist |
| One-click editor (P6) | Video-pipeline/ffmpeg engineer · motion/caption designer · GPU/cost-optimization eng |
| Publish (P7) | Social-API/OAuth specialist · trust-&-safety · compliance/privacy counsel |
| Payments (P8) | Payments/Stripe architect · finance/unit-economics · fraud/chargebacks |
| Agency workspace (P9) | B2B-SaaS RBAC architect · agency operator (design partner) · data-isolation eng |
| Platform admin (P10) | Security/AppSec CTO · trust-&-safety ops · SRE/observability |
| **Security (cross-cutting, done #1)** | Isolation CTO · abuse/cost/DoS CTO · secrets/authz/admin CTO — see `SECURITY.md` |

**Security review #1 is complete** (see `SECURITY.md`): super-admin model, rate limiting,
input bounds, and audit logging shipped; isolation/secrets/authz verified.

### Phase 10 — Platform admin & trust/safety
**Macro:** give the team a safe, audited cockpit to support users and protect the platform.
**Backend foundation — shipped** (`0003_security_admin.sql`): `platform_admins` (non-self-grantable
roles), audited cross-tenant read, `admin_grant_credits` / `admin_log`, `admin_audit_log`,
`check_rate_limit`, `is_platform_admin()` (+ client helper). **Still to build (UI/ops):** admin
dashboard (user lookup, credit grants, refunds), **impersonation/support-view with mandatory
audit + consent**, moderation/abuse queue, rate-limit & cost dashboards, alerting on refund/error
spikes. Gate: every privileged action writes to `admin_audit_log`; superadmin-only role changes.
