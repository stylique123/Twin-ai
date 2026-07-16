# TwinAI — Vision Roadmap

> For how the system is built today, see **[`ARCHITECTURE.md`](ARCHITECTURE.md)**.
> This file is what comes *next* on top of that architecture.

The product is a loop: **learn your voice → find a reference → blueprint → record →
auto-edit → publish → analytics.** Everything below extends that loop. The editing
engine and the gallery should each be strong enough to stand on their own — and
eventually be exposed so others can build on TwinAI.

## A. Auto-editor — make it CapCut-grade (worker / Hetzner)

> **SUPERSEDED:** the old auto-edit pipeline has been removed and a new one-click
> editor is being rebuilt from scratch — see `docs/ai-editor-rebuild-status.md`.
> This section is kept as feature inspiration for the rebuild only.
Current (live): jump-cuts (silence/dead-air removal) + single-layer word-pop
captions + vertical 1080×1920 + loudness.

**Principle: everything is IN-HOUSE and free to run** (ffmpeg + open data), so an
edit never adds a per-use external cost. The engine reads the user's **brand DNA**
+ the **reference/gallery video's structure** and *auto-decides* the best edit
(pacing, caption style, emoji choices, transitions, b-roll, music). The user can
**"Remake"** for a different take — which **charges another credit**.

In-house capabilities:
- **Emoji + pop-up captions** — keyword→emoji map ("money 💰", "fire 🔥") and
  animated word pops (captacity-style), all rendered with ffmpeg/ASS. No paid API.
- **Transitions** — ffmpeg `xfade` (cut/zoom/slide), timed to the reference beats
  we already derive.
- **In-house B-roll** — free stock (Pexels/Pixabay free APIs, keyword-matched to
  the transcript) + generated motion/text cards. NOT paid AI generation.
- **Dead-space removal** — done (silencedetect jump-cuts).
- **Smart vertical reframe** — face/subject tracking (MediaPipe AutoFlip approach).
- **Music bed** — royalty-free track, auto-ducked under speech.
- **"Already captioned" guard** — `skip_captions` flag (exists; wire to UI/Gallery).

### Extensibility (the platform play — LATER, never a forced cost)
- Modular effects pipeline: each stage (cut → reframe → caption → transition →
  b-roll → music) is an independent step with a typed contract.
- Optional **pro add-ons** plug in here (Higgsfield / Runway for AI b-roll) — opt-in
  only, so base pricing stays low. "Like a video editor that *can* connect to them."
- Expose the pipeline as a **job-based API** so others can build on TwinAI.

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
