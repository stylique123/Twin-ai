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

---

## 7. Build status (this exit correction — what actually shipped)

Delivered on the exit-correction line (backup-19 → backup-23), each batch
verified locally and pushed:

- **Adversarial-review fixes** (b19): the critical `0091` pgcrypto `digest()`
  search-path bug (would have failed migration-apply / every capture RPC on
  Supabase) + four honesty/robustness fixes; the local Gate-D harness was
  hardened (pgcrypto now installed in `extensions`, mutation control `q1`) so it
  can no longer mask that class.
- **§3.5 envelope** (b20): the bounded `visualWaste` stream + selection-safety
  validator; byte budget re-frozen (`EXPECTED_MAX_COMPAT_ENVELOPE_BYTES = 563730`,
  `ANALYTIC_MAX_UPSTREAM_ENVELOPE_BYTES = 752587`).
- **§3.6 Decision v2** (b21): full choice set — speech + visual-waste removals,
  `captionPresetId`, `zoomRequests`, `transitionPolicy`, all bound to the frozen
  `editor/catalogs.ts`; server re-resolution + stable rejection codes; provider
  schema updated; shared↔worker byte-parity.
- **§3.5 runtime wiring** (b22): the directing stage loads the pinned
  visual/audio/hook components and populates the real bounded `summaries`
  (brand/visual/audio/hook/catalogs/features) + the `visualWaste` stream from the
  visual component's corroborated dead-air intervals.
- **§4 DB validation** (b23): migration `0092` — a `BEFORE INSERT/UPDATE` trigger
  on `edit_director_decisions` that independently re-rejects filler removals,
  non-dead_air visual-waste, and off-catalog enums; proven by Gate-E.

**Recorded encoding choices** (§6 permits them): visual-waste removals are a
separate typed index array (`visualWasteSelections`) rather than a tagged
`removals[{source}]` union; `music` stays a bounded enum (no licensed-track
catalog this epoch); hook stays word-anchored (`hookTreatment` +
`hookStartWordIndex`) rather than boundary-anchored. All are equally
fabrication-proof (each re-resolves against the immutable envelope).

### 7.1 Second review round (adversarial re-review of the exit correction)

The exit correction above was then re-reviewed adversarially (four parallel
auditors over the decision, completion, brand and gate seams, each finding
independently verified before acceptance). **13 findings were confirmed** — the
three most serious of which were introduced or left standing BY the exit
correction itself — and all were fixed on the same line (backup-29 → backup-30):

- **Pin freeze only held within one attempt** (HIGH). The boot manifest was
  recomputed from LIVE inputs on every attempt, so a mid-project brand edit (or
  logo re-upload, or a legacy source's script edit, or a transient ffmpeg banner
  probe failure) turned ANY retry into a permanent `manifest_mismatch`. The pin
  now REUSES the stored manifest+snapshot on resume, self-integrity-checked
  against their pinned SHAs, asserting byte-identity only for the
  worker-identity sections (`assertPinnedWorkerIdentity`) — versions are still
  never mixed, but user-mutable inputs never re-enter a running edit.
- **Atomic RPC vs capture tolerance** (HIGH). `editor_validate_source`
  re-validated the RAW intent windows with ZERO tolerance while the worker
  normalizes with the frozen 750ms recorder-clock tolerance — so a routine
  teleprompter take in the 1–750ms drift band would crash-loop to dead-letter
  and strand the asset in `validating` forever. The RPC now allows the intent
  the frozen tolerance and STRICTLY checks the NORMALIZED manifest windows.
- **The DB gates never ran in CI** (HIGH) — Gate-D/Gate-E were local-only
  scripts. A new `db-gates` PR job runs both on ephemeral PostgreSQL.
- **No output-token bound** (major). A contract-legal decision could not fit the
  provider's output budget, and truncation is permanent (no retry by design).
  `selections` is now a bare index array (per-selection `reason` dropped — it was
  discarded at re-resolution anyway), `keptBoundaries` is bounded, the budget is
  raised, and a test RECOMPUTES the worst-case response bytes from the frozen
  caps and asserts the fit. The PERSISTED decision shape is unchanged.
