# Editor v2 — Phase 6: Real `analyzing` (visual / audio / hook evidence)

Phase 6 makes the `analyzing` stage REAL. Three immutable, digest-keyed
EVIDENCE components are computed from the verified source bytes and the
earlier components — nothing in this phase decides a cut, crop, zoom, or edit,
and nothing downstream exists yet (no Director, EditPlan, renderer, UI,
billing). `completed` still means `output_asset_id NULL`: a SCAFFOLD state,
never a product success. The start-editor-v2 launch gate stays fail-closed in
production.

## Pinned boot manifest + recording-script snapshot

Before the first `queued → inspecting` transition, the worker pins — via the
fenced, set-once `editor_pin_manifest` RPC — two documents onto the project:

* **BootArtifactManifest** (`edit_projects.boot_manifest` + `_sha`):
  `manifestEpoch` (sole authority `PIPELINE_EPOCH` in contracts), the five
  component versions, the three Phase-6 component digests, the exact model
  artifacts (pinned Faster-Whisper snapshot + pinned YuNet .onnx), the
  reproducible build inputs (worker commit, Dockerfile sha, dependency-lock
  sha — no local image digest), the ffmpeg version-banner sha, and the frozen
  rules identity (`analysis-rules-1` + boundsSha256).
* **RecordingScriptSnapshot** (`edit_projects.script_snapshot` + `_sha`): what
  the creator was prompted to speak, from `generations.scene_timeline` /
  `selected_hook`. Canonicalization: NFC, whitespace collapsed, recursively
  sorted keys, no insignificant whitespace. **Scenes are never dropped**: a
  canonical snapshot over 65,536 bytes FAILS CLOSED with the stable code
  `script_snapshot_too_large`.

Pinning is idempotent on resume (`already_pinned` when equal); a DIVERGENT
manifest (different worker build / rules / model mid-project) fails closed as
the PERMANENT `manifest_mismatch` — component versions are never mixed within
one project. Both column pairs are CHECK-enforced both-or-neither, immutable
via a set-once trigger.

## Cache identity (tenant-safe, digest-keyed)

`componentDigest = sha256(canonicalJson({version, effectiveConfig,
modelHashes, boundsSha256}))`. Components are keyed
**(source_asset_id, component, component_digest)** — per-tenant asset
identity, deliberately NO global content-hash dedup. `manifest_sha` on a
component row is provenance only, never part of the key.

Migration 0086 replaces the old total unique index with two partial ones:

| Rows | Unique key | Writer |
|---|---|---|
| legacy (`component_digest IS NULL`) | `(source_asset_id, component, analyzer_bundle_version)` | `editor_record_inspection` (inspection/speech, ON CONFLICT names the partial predicate) |
| digest (`component_digest IS NOT NULL`) | `(source_asset_id, component, component_digest)` | `editor_record_analysis` (visual/audio/hook, ON CONFLICT names the partial predicate) |

Two DIFFERENT digests for the same (asset, component) may coexist (a config or
model change recomputes without deleting history); the SAME digest converges
on one row. `editor_record_analysis` is fenced (lease + attempt), re-verifies
the source checksum, enforces per-component byte caps at the DB (visual
262144, audio 65536, hook 16384), requires the project's pinned manifest, and
is the single event accountant: `analysis_component_recorded` vs
`analysis_component_reused` with `edit_events.dedupe_key`
(`analysis:<component>:<digest>:<recorded|reused>`; manifest pinning uses
`pin:<sha>`) so crash-retries never double-count.

## VerifiedSourceSession (attempt-scoped byte ownership)

One session per job attempt, shared by inspecting / transcribing / analyzing:

* `reconcileRemote()` — cheap HEAD etag+size vs the finalize reference; runs
  before any cache acceptance and at stage boundaries; drift is the PERMANENT
  `source_bytes_changed` (the established Phase-4/5 integrity code).
* `localPath()` — memoized: AT MOST ONE download per attempt, sha256-verified
  against the validation checksum before any consumer sees the path; a
  mismatch is the PERMANENT `source_bytes_changed`.
* `dispose()` — exactly once at attempt end; later byte access is a bug.

**Download truth table** (asserted in staging from evented metrics —
`source_downloads` on the completion event):

| Scenario | Downloads |
|---|---|
| every component cache-hits (full reuse) | 0 |
| only hook recomputes (pure function of components + snapshot) | 0 |
| any byte-consumer (visual or audio) recomputes | exactly 1 |
| any attempt, any mix | ≤ 1 |

## The three components (evidence only)

Frozen numeric authority: `worker/analysis_rules_v1.json`
(`analysis-rules-1`); its canonical digest (boundsSha256) is an input to every
componentDigest, so any rule change changes cache identity and must ship with
an analyzer version bump.

