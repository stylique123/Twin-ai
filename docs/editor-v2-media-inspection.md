# Editor v2 — Media inspection (Phase 4)

Phase 4 replaces the simulated `inspecting` stage with real inspection. Every
later stage (transcribing → validating) remains simulated. The governing rule:
**analyze once and reuse the result** — Phase 1's `validate_source` already
downloaded, checksummed and ffprobed the recording.

## What the stage does

1. Loads the ready source asset; re-checks eligibility at execution time
   (missing / deleted / rejected / not-ready / not-editor-eligible each fail
   the project with a stable code BEFORE any later stage).
2. Cache lookup: one immutable `inspection` component per
   `(source_asset_id, component, inspectorVersion)` in `media_analyses`.
   Hit → done, nothing downloaded, nothing probed.
3. Cheap integrity reconciliation: storage etag vs the etag recorded at
   finalize — proves the object is still the validated bytes without a
   download. Mismatch → `source_bytes_changed`, permanent.
4. Builds the canonical `MediaInspection` contract (integer milliseconds,
   rational frame rates — never float seconds) from the Phase-1 facts:
   `content_sha256`, `duration_ms`, dimensions, rotation, `has_audio`,
   container/codecs, and the `probe_facts` block `validate_source` now
   persists (frame rates, pixel format, color space, audio sample
   rate/channels/layout).
5. **Fallback probe only when required facts are missing** (assets validated
   before `probe_facts` existed): bounded, abortable download → sha256
   verified against the Phase-1 checksum → ffprobe (hard timeout, detached
   process group) → the one-time upgrade is cached, so it never repeats for
   the same (asset, inspector version).
6. Persists through the fenced `editor_record_inspection` RPC: lease + attempt
   token re-proved, and the recorded checksum must match the project's
   CURRENT source asset — a stale worker cannot publish, and an analysis can
   never attach to different bytes. Concurrent misses converge on one row.

## Cache identity (the cross-tenant fix)

0078's global `unique(source_hash, analyzer_bundle_version)` collided when two
unrelated users uploaded identical bytes and would have leaked one tenant's
row/lifecycle into another's. 0082 replaces it with **per-asset identity**:
`unique(source_asset_id, component, analyzer_bundle_version)`. No cross-tenant
deduplication (revisit only with proven economic value via a separate private
cache table). Rows are RLS-scoped to owner+workspace like every editor table.

## Component model (analysis immutability)

`media_analyses` holds one row per COMPONENT — `inspection` now; `speech`,
`visual`, `audio`, `hook` in later phases. Each row is independently
versioned, append-only at the database (UPDATE always raises; DELETE only via
the asset retention cascade), traceable to `source_hash`, and recomputed only
by bumping its version. Later phases ADD sibling rows; they never mutate
Phase 4's inspection.

## Cooperative cancellation

A watcher polls `cancel_requested_at` (750 ms) and trips an `AbortController`:
the download stream aborts mid-transfer and ffprobe's **process group** is
SIGKILLed — cancellation lands inside the stage, not at its boundary. The
matrix proves it mid-download, mid-probe, and after persist (the persisted
component is kept: it is content-addressed and safe). A cancelled or stale
run cannot publish (fenced writer).

## Carry-forward integrity rule (Phases 5–10)

ETag/size reconciliation protects cache selection, not later stages. Any
future stage that downloads source bytes (transcription, rendering, …) must
re-reconcile the current etag/size AND sha256-verify what it downloaded
before processing — a source replaced after Phase 4's HEAD check must never
reach a later stage's pipeline. Legacy assets with no finalize reference get
it backfilled (fenced, absent-only) after their first sha256-verified upgrade
download; an asset with neither a finalize etag nor a trusted sha256 fails
closed.

## Error sanitization

Everything persisted (events, `failure_details`, `jobs.error` via the safe
message) passes `sanitizeError`: stable code, safe stage, retry class, and a
bounded message with URLs, tokens/JWTs, auth headers, filesystem paths, hex
blobs and DSNs redacted. Raw diagnostics remain only in worker stdout
(container logs, Docker-rotated).

## Telemetry

Every inspection appends `inspection_recorded` with
`{cache_hit, reused_validation_facts, fallback_probe_performed,
inspector_version}` — the staging gate counts these to prove ffprobe ran only
for forced upgrade paths.
