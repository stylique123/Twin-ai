# AI Editor Removal Inventory (Part 1 of the one-click editor rebuild)

Branch: `rebuild/one-click-ai-editor` · Base: `c776fee`

This is the checklist for removing the OLD AI editor so the new one-click editor can be
built without interference. Every file that references editor concepts was classified.

Legend:
- **REMOVE-ENTIRELY** — whole file is old-editor; delete it.
- **REMOVE-PARTIAL** — strip the editor code, keep the rest.
- **DEPRECATE-DATA** — DB column/table/bucket used by the old editor; mark obsolete, do **not** drop now (playback, library and review still read it, and the new editor will re-populate the same seam).
- **KEEP** — reused by login, recording, upload, playback, DNA/voice, or the future editor.
- **DOC** — documentation to rewrite.

## 0. Dependency map (what breaks what)

- Worker editor graph (all REMOVE): `jobs/autoedit.ts` → `edit.ts` → {`broll.ts`, `edl.ts`, `director.ts`, `timeline.ts`}; `edl.ts` → `director.ts`. `director.ts` imports the KEEP modules `gemini.ts` + `media.ts` one-way — deleting director does not break them.
- Web trigger surface: `@twinai/shared` `api.ts` exports `autoEditTake`, `autoEditFromPath`, `reEditWithEdl`, `fetchEdl`, `TakeShots`, plus `capture.ts` `pollEditJob`. Consumed by `V2Capture.tsx`, `Result.tsx`, `savedTake.ts`.
- SHARED with recording/playback → KEEP: `uploadTakeToBucket`, `getJob`, `pickRecorderMime`, `signEditUrls` (and `signTakeUrl` only while something plays raw takes).
- Edge: `enqueue-autoedit` is the only editor edge function; its sole callers are the removed shared-api functions. `review` reads `edit_path`/`thumb_path` but is agency approval/playback → KEEP.
- The seam the NEW editor re-populates: `generations.edit_path` / `thumb_path` / `ai_thumb_path` + the `edits` bucket. Playback (`Result.tsx` video card), `review` edge fn and library "ready" stats keep working unchanged once the new editor writes them again.

## 1. Web (`apps/web/src`)

| File | Class | Notes |
| --- | --- | --- |
| `pages/v2/V2Capture.tsx` | REMOVE-PARTIAL | KEEP the entire recorder (teleprompter, camera, per-scene segments, `uploadTakeToBucket` autosave, take pointer). REMOVE: editor imports, `startAiEdit()`, `buildShots()`, the edit-style picker (`EDIT_STYLES`, `styleOpen`, `editStyle`, `confirmEdit`), the auto-edit call in `UploadMode.onFile`, and the `?job=` handoff to Result. |
| `pages/Result.tsx` | REMOVE-PARTIAL | KEEP blueprint/script/hooks/shot list/publish + finished-video playback from `edit_path` + cover. REMOVE: `pollEditJob`/`autoEditFromPath` imports, render-progress state + polling effect, `resumeEdit()`, resume-take player + `signTakeUrl` use, "Edit my video" CTA, inline render-progress card, take-pointer resume wiring. |
| `pages/Settings.tsx` | REMOVE-PARTIAL | REMOVE the brand-kit caption-style chips + highlight-color swatches (they map 1:1 to the old worker caption engine) and `CAPTION_STYLE_OPTIONS`/`CAPTION_COLOR_OPTIONS` import. KEEP DNA fields, plan/billing, workspace, palette, logo. |
| `lib/savedTake.ts` | REMOVE-PARTIAL | KEEP the `takePath` autosave pointer (recording safety). REMOVE the `shots` field + `TakeShots` import. |
| `pages/v2/V2Building.tsx` | KEEP | Blueprint/timeline **build** screen (`generateBlueprint`/`ingestReference`) — not the editor. |
| `pages/v2/V2Create.tsx`, `Dashboard.tsx`, `History.tsx`, `Calendar.tsx` | KEEP | Read deprecate-data columns for library state; those columns stay. |
| `lib/timeline*.ts`, `lib/api.ts`, `lib/capture.ts` | KEEP | Re-export shims of `@twinai/shared`; recording/teleprompter needs them. |

## 2. Shared (`packages/shared/src`)

| File | Class | Notes |
| --- | --- | --- |
| `api.ts` | REMOVE-PARTIAL | REMOVE `TakeShots`, `autoEditFromPath`, `autoEditTake`, `fetchEdl`, `reEditWithEdl` (the last two were already dead code) and editor-only `IngestJob.result` fields (`edl_path`, `output_path`, `output_url`). KEEP `uploadTakeToBucket`, `getJob`, `signEditUrls`, and the whole non-editor API surface. |
| `capture.ts` | REMOVE-PARTIAL | REMOVE `PollEditOptions` + `pollEditJob`. KEEP `pickRecorderMime`. |
| `types.ts` | REMOVE-PARTIAL | REMOVE `EditDecisionList`, `CAPTION_STYLE_OPTIONS`, `CAPTION_COLOR_OPTIONS`. Generation fields `edit_style`/`edit_path`/`thumb_path`/`ai_thumb_path`/`take_path`/`edl_path` stay typed (DEPRECATE-DATA; playback compiles against them). `selected_hook` KEEP (recording). |
| `brand.ts`, `timeline.ts`, `timelineAdapter.ts`, `timelineApi.ts`, `index.ts` | KEEP | Scene-timeline/WPM/teleprompter helpers power recording and the plan. |