* **visual (`visual-1`, cap 262144 B)** — OpenCV bridge (`editor_visual.py`)
  over the verified bytes: coarse motion curve (interval
  `max(2000, roundUpTo(ceil(durationMs/900), 500))` ms, ≤900 samples,
  meanAbsLumaDiff/255 at 160×90 gray), shot-boundary CANDIDATES (threshold
  0.30, ≤360 bounded fine samples, merged within 500 ms, ≤240 kept), and
  YuNet face detections in DISPLAY-SPACE coordinates (letterboxed 320 input,
  score 0.60, NMS 0.30, top-K 20, ≤120 sample points). The pinned .onnx is
  COMMITTED at `worker/models/face_detection_yunet_2023mar.onnx` and
  digest-verified against `worker/models/vision.manifest.json` before every
  load (fail closed, `model_pin_failed`). Naming rule: `face*`, never
  `subject*`; no `safeZoomWindows`/`cleanupRecommendations` — evidence only.
* **audio (`audio-1`, cap 65536 B)** — ONE deterministic PCM decode
  (ffmpeg → s16le, 48 kHz, explicit mono downmix), then everything is
  computed IN CODE over exact 4800-sample windows: exact
  `clippedSampleCount` (every sample with |s/32768| ≥ 0.9995; the trailing
  partial window counts for clipping but not window stats), noise floor
  (5th-percentile window dB, nearest-lower rank), median speech-window dB
  (speech-word windows from the SPEECH component — no new VAD dependency),
  SNR = median − floor, room tone (≥800 ms word-free runs within +3 dB of the
  floor, top 120), early (0–3000 ms) vs whole RMS and
  `earlyEnergyRatio = clamp(10^((early−whole)/20), 0, 4)`. ebur128
  (LUFS / LRA / true peak) is a SEPARATE ffmpeg pass. No astats/filter
  statistic ever stands in for a frozen threshold. No audio track ⇒ nulls,
  `clippedSampleCount 0`, `roomTone []`.
* **hook (`hook-1`, cap 16384 B)** — a PURE function of the speech component,
  the audio component and the PINNED script snapshot (never a live generation
  read): the spoken opening window (words with startMs < 3000), token-overlap
  alignment vs the snapshot hook line, and the early-energy evidence, bound to
  the snapshot by its sha.

Payload caps fail LOUD (`*_component_too_large`) — evidence is never truncated
to fit. Strict version consumption: `analyzing` loads inspection and speech at
EXACTLY the versions the pinned manifest names (`loadComponentStrict`, filtered
to legacy rows); there is NO earlier-version fallback.

## Cancellation and teardown

Every new subprocess (visual bridge, PCM decode, ebur128) runs detached in its
own process group under the shared `runGroupProcess` (hard timeout +
cooperative-abort group kill). The analyzing stage checks the cancellation
watch at every boundary (`AnalyzeCancelledError` settles the project
`cancelled`). Scratch teardown failures are NEVER masked: the finally path
events `teardown_failed` (best-effort) and the age-based orphan sweep
backstops the disk.

## Event codes (Phase 6)

`manifest_pinned`, `analysis_component_recorded`, `analysis_component_reused`,
`analysis_failed` (its `details.code` names the specific failure, e.g. the
established integrity code `source_bytes_changed`), `teardown_failed`,
`manifest_mismatch` — plus `source_downloads` and the per-component
recorded/reused summary on the `project_completed` details.

## Activation safety (unchanged posture)

`EDITOR_V2_START_ENABLED` stays unset in production (missing = off, exact 503
`editor_not_available`). There is deliberately still NO web caller of
start-editor-v2 and NO `completed ⇒ output_asset_id NOT NULL` constraint (it
would be violated by every scaffold completion; it lands WITH the real
renderer). The production gate run 29829091202 is historical evidence only —
any future enablement requires a fresh flag/code probe and zero-delta bracket
at rollout time. `scripts/ci/check_activation_gate.mjs` guards these decidable
facts with hostile selftests.

## Supply chain

`worker/models/vision.manifest.json` + `worker/licenses.lock.json` pin the
exact YuNet artifact (opencv_zoo @ `47534e27…`, sha256 `8f2383e4…`, MIT), the
exact `opencv-python-headless==4.10.0.84` wheel sha256 (MIT wrapper,
Apache-2.0 OpenCV, LGPL-2.1 bundled FFmpeg), alongside the existing pinned
Faster-Whisper snapshot. The SBOM CI step regenerates and compares dependency
inventories; CI never commits generated SBOMs.

Related: `editor-v2-worker-orchestration.md`, `editor-v2-media-inspection.md`
(Phase 4), `editor-v2-speech-analysis.md` (Phase 5).
