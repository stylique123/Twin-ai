# Editor v2 — Source-Asset Contract (Phase 1)

The editor's input is never a browser-local pointer. Every recording becomes one
server-validated `media_assets` row, and the editor (Phase 2+) receives
`source_asset_id` — never paths, blobs, or URLs from the client.

## The flow

```
take finishes → client mints recording_attempt_id (uuid, one per take)
→ source-asset create   (server: converge on ONE asset row per attempt,
                         stable path {owner}/{generation}/{asset}.{ext},
                         signed upload token for exactly that object)
→ signed PUT of bytes   (retries re-upload the SAME object)
→ source-asset finalize (server: object really exists → editor_finalize_source():
                         uploading→validating + ONE dedup-keyed validate_source
                         job, atomically)
→ worker validate_source (bounded download, sha256, ffprobe, bounds)
→ ready | rejected      (worker-only transition)
→ editor_link_ready_source(): generations.source_asset_id + take_path
```

There is **no fallback to the legacy direct-bucket upload for new recordings**.
If the flow fails, the client keeps the Blob and retries the same attempt —
same asset, same path ("Source not saved — Retry upload"). Legacy `take_path`
records remain readable; they just can't be *created* by the new recorder.

## Idempotency (database-backed, not browser-backed)

- `media_assets` has a unique index on `(owner_id, generation_id,
  recording_attempt_id)`. Refresh, second tab, second device, timeout retry —
  every repeat of `create` for the same attempt converges on the same row and
  path. A **retake intentionally mints a new attempt id** (new asset).
- Repeated `create` returns the existing asset (+ a fresh signed token unless
  it is already `ready`). Repeated `finalize` reports the current state.
- Validation jobs carry `dedup_key = validate_source:{asset_id}:{validation_version}`
  with a partial unique index on `jobs.dedup_key` — exactly one job per asset
  version is a database guarantee.
- `editor_finalize_source()` runs uploading→validating + job insert in one
  transaction under a row lock. If a past attempt flipped the status but lost
  the job insert, the next finalize reconciles by inserting the missing job.
  Valid user media is never deleted and the asset is never reset backwards.

## State machine (trigger-enforced for every role, including service_role)

```
uploading  → validating
validating → ready | rejected
rejected   → validating      (explicit retry: requires validation_version + 1)
any        → deleted         (retention; never back out of deleted)
```

Everything else raises. Only the validating worker writes measured media fields
and `ready`; clients have **no** INSERT/UPDATE/DELETE on `media_assets` at all.

## The retake race

Take A validating slowly + user records take B + B becomes ready first →
A's late `ready` must not steal the pointer. `editor_link_ready_source()` only
updates `generations.source_asset_id` when the candidate is **newer** than the
currently linked source.

**Documented rule: the generation points to the newest ready source asset,
"newest" = highest `seq`** (a strictly monotonic identity column = insertion
order), so the rule stays deterministic even if two takes share a `created_at`
timestamp. Explicit user selection (`selected_source_asset_id`) can be added
later without changing this seam.

## Finalized-bytes integrity (upload-token replay)

The signed upload token is upsert-enabled with a platform-fixed ~2h lifetime,
so in principle a client could re-PUT the object AFTER finalize. The system
refuses to validate swapped bytes:

- `finalize` records the object's **size and storage etag** at finalize time
  (`metadata.finalized_bytes` / `metadata.finalized_etag`, set inside the
  atomic `editor_finalize_source()`).
- The validator re-HEADs the object before download and compares the etag, and
  compares the downloaded byte count to the finalized size — any mismatch →
  `rejected: bytes_changed_after_finalize` (retryable as a new validation
  version after the client re-finalizes what is actually there).
- `ready` records the content `sha256`; later consumers (the Phase 2+ editor)
  must verify it before use, so post-ready tampering is also detectable.

## No-audio policy (explicit)

A take with a video stream but **no audio** becomes `ready` — it is playable,
durable, recoverable. It is **not eligible for AI editing**: the editor's
analysis chain starts from speech. `has_audio=false` (and the mirror flag
`metadata.editor_eligible=false`) is the machine-readable gate Phase 2's
start-editor endpoint must check and refuse with a clear reason.

## Upload authorization

`create` returns a **signed upload token** (Supabase Storage
`createSignedUploadUrl`, upsert-enabled, short-lived) bound to the asset's exact
object path. The signed PUT — not the bucket INSERT policy — authorizes the
bytes, so every new-flow object provably has a corresponding intent row, with
server-checked type/size bounds and generation ownership.

**Remaining exposure (documented, scheduled):** the `takes` bucket still has its
legacy INSERT policy (authenticated, own-uid prefix), kept only for the
pre-Phase-1 recorder paths still in the wild. Once the new flow is the only
recorder in production (post-rollout verification), that policy must be revoked
so intent-less uploads become impossible. Track this as a Phase 12
(production-readiness) closure item.

## Limits & knobs

| Limit | Where | Default | Env |
| --- | --- | --- | --- |
| Size bounds | edge fn (create + finalize) | 2 KB – 600 MB | fixed (bucket cap) |
| Types | edge fn | webm / mp4 / mov | fixed |
| Duration | worker | 500 ms – 30 min | `SOURCE_MIN_DURATION_MS` / `SOURCE_MAX_DURATION_MS` |
| Resolution | worker | ≤ 4K (3840×2160 px) | `SOURCE_MAX_PIXELS` |
| Open (uploading/validating) source assets per user | edge fn | 5 | `SOURCE_MAX_OPEN_ASSETS` |
| Per-user storage quota (non-deleted assets) | edge fn | 20 GB | `SOURCE_USER_QUOTA_BYTES` |
| Probe timeout | worker | 60 s ffprobe, bounded download | fixed |
| Intent rate | edge fn | 30 / 60 s / user | fixed |

All media time is integer milliseconds with `Ms`-suffixed names.
