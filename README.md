# TwinAI

**Remix any viral video in seconds.** TwinAI turns any proven reference (Reel, TikTok, Short, YouTube) into a personalized, *shootable* blueprint — hook, script, shot list, captions, edit plan, and a publish schedule — in the creator's own voice. Reference-based creation, not a clipper. We copy structure, never content.

This is a fresh, real rebuild: a Vite + React + TypeScript frontend, a Supabase backend (Postgres + Auth + RLS), and Gemini-powered edge functions that do the actual AI generation server-side.

> Rebuilt after the original source was lost. The earlier deploy was a frontend-only mock with no real backend/AI; this version replaces the faked generation with real Gemini calls, real auth, and real persistence.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vite, React 18, TypeScript, Tailwind, React Router |
| Auth + DB | Supabase (Postgres, Row Level Security, Auth) |
| AI | Google Gemini (`gemini-3.1-pro-preview`) via Supabase Edge Functions — provider isolated server-side, swappable |

> **System shape:** see **[`ARCHITECTURE.md`](ARCHITECTURE.md)** — the authoritative
> end-to-end design (Vercel SPA → Supabase data plane → Edge Functions → `jobs` queue
> → VPS worker → satellites). For deploy steps see [`DEPLOY.md`](DEPLOY.md).

## What's real vs. roadmap

**Real now**
- Email/password auth (Supabase) + per-user profiles
- 90-second creator-DNA onboarding stored in Postgres
- **Real AI blueprint generation** — the edge function calls Gemini with the creator's DNA + the reference and returns a structured, shootable plan (no templates, no mocks)
- Atomic credit ledger (spend on generate, auto-refund on failure)
- Generation history, all under RLS

**Built since this list was first written**
- Pulling/transcribing the actual reference video — the ingest pipeline + VPS worker fetch and transcribe real TikTok/YouTube/IG references (via Apify + Whisper).
- In-app auto-edit / rendering / export — the VPS worker cuts, captions, grades, and loudness-normalizes the take into a finished vertical MP4 (ffmpeg, with an optional Revideo premium pass).
- Checkout rails — the billing edge function + webhook are built; paid plans are gated off behind the `PAYMENTS_LIVE` flag until go-live.

**Roadmap (honestly not built yet / partially)**
- Direct auto-publish: YouTube one-click upload works via OAuth; TikTok/Instagram connect is wired but publishing is gated on each platform's content-API app review. Until then we produce a ready-to-paste caption + schedule.
- Flipping `PAYMENTS_LIVE` / `POSTING_LIVE` on for production.

## Local setup

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run web
```

## Backend setup (Supabase)

1. Create a Supabase project (free tier is fine).
2. Apply the schema:
   ```bash
   supabase link --project-ref <your-ref>
   supabase db push                 # applies supabase/migrations/0001_init.sql
   ```
3. Deploy the edge function and set its secret:
   ```bash
   supabase functions deploy generate-blueprint
   supabase secrets set GEMINI_API_KEY=...
   # optional: supabase secrets set GEMINI_MODEL=gemini-3.1-pro-preview
   ```
4. Put the project URL + anon key into `.env.local` (frontend) — the function reads `SUPABASE_*` and `GEMINI_API_KEY` from its own secrets.

## Deploy (frontend)

Vercel: import the repo, framework = Vite. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as env vars. `vercel.json` already rewrites all routes to `index.html` for the SPA.

## Project layout

```
apps/web/src/
  lib/        shims re-exporting @twinai/shared (supabase client, API layer, brand, timeline)
  context/    auth provider
  components/ Nav, AppShell, RefinePanel, v2 primitives, …
  pages/      Landing, Auth, Onboarding, Dashboard, Result, History, Gallery, v2/ (Create → Building → Capture → Review)
packages/shared/   @twinai/shared — types, brand tokens, API layer, scene timeline
supabase/
  migrations/ 0001 → 0065  (profiles, generations, jobs, RLS, RPCs, buckets)
  functions/  15 edge functions (generate-blueprint, start-dna, dna-poll, enqueue-autoedit, social, …)
worker/       VPS auto-edit pipeline (ffmpeg + whisper + Gemini director)
```

## Brand

Tokens live in `tailwind.config.js` and `src/lib/brand.ts`, mirroring the Brand & GTM cheat sheet: ink `#07070A`, cream `#F6F1E9`, amber `#FFB347`, coral `#FF5B7B`, teal `#65E5D8`; signature gradient amber→coral→teal at 135°; Geist/Inter type. Voice: creator-to-creator, direct and warm — never "guaranteed viral".
