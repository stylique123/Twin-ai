# AI Editor Rebuild — Status

> ⚠️ **HISTORICAL SNAPSHOT — describes the state right after the OLD editor was
> removed.** Some statements below (e.g. an early three-type job registry, the
> `take_path` future-seam) are superseded. Current truth: the registry is the
> **five** types in `worker/src/env.ts`
> (`ingest, build_voice, scrape_dna, validate_source, editor_v2`); the durable
> input is the `media_assets` source asset, not `take_path`; the rebuilt editor
> is the gated `editor_v2` loop. See **`ARCHITECTURE.md`** and
> **`docs/editor-v2-speech-analysis.md`** for current state.

Branch: `rebuild/one-click-ai-editor`

## Where things stand

**Part 1 (remove the old editor) is done on this branch.** The old auto-edit
pipeline — worker ffmpeg engine, Gemini "Director", EDL data structures, Revideo
premium renderer, the `enqueue-autoedit` edge function, and every UI action that
triggered an edit — has been removed. The full classified checklist of what was
removed vs. kept is in `docs/ai-editor-removal-inventory.md`.

## What was removed

- **Web:** the edit-style picker + "Auto edit" action in the recorder, the
  "Edit my video" CTA and inline render-progress on the studio page, and the
  caption preset/highlight controls in Settings' brand kit.
- **Shared API:** `autoEditTake` / `autoEditFromPath` / `reEditWithEdl` /
  `fetchEdl` / `pollEditJob` / `TakeShots` / `EditDecisionList` / caption option
  constants.
- **Edge:** `supabase/functions/enqueue-autoedit/` (+ its `config.toml` entry).
- **Worker:** `edit.ts`, `director.ts`, `edl.ts`, `broll.ts`, `timeline.ts`,
  `jobs/autoedit.ts`, editor-only Python (`vad.py`, `beats.py`, `scene_detect.py`,
  `clip_rank.py`), caption fonts, and the editor env flags (`EDIT_*`, `PEXELS_*`,
  `MUSIC_BED_URL`, `REVIDEO_*`). The Docker image no longer installs torch / CLIP /
  scenedetect / silero — only yt-dlp + faster-whisper remain.
- **Revideo:** the whole `revideo/` service and `deploy-revideo.yml`.

## What still works (deliberately untouched)

Login/auth and accounts · recording with the teleprompter · take autosave to the
private `takes` bucket (+ the local resume pointer) · uploading an existing clip ·
playback of already-finished videos (`edit_path`) and covers · blueprints, DNA,
gallery, posting, billing · the jobs queue (`ingest`, `build_voice`, `scrape_dna`).

## The seam the new editor plugs into

- **Input — ⛔ SUPERSEDED, DO NOT BUILD FROM THIS.** Kept verbatim below as the
  record of what was true when the old editor came out; every imperative in it
  has since been satisfied. What is true now:
  - **`generations.source_asset_id` is the durable, authoritative input pointer**
    (`0076_media_assets.sql`), written **server-side under the service role** by
    the finalize RPC in `0091_editor_capture_hardening.sql`, which also mirrors
    `take_path` as a compatibility projection and applies a monotonic
    newest-wins retake rule so a late-completing older take cannot steal the
    pointer from a newer one.
  - **Cross-device recovery and recovery after cleared localStorage DO work.**
    `Result.tsx` resolves server asset → `take_path` → local pointer, and treats
    the local pointer as a same-tab convenience, never as proof of an upload.
  - **`uploadTakeToBucket` is no longer the recorder's uploader.** It has **zero
    callers** — the capture flow goes through the source-asset intent path
    (`V2Capture.tsx`). The dead export and the legacy `takes` INSERT policy it
    implies are tracked in issue #205.

  The original paragraph, unedited:

  > **Input — IMPORTANT, verify before relying on it:** the raw take bytes are
  > uploaded to the private `takes` bucket by the recorder (`uploadTakeToBucket`),
  > and the storage path is kept **only in localStorage** (`saveTakePointer`,
  > `apps/web/src/lib/savedTake.ts`). **`generations.take_path` is NOT written by any
  > current code** — the rows that have it (6/32) are historical, written by the old
  > editor path that was removed. So `Result` recovers a *new* take only via the
  > local pointer (`resumeTake?.takePath`), which means **cross-device recovery and
  > recovery after localStorage is cleared do NOT work today.** Note also that after
  > migration 0074/0075 the client roles have **no UPDATE grant on `take_path`**.
  > **Part 2 must add durable persistence of `take_path`** — the recorder (or an edge
  > function) must write the storage path onto the generation row after a validated
  > upload — before the new editor can treat `generations.take_path` as the input
  > seam. Until then the take is durable in the bucket but its *pointer* is browser-local.
- **Output:** write the finished MP4 + cover to the private `edits` bucket and set
  `generations.edit_path` / `thumb_path`. Playback (studio page, Library "ready"
  state, the `review` approval page, posting) all light up again automatically.
- **Queue:** register a new job type in `worker/src/jobs/index.ts` and add it to
  `WORKER_JOB_TYPES`. `db.ts` (claim/complete/fail), `storage.ts` and the ffmpeg +
  faster-whisper deps are all still in place to reuse.

