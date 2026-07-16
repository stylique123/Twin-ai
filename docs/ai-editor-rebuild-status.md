# AI Editor Rebuild — Status

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

- **Input:** the raw take at `generations.take_path` (private `takes` bucket).
  The recorder autosaves every finished take there and keeps a local pointer
  (`apps/web/src/lib/savedTake.ts`).
- **Output:** write the finished MP4 + cover to the private `edits` bucket and set
  `generations.edit_path` / `thumb_path`. Playback (studio page, Library "ready"
  state, the `review` approval page, posting) all light up again automatically.
- **Queue:** register a new job type in `worker/src/jobs/index.ts` and add it to
  `WORKER_JOB_TYPES`. `db.ts` (claim/complete/fail), `storage.ts` and the ffmpeg +
  faster-whisper deps are all still in place to reuse.

## Deprecated data (kept, not dropped)

`generations.edit_style` and `edl_path` are legacy no-ops. All autoedit-related
migrations (refund trigger, constraints, analytics counting `type='autoedit'`)
remain in place and are harmless — nothing enqueues that job type anymore.
Analytics "edits rendered" reads 0 for new activity until the new editor ships.

## Operator steps when this branch deploys (VPS / Supabase)

1. VPS: `docker rm -f twinai-revideo && docker rmi twinai-revideo` (one-time).
   `deploy-worker.yml` scrubs `REVIDEO_*` from `/opt/twinai-worker.env` automatically;
   also remove `PEXELS_API_KEY`, `MUSIC_BED_URL`, `EDIT_*` if present, and drop
   `autoedit` from `WORKER_JOB_TYPES` if the box overrides it.
2. Supabase: delete the deployed `enqueue-autoedit` edge function
   (`supabase functions delete enqueue-autoedit`).

## Before merging to main — honesty checklist

- The Landing page and `apps/web/index.html` meta/SEO copy still advertise
  "auto-edits captions and cuts". Either land Part 2 (the new editor) first, or
  soften that copy when this branch merges — otherwise the product over-claims
  while editing is being rebuilt.

## Next: Part 2 — build the new one-click editor

Design goal: ONE new pipeline (no dual renderers, no fallback paths), reading the
take from the seam above and producing an edited vertical video with captions in
a single click.