- **Silent-drift channels** (major): the Gemini-facing `RESPONSE_SCHEMA` was
  unpinned (now dialect-normalized-pinned to `directorResponseSchema()`), the
  parity test never covered the Decision-v2 half (now covers every v2 constant,
  catalog and behavior), and `count_tokens.mjs` had drifted to the pre-visualWaste
  envelope while self-checking against its own stale constant (re-frozen).
- **Five swallowed-error paths** (medium) where a transient DB/storage blip
  became a PERMANENT wrong outcome — false `ownership_mismatch` rejection, false
  `object_missing` rejection, a job settled "rejected" with the asset actually
  left `validating`, a metadata replace erasing the finalize integrity
  references, and an unretried heal — all now fail loud and retry.
- Minors: `configSha256` now covers the complete generation config actually sent;
  `0092` requires the embedded `schemaVersion` and that it agrees with the
  column; Gate-D's schema subset now mirrors the real `storage_path UNIQUE`,
  manifest hex CHECKs and re-validation version-bump rule.

The staging workflow now **applies the repo migrations to staging and asserts
remote/local migration parity before the matrix**, so "run with `0091`/`0092`
actually applied" is enforced by the harness rather than assumed, and a missing
`GEMINI_API_KEY` fails in seconds instead of 40 minutes in.

**Zero-delta held**: migrations `0091`/`0092` remain UNAPPLIED on staging and
production; PR #200 carries the diff for review (superseding #199's candidate);
no `edit_plans`, output assets, or Edit CTA; compiling/rendering/validating still
simulated; the directing stage remains flag-gated (`EDITOR_DIRECTOR_ENABLED`
unset ⇒ simulated).

**Remaining operator-verified step** (outside the sandbox): one dispatch of the
staging workflow for the exact-head Phase 1–7 regression — it now applies
`0091`/`0092` itself and asserts parity — before any production enablement. The
in-sandbox substitutes are the Gate-D/Gate-E harnesses (now also in CI), the
shared/worker unit + parity suites, and the token-evidence gate.

### 7.2 Third review round (the exit correction's own fixes, re-reviewed)

Round 2's fixes were themselves put through a final adversarial pass. **Eight
findings; six were defects, two were accuracy problems.** Two of the six were in
the round-2 pin-resume fix — the fix solved half the problem it claimed to:

- **The pin was read AFTER the live inputs it was meant to make irrelevant**
  (medium-high). `pinManifest` resolved the brand snapshot and the boot script
  snapshot BEFORE calling `reuseStoredPin`, so a live input that had become
  *unresolvable* (a deleted brand row; a legacy generation whose `scene_timeline`
  had grown past `script_snapshot_too_large`) still failed a project that was
  perfectly resumable from its frozen pin. Round 2 stopped comparing live inputs;
  it did not stop *resolving* them. The stored pin is now read FIRST, via an
  identity-only manifest — `brandSnapshot` is not a worker-identity key, so a
  placeholder brand is sufficient to verify the pin, and the STORED brand is what
  the edit proceeds on.
- **ffmpeg leniency was one-directional** (medium-high). Round 2 skipped the
  banner comparison when the LOCAL probe returned null, but not when the STORED
  one was null. `ffmpegBannerSha256` caches its result for the whole process
  lifetime, so a single probe blip at PIN time freezes `null` into the manifest,
  and every later attempt on the identical build hits a permanent
  `manifest_mismatch` it can never clear. The comparison now requires BOTH
  banners to have resolved; only two resolved, disagreeing banners prove the
  build actually moved.
- **The resume path was fence-free and invisible** (low). The first-pin path goes
  through `editor_pin_manifest`, which asserts the lease and leaves a history
  marker; the reuse path returned early and did neither. It now appends a
  `manifest_pin_reused` event — `editor_append_event` asserts the same lease, so
  this restores the fence and the audit trail in one call.