## 3. Edge functions (`supabase/functions`)

| File | Class | Notes |
| --- | --- | --- |
| `enqueue-autoedit/` | REMOVE-SOURCE, KEEP-TOMBSTONE | Source dir + its `[functions.enqueue-autoedit]` `config.toml` entry removed. The *deployed* function is kept as a 410 tombstone (single tombstone policy in `docs/ai-editor-rebuild-status.md`) — do NOT delete it yet; delete only after logs show zero supported-client calls for a release cycle. |
| `review/` | KEEP | Login-free agency approval/playback of the finished video. |
| everything else | KEEP | DNA, blueprint, thumbnail, billing, social, admin — unrelated. |

## 4. Worker (`worker/src`)

REMOVE-ENTIRELY: `edit.ts` (ffmpeg auto-edit engine), `director.ts` (AI Edit Director / EditPlan), `edl.ts`, `broll.ts` (Pexels/music), `timeline.ts` (worker-side mirror, only autoedit imports it), `jobs/autoedit.ts` (the `autoedit` job handler and the Revideo call site). Editor-only Python: `scene_detect.py`, `beats.py`, `vad.py`, `clip_rank.py`.

REMOVE-PARTIAL:
- `jobs/index.ts` — drop the `autoedit` registry entry + import.
- `env.ts` — drop editor-only keys: `editEmoji`, `pexelsKey`, `editBroll`, `musicBedUrl`, `revideoUrl`, `revideoTrusted`, `revideoTimeoutMs`, `whisperFillerModel`, `editWindowWhisper`; drop `autoedit` from the `jobTypes` default.
- `worker/.env.example` — remove the editor toggles block + `autoedit` from `WORKER_JOB_TYPES`.

KEEP (job-queue primitives + DNA/voice/ingest, and the ffmpeg/whisper deps the new editor will reuse): `index.ts` poll loop, `db.ts`, `storage.ts`, `jobs/index.ts` registry, `jobs/transcribe.ts`, `jobs/scrapeDna.ts`, `jobs/voice.ts`, `gemini.ts`, `media.ts`, `structure.ts`, `voice.ts`, `whisper_transcribe.py`, `youtube_transcript.py`, Dockerfile ffmpeg/whisper layers.

## 5. Revideo (`revideo/`) — REMOVE-ENTIRELY

The premium Chromium caption renderer, reachable only from `jobs/autoedit.ts`. Delete the whole directory (`server.ts`, `render.ts`, `src/project.tsx`, Dockerfile, fonts, configs) plus:
- `.github/workflows/deploy-revideo.yml` (REMOVE-ENTIRELY)
- `.github/workflows/deploy-worker.yml` (REMOVE-PARTIAL: drop the `REVIDEO_URL` env seed and revideo health checks)
- Operator step (VPS): stop + remove the `twinai-revideo` container and its image; remove `REVIDEO_*`, `RENDER_TOKEN`, `RENDER_ALLOWED_HOSTS` from the worker box env.

## 6. Migrations / data — DEPRECATE-DATA (do NOT drop now)

Schema history is additive; nothing is deleted. Obsolete-once-new-editor-lands:
- `0006` (edits bucket + `edit_path` + autoedit policy), `0012`/`0013`/`0055` (thumb + edits-bucket mimes), `0014` `edit_style` (but `selected_hook` KEEP), `0015` `edl_path` (but `take_path` KEEP), `0019` autoedit refund trigger, `0060` autoedit constraint, `0034` `free_export_used` watermark flag, `0043`/`0051`/`0063` brand_kit caption preset/color.
- `0024`/`0029`/`0035`/`0059` analytics: `edits_rendered` and "ready" stats key off `type='autoedit'` jobs / `edit_path is not null` — they will read 0/stale until the new editor writes `edit_path` again. Harmless.
- KEEP outright: `takes` + `edits` buckets (recording + finished-video playback), `scene_timeline` (`0050`/`0053` — teleprompter/recording), `0030` security revokes.

## 7. Explicitly NOT removed (per spec)

Login/auth, user accounts, Supabase project config, recording & upload (recorder, takes bucket, `uploadTakeWithProgress`), private media storage, finished-video playback, general project/generation data, and the ffmpeg/whisper worker dependencies — all untouched.

## 8. Deletion order used

1. Web: strip editor code from `V2Capture.tsx`, `Result.tsx`, `Settings.tsx`, `savedTake.ts`.
2. Shared: remove editor exports from `api.ts`, `capture.ts`, `types.ts`.
3. Edge: delete `enqueue-autoedit/` + its `config.toml` entry.
4. Worker: delete `jobs/autoedit.ts`, `edit.ts`, `edl.ts`, `director.ts`, `broll.ts`, `timeline.ts`, editor-only `*.py`; edit `jobs/index.ts` + `env.ts`.
5. Delete `revideo/` + `deploy-revideo.yml`; de-Revideo `deploy-worker.yml`.
6. Leave all migrations, buckets and generation columns in place.
7. Rewrite docs (`ARCHITECTURE.md`, `README.md`, `DEPLOY.md`, etc.) + `docs/ai-editor-rebuild-status.md`.
