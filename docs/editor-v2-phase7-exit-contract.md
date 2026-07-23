# Editor v2 — Phase 7 Exit Contract (Gate 0)

**Authority:** the TwinAI One-Click Editor Build Constitution (Sections 1–15).
This document is the **Gate 0** for the Phase 7 *exit correction* — it extracts
and freezes, against the audited head, exactly the contracts, constants,
migrations, gates, and zero-delta boundary this one batch implements. It adds no
new design; where it must choose an encoding it records the choice and its
reason. Base head: `24c57cc` (branch `rebuild/editor-v2-phase7`, draft PR #199).

The goal of the exit correction: **accept the existing one-call Director
infrastructure only after its envelope/decision is sufficient for the final
editor** — plus close the source-provenance defect (§4.1) so the recorder's
accepted takes reach the worker as durable truth. Compiling / rendering /
validating stay **simulated**; production stays **disabled**.

---

## 1. User outcome & explicit non-goals

**Outcome (this batch):** every teleprompter recording carries its *accepted*
scene windows to the worker as an immutable, server-normalized Capture Manifest;
every uploaded source is explicitly marked inference-origin; the Director sees a
complete bounded picture (capture, brand, actual speech/visual/audio/hook) and
returns one bounded creative Decision v2 sufficient to compile the entire final
EditPlan **without a second AI call**.

**Non-goals (forbidden in this batch):** no compiler, renderer, validator, or
output; no `edit_plans` rows; no output/cover assets; no Edit CTA / UI
activation; no production enablement; no second source path / bucket / editor
loop; no filler auto-removal; no threshold weakening; no Phase 8 work.

---

## 2. Zero-delta boundary (asserted, must stay true)

At the end of this batch, on staging and in code:

- `edit_plans` count for every exercised project **= 0**.
- output `media_assets` (`kind in ('output','thumbnail')`) created **= 0**.
- `edit_projects.output_asset_id` **IS NULL** on every completed project.
- credits/reservations **unchanged** vs. pre-batch accounting.
- `compiling` / `rendering` / `validating` remain **simulated** (`runSimulatedStage`).
- No web Edit CTA is wired; `EDITOR_V2_START_ENABLED` unset in production; the
  Director runs real only under the per-worker `EDITOR_DIRECTOR_ENABLED` flag the
  staging harness sets (never a production secret).
- PR #199 stays **draft**; production project `jmdecibuytznsonrasxw` untouched;
  migrations applied to **staging** (`otgzjsagybpgtwweuptj`) only.

---

## 3. Frozen contracts

### 3.1 Source Capture Intent / Manifest (shared `editor/capture.ts`, migration 0090)

Two documents, both immutable, distinct roles:

- **`SourceCaptureIntentV1`** — what the browser asserted, written **append-only**
  in the same server transaction that creates/binds the idempotent source-upload
  attempt (edge fn `source-asset` `create`). Never downstream authority.
- **`SourceCaptureManifestV1`** — the server-normalized truth, written **once**
  by `validate_source` after ffprobe, before the source asset becomes `ready`.

Encodings (chosen, grounded in the recorder & schema maps):

| Field | Encoding / rule |
| --- | --- |
| `origin` | `'teleprompter' \| 'upload'` |
| times | **integer milliseconds** (recorder stores active-recording seconds → convert `round(sec*1000)`) |
| `sceneNumber` | the pinned `RecordingScene.scene_number` (1-based, contiguous). Recorder binds accepted-window index `i` → `teleprompterScenes(timeline)[i].scene_number` (filtered scenes; index ≠ scene_number). |
| `intendedDialogueSha256` | `sha256Hex(canonicalDialogue)` where `canonicalDialogue` = NFC-normalized `scene.dialogue ?? ''` (never the caption fallback; never trimmed to a different string than hashed) |
| `recordingScriptSha256` | teleprompter: shared canonical script SHA computed client-side, byte-identical to the worker's `buildScriptSnapshot` canonicalization; upload: `null` |
| `recorderClock` | `'mediarecorder-active-time-ms'` (teleprompter) / `'none'` (upload) |
| `recordedAt` | assigned by the **server**, never accepted from the client |

Rules (fail-closed, stable codes):

- `origin='teleprompter'` ⇒ `recordingScriptSha256` non-null **and** ≥1 accepted
  segment; segments strictly ordered, non-overlapping, positive length, unique
  `sceneNumber`.
- `origin='upload'` ⇒ `acceptedSegments = []` (any segment ⇒ reject malformed).
- The manifest re-checks every segment against **measured** `sourceDurationMs`
  with a small terminal tolerance (**750 ms**, policy v1); out of bounds ⇒
  `capture_manifest_out_of_bounds` (never silently clamped); overlap ⇒
  `capture_manifest_overlap`; below `250 ms` min segment ⇒ reject.
- A teleprompter source with a **missing/invalid** manifest is
  `editor_eligible=false` with a stable code; it must **never** be recast as
  upload inference.
- `manifestSha256` = canonical SHA over the normalized manifest; `intentSha256`
  binds the manifest to its raw intent.

Seam (single source path, extended not replaced): `V2Capture` (record + upload) →
shared `createSourceUpload` body (add `origin`, `recording_script_sha256`,
`accepted_segments`) → edge `source-asset` `create` insert (persist raw intent) →
`validateSource.ts` (normalize against `verdict.durationMs`, write manifest via
the `editor_complete_validation` transaction) → `editor_link_ready_source`.

### 3.2 Boot Manifest v2 (worker `editorManifest.ts`, shared `contracts.ts`)

Bump `PIPELINE_EPOCH` **1 → 2** (reconciles the boot manifest with the envelope,
which already requires `PIPELINE_EPOCH_V2 = 2`). Add to the pinned manifest:

- `features` — the frozen `EditorFeatureFlags` (`autoFillerRemoval: false`).
- `brandSnapshotSha` — SHA of the bounded Brand snapshot (§3.3).
- `captureManifestSha` — the source's `SourceCaptureManifestV1.manifestSha256`.

No stage rereads live generation / script / brand / feature settings after the
manifest is pinned (set-once, immutable trigger). Changing manifest shape changes
its SHA; Phase 6 harness manifest expectations are updated to the v2 shape (not
weakened).

### 3.3 Bounded Brand snapshot (shared `editor/brandSnapshot.ts`)

`EditorBrandSnapshotV1` — a normalized projection of `brand_voices.profile` +
Brand Kit into bounded enums/colors/preset-ids (never raw brand JSON downstream).
Free text length/element-bounded and NFC-normalized; colors validated hex; caption
preset id from the frozen catalog; unknown text → `balanced`/clean defaults.

### 3.4 Visual component v2 (worker `editorVisual.ts` + `editor_visual.py`)

Bump `VISUAL_ANALYSIS_VERSION` `'visual-1' → 'visual-2'` (changes the component
digest via `componentDigest`). Add, under the new version, **per-coarse-sample
mean luma** (`np.mean(smallGray)/255`) and **merged near-black / frozen interval
candidates** with bounded evidence. Rules gain luma/black thresholds in
`analysis_rules_v1.json` (auto-enter the digest via `visualEffectiveConfig`).

Safety (independent evidence agreement — never dark-alone authority): a
`visual_waste` candidate is `safeToConsider=true` **only** when a near-black /
frozen interval overlaps **no protected words**, **VAD non-speech**, **no
protected capture boundary**, and meets minimum duration. Dark footage containing
speech is retained (candidate non-selectable).

### 3.5 Complete Director envelope (shared + worker `directorContract.ts`)

Replace runtime `summaries: {}` with a **bounded** `summaries` sub-shape
(≤ `MAX_SUMMARY_BYTES = 16384`, already reserved in the analytic bound):

```
summaries: {
  capture: { origin, segments:[{sceneNumber,sourceStartMs,sourceEndMs}]|[] },
  brand:   EditorBrandSnapshotV1 (bounded),
  visual:  { shotCount, motionSummary, blankIntervals:[{startMs,endMs,class}], faceCoverage },
  audio:   { integratedLufs, truePeakDbtp, noiseFloorDb, snrDb, earlyEnergyRatio, roomToneCount },
  hook:    { spokenOpening:{wordCount,firstWordStartMs}, matchedTokenRatio|null },
  catalogs:{ captionPresets:[...], zoomReasons:[...], musicMoods:[...], transitions:[...], outputProfileId },
  features:{ autoFillerRemoval:false },
}
```

Add a **visual-waste candidate stream** to the envelope (new field
`visualWaste: EnvVisualWaste[]`, tuple `[startCs, endCs, classCode, selectionEnabled]`)
so Decision v2 `removals[].source='visual_waste'` can reference server-issued
indices. The model still receives no credentials, paths, tokens, URLs, or
executable strings.

Byte budget: `summaries` becoming populated is already reserved
(`MAX_SUMMARY_BYTES`); the new `visualWaste` stream adds a **bounded** term to
`ANALYTIC_MAX_UPSTREAM_ENVELOPE_BYTES` (cap `MAX_VISUAL_WASTE` × per-tuple max
bytes) and re-freezes `EXPECTED_MAX_COMPAT_ENVELOPE_BYTES` from the real
serializer (byte-equality test). `count_tokens.mjs --selftest` re-derived, never
loosened past `DIRECTOR_INPUT_MAX_BYTES ≤ PROVIDER_TOKEN_CEILING`.

### 3.6 Director Decision v2 (shared + worker; migration 0091; provider schema ×2)

`DIRECTOR_DECISION_SCHEMA_VERSION` **1 → 2**. Provider returns only indices +
bounded enums (per Constitution §5.5): `removals[{source,candidateIndex}]`,
`keptBoundaryIndexes`, `pacing`, `hook{treatment,boundaryIndex}`,
`emphasisWordIndexes`, `captionPresetId`, `zoomRequests[{anchorWordIndex,
intensity,reasonCode}]`, `transitionPolicy`, `music{mode,energy,moodId}`.

Server re-resolution (TS `validateDirectorDecisionV2`) + DB (0091) independently:

- re-resolve every typed index against the immutable speech / visual-waste
  components; out-of-range ⇒ `director_decision_bad_ref`.
- reject **filler** removals at TS **and** DB (`director_decision_filler` /
  `director_filler_disabled`) while disabled.
- reject `visual_waste` removal unless the referenced candidate is
  `selectionEnabled=1` (luma + independent speech/VAD safety agreed upstream).
- reject hook treatment that would change spoken meaning / invent words;
  dedupe+bound emphasis and zoom; map every preset/mood/reason/transition to an
  allowed catalog; force `music='none'` when no eligible track (this batch has no
  catalog ⇒ always `none`).
- persist identity/spans **from the envelope**, never the model; store decision SHA.

Preserve **all** Phase 7 mechanics: one pinned provider call, ledger state machine,
no retry, no-credentials-first, cancellation windows, fenced writes, immutable
decision, stable sanitized errors, crash-window behavior. Both response-schema
literals (`directorResponseSchema()` lowercase + provider uppercase
`RESPONSE_SCHEMA`) updated in tandem; worker `directorContract.ts` kept
byte-parity with shared (`director-contract.test.ts`).

---

## 4. Migrations (this batch)

| Migration | Responsibility (only) |
| --- | --- |
| `0090_editor_capture_intent.sql` | immutable `source_capture_intents` (unique per asset/attempt) + `source_capture_manifests` (unique per asset); owner read-only RLS, service-only writes, append-only; `create`-time intent binding; atomic `validate_source` manifest writer; strict origin/script/scene/timing/hash constraints + stable errors |
| `0091_editor_director_decision_v2.sql` | Decision-v2 DB validation + feature/capability binding (filler rejected; visual-waste selectable-only; catalog-bound enums); decision remains immutable/append-only |

Every security-definer function: `set search_path = pg_catalog, public`; revoke
PUBLIC/anon/authenticated; grant only the intended service role/owner.

---

## 5. Tests & gates (this batch)

- **Shared/worker unit + property + parity**: capture canonicalization & bounds;
  brand projection; Decision-v2 re-resolution (hostile refs, filler, visual-waste
  non-selectable, catalog violations) in TS **and** mirrored constants in the
  worker parity test; envelope max-fit byte-equality + `count_tokens --selftest`.
- **`phase7.mjs`** new cases: recorder-retake fixture whose rejected read is
  **absent** from the normalized manifest & Director input; upload-origin
  inference; dark-silent vs dark-with-speech (`visual_waste` selectable vs
  protected); live script/Brand mutation immunity (pinned snapshot wins); hostile
  Decision-v2 fields; max-fit envelope; **one provider call** accounting under the
  crash/cancel truth table; all access identities.
- **Zero-delta** (§2) asserted in the harness.
- **Preserve** every existing Phase 1–7 assertion; run the full Phase 1–7
  same-head staging gate **once**.

**Stop rule (Constitution §10 / §14):** if Decision v2 cannot express every
planned EditPlan choice without a second AI call, this exit does not pass.
Maximum two correction pushes; a second distinct contract-level miss stops
implementation and returns to the lead with evidence.

---

## 6. Ownership (no second source of truth)

| Concern | Sole owner (this batch) |
| --- | --- |
| Accepted capture windows | `source_capture_intents` (raw) → `source_capture_manifests` (normalized) |
| Brand projection | `editor/brandSnapshot.ts` (bounded) |
| Pinned inputs | `edit_projects.boot_manifest` (v2) + `script_snapshot` |
| Actual evidence | immutable `media_analyses` components (speech/visual-2/audio/hook) |
| Creative choice | one `edit_director_decisions` row (Decision v2) |
| Feature permission | frozen `EDITOR_FEATURES`, enforced at projection + envelope + decision (TS) + DB |

Compiler / renderer / validator / completion remain **out of scope** (simulated),
owned by Phases 8–11.
