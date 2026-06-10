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
| `gallery_items` | id, niche, platform, title, metrics(jsonb), structure(jsonb), source | 4 | curated viral feed (no copyrighted media stored) |
| `generations` | id, user_id, brand_voice_id, reference_id, blueprint(jsonb), fidelity | ✅1 | the script/hooks/shot list output |
| `recordings` | id, generation_id, storage_path, duration, source(record/upload) | 5 | raw take in Storage |
| `renders` | id, generation_id, recording_id, storage_path, status, options(jsonb) | 6 | finished captioned video |
| `posts` | id, render_id, platform, external_id, scheduled_at, status, metrics(jsonb) | 7 | publish + analytics back |
| `credit_events` | id, user_id, delta, reason, created_at | ✅1 | audit ledger |
| `subscriptions` | id, user_id, plan, stripe_customer, status, period_end | 8 | Stripe-driven; resets credits |
| `jobs` | id, type, payload(jsonb), status, attempts, result(jsonb), created_at | 3 | the worker queue |

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

### Phase 2 — Brand-DNA from handle (the moat)
**Macro:** replace the quiz with "@handle → we read your last N posts → a voice profile you confirm in one tap."
Micro tasks:
1. DB: `brand_voices` table + RLS; `profiles.account_type`.
2. Edge fn `start-dna`: validate handle, enqueue `build_dna` job, return job id.
3. Worker `build_dna`: Apify profile scrape (last 15–25 posts + captions) → faster-whisper transcribe the videos → Gemini 3.1 Pro prompt → emit `profile` JSON {tone, pacing, vocabulary, hook_style, niche, recurring_ctas, do/dont}.
4. Frontend: handle input screen → live progress (Realtime) → **DNA confirm card** (editable chips) → save as default brand voice.
5. Wire generation to pull `brand_voices.profile` instead of the quiz `dna`.
6. Agency: allow N brand voices; switcher in the workspace.
**Connects to:** generation (Phase 1) reads the voice profile. **Keys:** Apify. **Acceptance:** paste a handle, get an accurate voice profile in <60s, generate a script that sounds like them.

### Phase 3 — Real reference ingestion
**Macro:** "analyze any video" becomes literal — real transcript + structure, not inference.
Micro:
1. DB: `references`, `jobs`.
2. Worker `ingest` (yt-dlp → temp file) → `transcribe` (faster-whisper, word timestamps) → derive `structure` (hook window, beat timing, shot changes, CTA) via Gemini → **delete the source file** (analyze-and-discard; store only transcript+structure).
3. Studio: paste link → enqueue ingest → progress → feed `reference.structure` into generation.
4. Legal guardrail baked in: never persist/redistribute source media; store metadata only.
**Connects to:** generation now takes real structure. **Acceptance:** paste a TikTok, see a real retention map drawn from its actual transcript.

### Phase 4 — Gallery
**Macro:** curated, niche-filtered, daily-refreshed viral feed → recreate without a link.
Micro:
1. DB: `gallery_items` (structure + metrics only, no copyrighted media).
2. Worker `refresh_gallery` (cron): Apify trending by niche → extract structure → upsert.
3. Frontend: gallery grid (filter by niche/platform), "Recreate this" → reuses Phase 3 pipeline with a pre-analyzed item.
4. Make gallery the default landing for logged-in users (fastest time-to-first-value).
**Acceptance:** a cold user with no link hits "Recreate" in <30s.

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

### Phase 7 — Publish + analytics
**Macro:** one-tap publish to their socials (creator vs agency brand), metrics back.
Micro:
1. Connect-accounts flow via **Ayrshare** (absorbs TikTok audit + IG business reqs).
2. Worker `publish`: post render via Ayrshare (user-initiated, original content — ToS-safe positioning baked in).
3. `posts` table; scheduling calendar; per-brand account mapping (agency).
4. Analytics: pull post metrics back → "this recreation got 3× your average."
**Keys:** Ayrshare. **Acceptance:** publish to a connected account, see views come back in the dashboard.

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
`Go live (P1)` → `DNA (P2)` → `Ingestion (P3)` → `Gallery (P4)` ⟶ `Record (P5)` → `Render (P6)` → `Publish (P7)` → `Payments (P8)`.
P5 (record) can be built in parallel with P3/P4 since it only needs the P1 script. **Start platform API audits (TikTok/IG via Ayrshare) during P5 — they take weeks.**

## 6. Pricing/economics (final, locked)
All-in cost ~$0.40/video; sold ~$1.00–1.50; ~64–70% margin. Tiers: Free 2 · Aspiring $15/10 · Professional $29/22 · Agency $99/80 (15 brand voices, +$9/mo each extra). Credits invisible; hidden grace buffer (Free 2→3, Aspiring 10→12, Pro 22→25, Agency 80→90); failures auto-refund; credit↔video rate server-adjustable via `RECREATION_COST`, never exposed.