- **`reject()` could not see a zero-row update** (low). The status-guarded write
  reported success whether or not it matched a row, so a job could settle
  `rejected` while the asset said otherwise. It now selects its rows back and
  re-reads on zero: already-`rejected` settles (idempotent), anything else throws.
- **`headObject` treated HTTP 400 as proven-absent** (low). ~~400 is also what the
  storage API returns for a malformed request, and a HEAD carries no body to tell
  them apart — while the caller turns `null` into a PERMANENT `object_missing`
  rejection. Only 404 now proves absence; every other failure is unverified and
  retries.~~ **REVERTED — this "fix" was wrong and staging proved it** (see §7.3).
  Supabase Storage answers a missing key on HEAD with **400**, not 404. With 400
  excluded, a genuinely vanished object stopped being rejected and instead retried
  to `failed/retries_exhausted` — a hung job, and a worse outcome for the user than
  the clean `object_missing` verdict. The finding was reasoning about an API's
  behaviour without evidence; the behaviour is now pinned by Phase-4 F9.
- **The client-side read-modify-write in `reject()`** (low) contradicts `0084`'s
  DB-merge principle. Reviewed and kept, with the reasoning written down: the
  write is guarded on `status = 'validating'` and this worker holds the asset's
  job lease, so no second writer can be merging concurrently — and the
  compare-and-set above turns any violation of that assumption into a loud
  failure rather than a lost write.

The two accuracy problems: the Director contract doc still specified
`selections[]` as `{candidateIndex}` objects with an optional `reason` (round 2
had changed the wire to a bare index array), and the output-budget test claimed
to build "the worst LEGAL decision" when it in fact builds an **upper bound** —
the index generator repeats values, which the validator rejects as duplicates.
Both corrected in place; the test now also records that it is the ONLY
enforcement of `MAX_DECISION_OUTPUT_BYTES`, which has no runtime check.

**Verified on this head**: shared 228, worker 198, all typechecks, Gate-D PASS,
Gate-E PASS.

### 7.3 Staging round (what only real infrastructure could find)

PR #200 merged as `16f33ac` after three review rounds. The staging Phase 1–7
matrix then ran against the merged head for the first time and found **four more
defects** — none of which any unit test or Gate-D run could have caught, and one
of which was introduced by the fix for the previous one. This section records them
because the pattern matters more than the individual bugs.

- **Retention could not delete a recording** (the serious one).
  `source_capture_intents.generation_id` is `references generations(id) ON DELETE
  SET NULL`. Postgres implements SET NULL as an **UPDATE** on the child row, and
  `editor_capture_no_mutate` refused every UPDATE at any trigger depth. Deleting a
  generation therefore raised `capture_row_immutable` and rolled the whole
  transaction back — permanently, for any source carrying a capture intent, i.e.
  **every teleprompter recording**. A retention sweep or a plain "delete this
  recording" would have failed, and data a user asked to be rid of would have been
  undeletable. (Account erasure was unaffected: `auth.users` is ON DELETE CASCADE,
  which `0091` §1b already permitted.) Fixed in `0093`: at depth > 1 a cascade
  DELETE is permitted, and an UPDATE is permitted **only** when the row differs
  solely by `generation_id` becoming NULL. A directly-issued statement is still
  refused for both, service_role included.

- **Absent-table drift was classified as transient.** `resolveBrandSnapshot` had a
  `brand_schema_drift` permanent classification, but its pattern matched only a
  missing COLUMN. PostgREST reports a missing TABLE as "Could not find the table …
  in the schema cache" (PGRST205), which matched nothing, so the job retried until
  the harness gave up. In production a bad deploy or a stale schema cache would
  have every editor job retry-storming to dead-letter with the real cause buried.
  Now a pure exported `brandReadDrift()` covering both, with a test that also pins
  five genuinely transient wordings as NOT drift — misclassifying is expensive in
  both directions.