## Database-level guarantee (not just "nothing enqueues it")

Migration `0073_block_new_autoedit_jobs.sql` adds a `BEFORE INSERT` trigger on
`public.jobs` that **rejects any new row with `type='autoedit'`, for every role
including the service role** (triggers fire regardless of RLS/role). Verified
live: a service-role-context insert is rejected and the historical row count is
unchanged (0 new job, 0 credits, 0 storage). The rebuilt editor MUST register a
**new** job type — it must not reuse `autoedit`.

## Approved transitional remnants (explicit, not "absent")

These are intentionally kept and are inert; listing them so "zero-legacy" is not
overstated:
- **Deployed edge function `enqueue-autoedit`** — kept as a **410 tombstone**
  (disabled + non-executable, not absent) so a stale client gets an explicit
  error instead of silent behavior. Inserts nothing. **Tombstone policy (single,
  authoritative):** keep the authenticated 410 tombstone through a compatibility
  window; do not describe it as absent while deployed. Remove it (`supabase
  functions delete enqueue-autoedit`) only after confirming, via edge-function
  logs, zero calls from supported clients for a full release cycle. Even if
  invoked it is inert (the DB trigger from 0073 also blocks any `autoedit` insert).
- **`refund_failed_autoedit` trigger + `autoedit_requires_generation` constraint**
  on `jobs` — dormant; fire only for a job type that can no longer be created.
- **`admin/index.ts` metric** counting historical `type='autoedit'` jobs — read-only.
- **`generations.edit_style` / `edl_path` columns** — legacy no-ops (deprecate-data).
- Explanatory "removed" **comments** in `worker/src/env.ts` and `jobs/index.ts`.

## Deprecated data (kept, not dropped)

`generations.edit_style` and `edl_path` are legacy no-ops. Analytics "edits
rendered" reads 0 for new activity until the new editor ships.

## Regression tests (Part 1 guard)

- `packages/shared/src/__tests__/no-legacy-editor.test.ts` — the client API surface
  cannot construct an editor call (removed exports absent), recording/playback
  primitives present, and `buildRecordingScript` still turns a blueprint into
  recordable teleprompter scenes. (Named `buildTimeline` when this was written;
  renamed with the SceneTimeline→RecordingScript model rename in `5ac92f5`.)
- `worker/src/__tests__/registry.test.ts` — asserts the job registry has no
  `autoedit` handler and editor env flags are gone. (The registry has since
  grown to the current five types — `ingest, build_voice, scrape_dna,
  validate_source, editor_v2` — see `worker/src/env.ts`.)
- Both run in CI (`pr-checks.yml` → `unit-tests`), alongside the `no-legacy-editor`
  grep guard.

## Operator steps when this branch deploys (VPS / Supabase)

1. VPS: `docker rm -f twinai-revideo && docker rmi twinai-revideo` (one-time —
   `deploy-worker.yml` now also does this automatically). It also scrubs
   `REVIDEO_*`/`PEXELS_API_KEY`/`MUSIC_BED_URL`/`EDIT_*` and the retired job types
   (`autoedit`, `transcribe`) from `/opt/twinai-worker.env` so the box's
   `WORKER_JOB_TYPES` matches the code registry `{ingest, build_voice, scrape_dna}`.
2. Supabase `enqueue-autoedit` — **KEEP as the deployed 410 tombstone** (single
   policy; see "Tombstone policy" under *Approved transitional remnants* above).
   Do NOT delete it yet — but note the removal condition it sets ("zero calls
   from supported clients for a full release cycle") has had several release
   cycles to elapse since, so this is worth re-checking against the
   edge-function logs rather than left standing indefinitely. Whether the
   tombstone is still deployed cannot be verified from this repository: the
   source directory and its `config.toml` entry were both removed, so the claim
   is about the deployed function only.

## Before merging to main — honesty checklist ✅ RESOLVED

- ~~The Landing page and `apps/web/index.html` meta/SEO copy still advertise
  "auto-edits captions and cuts". Either land Part 2 (the new editor) first, or
  soften that copy when this branch merges — otherwise the product over-claims
  while editing is being rebuilt.~~
  **Done — the copy was softened.** No "auto-edits captions and cuts" claim
  remains in `apps/web/index.html` or the Landing page; the current meta/SEO copy
  describes reference → blueprint → teleprompter → caption/hashtags/timing and
  claims no auto-editing. Re-check this if that copy is ever rewritten to
  advertise editing again before the editor is generally available.

## Non-goal (explicit)

The first production AI editor is one-click. TwinAI does not provide a manual
multitrack timeline, editable EDL, or second renderer. There is no Refine panel,
no drag-to-trim, no waveform/playhead editor, and no manual rerender path. See
`docs/manual-editor-remnant-inventory.md` for the discovery/verification that no
such surface remains.

## Next: Part 2 — build the new one-click editor

Design goal: ONE new pipeline (no dual renderers, no fallback paths), reading the
take from the seam above and producing an edited vertical video with captions in
a single click.
