# TwinAI — Vision Roadmap

The product is a loop: **learn your voice → find a reference → blueprint → record →
auto-edit → publish → analytics.** Everything below extends that loop. The editing
engine and the gallery should each be strong enough to stand on their own — and
eventually be exposed so others can build on TwinAI.

## A. Auto-editor — make it CapCut-grade (worker / Hetzner)
Current (live): jump-cuts (silence/dead-air removal) + single-layer word-pop
captions + vertical 1080×1920 + loudness.

Next:
- **Transitions** — ffmpeg `xfade` (cut/zoom/slide) between jump-cut segments,
  timed to the reference's beats (we already derive beat timestamps).
- **B-roll** — two sources:
  1. **AI-generated** via **Higgsfield** (already connected here as an MCP):
     extract keywords/beats from the transcript → generate short b-roll clips →
     insert at the right timestamps.
  2. **Stock** fallback — Pexels/Pixabay free APIs by keyword.
- **Smart vertical reframe** — face/subject tracking so the speaker stays centred
  (MediaPipe AutoFlip approach) instead of a static centre-crop.
- **Music bed** — optional royalty-free track, ducked under speech.
- **"Already captioned" guard** — skip the caption layer when the source already
  has burned-in captions (the `skip_captions` flag exists; wire it to the UI/Gallery).

### Extensibility (the platform play)
- Make the editor a **modular effects pipeline**: each stage (cut → reframe →
  caption → transition → b-roll → music) is an independent step with a typed
  contract, so new engines (Higgsfield, Runway, etc.) plug in without rewrites.
- Expose it as a **job-based API** (the `jobs` queue already is one) so partners /
  power users can submit edits programmatically — "people can build on us."

## B. Gallery — a big, multi-platform, contributed feed (like CapCut templates)
Current (live): curated set of real viral TikToks, niche filter + text search,
one-click **Remix** into the Studio.

Next:
- **Search/filter by creator (voice)** and by **niche**, with a **Top vs All** toggle
  (best-in-niche surfaced first).
- **Multi-platform**: TikTok / Reels / Shorts / YouTube — a large, growing feed.
- **User submissions**: a creator can **post their own recreation to the Gallery**,
  with a **Public / Private** toggle (private = only them; public = everyone).
- **Recreate from any gallery item** — same strength as pasting a reference link
  (identical ingest → structure → blueprint engine).
- Backend: a `gallery_items` table (owner, platform, url, niche, creator, metrics,
  visibility) with RLS (public readable by all; private readable by owner).

## C. Publishing + analytics (Phase 7)
- Self-hosted **Postiz** (free) for one-click publish + real analytics → dashboard.
- Before/after-TwinAI lift, retention, engagement.

## D. Monetization & teams
- Stripe billing; agency workspace (a voice per client).

---
### Suggested build order
1. **Gallery v2** (creator/niche search + Top/All) — quick, ships now.
2. **Gallery submissions** (public/private, DB-backed) — the "CapCut feed".
3. **Editor v3** (transitions → b-roll via Higgsfield → reframe → music).
4. **Postiz publishing + analytics**.
5. **Stripe + agency**.