- **Staging could not exercise the brand pin at all.** The staging project is a
  purpose-built editor-only test bed (17 tables; no `profiles`, no brand tables).
  Correct until the exit correction made the Boot Manifest pin brand snapshot
  CONTENT, after which every `editor_v2` job reads `brand_voices`. Added a
  staging-only fixture deliberately OUTSIDE `supabase/migrations/`, mirroring only
  the columns `resolveBrandSnapshot` reads, with an up-front CI assertion.

- **The fix for the first defect broke the integrity definition** — caused by
  `0093`, not pre-existing. Once retention worked, it produced a state that had
  never existed: the live pointers are cleared while the immutable records keep
  their original id (the intent JSON cannot be rewritten — `intent_sha256` covers
  those bytes). **Two** of `editor_backfill_capture_marker`'s checks called that
  difference corruption; fixing only the one that fired would have moved the
  failure to the other. Both now follow one rule: a NULL live pointer PROVES
  retention ran (only an FK action can produce it, since `0093` still refuses a
  direct SET NULL), so the historical record is unconstrained there; two NON-NULL
  ids that disagree remain corrupt.

  The first attempt at this fix shipped as a follow-up migration `0094` and was
  **wrong**: `0091` defines that function, CALLS it, and DROPS it in the same file,
  so a later migration arrives after the failure and would resurrect a one-time
  helper. `0094` was deleted and the comparisons folded into `0091` itself — safe
  because production has none of `0090`–`0093` applied and staging re-applies every
  migration byte-exactly on every run.

**Why the gates were green through all of this.** Gate-D carried a hand-written
copy of `editor_capture_no_mutate` commented "matches 0091's forward-corrected
function" — a mirror that had drifted in the direction that HID the bug. And its
schema subset declared BOTH `source_capture_intents.generation_id` and
`media_assets.generation_id` as bare `uuid`s, with no foreign key, so the
referential actions that break simply never fired. The same omission produced a
false PASS in one place and later a false FAIL in another.

Structural fixes, so this class cannot recur: the hand-written mirror is **deleted**
(the harness extracts the authoritative body from the migration, with a guard that
fails loudly if the retention-aware comparisons disappear), both FKs are declared
with their real referential actions, the retention section now calls
`editor_backfill_capture_marker()` **after** the deletion, and two new mutation
controls — `(r)` and `(r2)` — restore the pre-fix bodies and assert the gate FAILS.
Both verified to have teeth.

**The lesson for the rollout sequence.** Four defects survived three adversarial
review rounds, a full unit suite, and a green Gate-D; every one of them needed real
infrastructure to surface, and the last needed the previous fix to exist first.
Production apply, worker deploy and the `EDITOR_DIRECTOR_ENABLED` flip stay three
separate decisions with verification between them — not one batch.

**Fifth defect (mine, from the review round rather than the build).** Phase 4 came
back 56 passed / 1 failed: `F9 vanished storage object fails as object_missing —
failed/retries_exhausted`. The third review round had narrowed `headObject` to treat
only 404 as proven-absent, arguing that 400 might be a malformed request and that
accepting it could permanently reject a healthy recording. That argument was made
from first principles about an API whose actual behaviour nobody had checked —
Supabase Storage answers a missing key on HEAD with **400**. The result was the
opposite of the intent: instead of protecting a healthy recording, it left a
genuinely vanished one retrying to exhaustion, giving the user a hung job instead of
a clean rejection. Reverted, with the empirical fact recorded at the call site.

The residual ambiguity is real but bounded by construction: bucket and path come
from the asset row rather than user input, so a 400 here means the key is gone. If
it ever needs removing rather than bounding, the mechanism is a 1-byte ranged GET,
which returns a body the HEAD does not. That was deliberately NOT attempted in this
batch: it cannot be verified from the sandbox, and an unverified guess is exactly
what caused this failure.
