# Editor v2 — Phase 8 Gate 0 (FROZEN CONTRACT)

**Authority:** the authoritative Phase 8 end-to-end build/deploy plan.
**Base:** `main` = `9375ba83d96d057a9edd2b7722ac2c244bf96aed` (verified against remote, not
assumed from the plan document).
**Frozen:** 2026-07-26. Nothing in this document changes after seeing results.

Phase 8 is one vertical delivery: Decision v2 → one canonical EditPlan → one typed FFmpeg
renderer → MP4 + cover → full validation → atomic completion.

**Gate-0 prerequisites are of two kinds, and they gate different things** (CTO sequencing,
amended 2026-07-27):

- **Contract prerequisites** — §§2–9 below. All closed. These permit **isolated offline
  implementation** to begin: pure deterministic code with no stateful dependency.
- **Stateful prerequisites** — the VPS capacity inventory and the migration ledger
  reconciliation. These remain **absolute blockers** for any database/RPC work, any
  staging run, candidate acceptance, merge, and deployment.

Offline work proceeding under the contract prerequisites is **unmergeable** until both
stateful gates pass, and must then be rebased and re-proven on the exact final head.

---

## 1. Verified starting state (queried, not inferred)

| Fact | Value | How established |
|---|---|---|
| `origin/main` | `9375ba8` | `git rev-parse origin/main` |
| Deployed worker | `7d46dce`, running, **healthy, restarts 0** | `vps-diag` 2026-07-26 |
| Worker registry | `build_voice, editor_v2, ingest, scrape_dna, validate_source` | `vps-diag` |
| Production `0090`–`0093` | **NOT APPLIED** | object probes + ledger |
| Staging `0090`–`0093` | applied (see §1.1) | object probes |
| `edit_plans` table | **exists on both** | `to_regclass` |
| `0094` in either ledger | none | version + name search |
| Production active work | 0 running / 0 queued / 0 leases / 0 active projects @ `2026-07-26 21:18:28Z` | direct query |

**Production is three migrations behind the repository.** Anyone reading `main` would
conclude otherwise. The Phase 8 rollout applies **four** migrations, not one.

### 1.1 Staging parity — what is and is not proven

Semantic surface on staging matches `0090`–`0093`: 5/5 key functions, 3 policies,
3 non-internal triggers, 3 tables, RLS on all three, **zero grants to `anon`**.

`editor_backfill_capture_marker` is **absent, and that is correct** — `0091` invokes it
once and drops it in the same file. Absence is the contract, not drift.

Parity rests on a structural argument, not object counts: `staging-integration` re-applies
`0090`–`0093` **byte-exactly via `psql -f` on every run**, and the full Phase 1–7 matrix
passed on that state. Staging's objects are what the files declare because they were
installed from those files.

**OPEN — ledger repair.** `0091`–`0093` are applied to staging but absent from
`supabase_migrations.schema_migrations` (only `0090` is recorded), because CI applies them
via `psql` rather than the migration tool. Production migrations **must** go through the
normal pipeline and be recorded. `supabase migration repair` / `migration list` require a
linked project with `SUPABASE_ACCESS_TOKEN` and the DB password, which the build
environment does not hold. **Blocked on credentials — not waived.**

---

## 2. Duration contract (FROZEN)

**Editor maximum: 15 minutes** (900 000 ms), matching `WORKER_MAX_MEDIA_SECS=900`.

Today two authorities disagree by 2×, and nothing refuses the gap:

- `SOURCE_MAX_DURATION_MS` = **30 min** → `validate_source` accepts and marks `ready`
- `start-editor-v2` selects `id, owner_id, generation_id, kind, status, has_audio,
  metadata` — **no duration column, no duration check**

So a 16–30 minute source validates clean, is editor-eligible, and passes the start gate.

**Frozen resolution:**

1. Ingestion/storage keep accepting to **30 min** — a long upload is stored, not rejected.
2. Assets over **15 min** are `editor_eligible = false` with a stable reason.
3. `start-editor-v2` **independently** rejects them with `source_too_long_for_editor`.
4. Existing 15–30 min assets are **backfilled** so stale eligibility cannot bypass the rule.
5. Parity enforced across validator, database, endpoint, worker and tests.
6. Boundary fixtures at **14:59, exactly 15:00, 15:00.001, and 20:00**.

Raising the limit is a separate Gate-0 decision requiring aligned source eligibility,
worker limits, compiler limits, fixtures, storage estimates, timeout policy and a **new**
capacity run.

---

## 3. EditPlanV1 — frozen executable contract

Sections are frozen; field names may be refined during implementation but **no section may
be omitted**. Full shape as specified in the Phase 8 plan §5: `identity`, `source`,
`output`, `timeline`, `captions`, `video`, `audio`, `hook`, `cover`, `warnings`,
`complexity`.

### 3.1 Contract laws (frozen)

- Strict objects; unknown keys fail.
- **All times are integer milliseconds.**
- Identities are IDs and hashes — **never URLs or arbitrary paths**.
- **No shell or filter expression is ever stored in the plan.**
- No unbounded free text except caption text sourced from transcript words.
- Every array has a frozen maximum.
- Canonical serialization recursively sorts object keys, preserves array order.
- The hash excludes no semantic field.
- Identical inputs → byte-identical JSON and hash **in separate processes**.
- **Plan maximum serialized size: 1 MiB** for the 15-minute maximum.
- Compilation is `O(words + candidates + segments + cues)` — no unbounded pairwise search.

### 3.2 The single-owner rule

The renderer consumes **only** a validated EditPlan and verified local asset files. It
never reads raw Director JSON, live brand settings, live scripts, browser state, or
unpinned analysis. There is no Decision → FFmpeg path.

---

## 4. Policy constants (FROZEN before implementation)

| Constant | Value |
|---|---|
| Output profile | `vertical-social-1080x1920-h264-aac-v1` |
| Dimensions / fps | 1080×1920, 30/1 CFR |
| Codecs | `libx264` / `aac`, `yuv420p`, 48 kHz stereo, fast-start |
| Target integrated loudness | **−14 LUFS ± 1** |
| True-peak ceiling | **−1.0 dBTP** |
| Audio presets | `speech-clean-v1`, `speech-noisy-v1`, `speech-roomy-v1` |
| Max zooms per video | **20** |
| Transitions | `hard_cuts_only` — **the only policy the plan contract accepts.** See §4.1 |
| Caption emphasis | rendered ONLY from the closed ASS tag catalog in §4.2 |
| Filler auto-removal | **OFF — structurally rejected at compiler AND database** |
| Music | only from a production-approved licensed catalog row; no eligible track ⇒ `music = null` + warning (a success, not a failure) |
| Expected-duration tolerance | **± 250 ms** |

### 4.1 Amendment A1 — `restrained` leaves the accepted plan contract

**Why this amendment exists.** Correcting Batch 8.1 surfaced two places where the
frozen contract contradicted itself. Under the stop rule the contract is updated
ONCE and implementation restarts from it, rather than each contradiction being
patched in code where it would become permanent.

The original wording admitted `restrained` as an accepted `transitionPolicy`.
`TRANSITION_POLICIES` listed it, the compiler emitted plans carrying it, and the
Gate-0 fixture *defaulted* to it — while `buildFfmpegGraph` rejected it, correctly,
because no crossfade is implemented. So the contract called a plan valid that the
renderer could not render.

Of the two available resolutions, implementing a crossfade now is the wrong one:
it would add unproven render behaviour to a batch that already has six defects,
and transitions belong to a later batch. **Expressible-but-unrenderable is the
worse of the two states**, so the resolution is to narrow the contract:

- `TRANSITION_POLICIES = ['hard_cuts_only']`. `restrained` is REJECTED at
  validation, not at render time.
- `timeline.segments[].transitionInOverlapMs` MUST be `0` for every segment.
- The policy file keeps its `transitions` block for the owning batch to restore,
  but nothing may read `restrainedOverlapMs` while this amendment stands.
- Restoring `restrained` is a Gate-0 decision that requires a rendered,
  frame-inspected crossfade — not a validator change.

### 4.2 Amendment A2 — the closed ASS emphasis tag catalog

Caption emphasis was unrenderable by construction, not merely unimplemented.
Emphasis in ASS requires an override tag (`{\b1}`), and `assertNoOverrideBlock`
rejected EVERY override block in the document. Both halves were deliberate: the
guard exists because transcript text reaching an override tag is a subtitle
injection. Removing the guard to allow emphasis would trade a missing feature for
a security defect.

The resolution keeps the guard and gives the renderer a closed vocabulary:

- **`ASS_EMPHASIS_TAGS`** is a FROZEN catalog: `{\b1}` and `{\b0}` only. No
  colour, no font, no position, no transform, no karaoke, no drawing mode.
- Only `renderAssDocument` may emit them, only immediately around a word whose
  index appears in that cue's `emphasisWordIndices`, and always in balanced
  `{\b1}`…`{\b0}` pairs.
- `escapeAssText` is unchanged: every brace originating in transcript text is
  still escaped before this stage, so a word literally spelled `{\b1}` cannot
  produce a tag.
- `assertNoOverrideBlock` becomes `assertOnlyCatalogOverrides`: any override block
  that is not exactly a catalog member fails `render_font_integrity_failed`, and
  the count of emitted tags must equal twice the number of emphasised words —
  so an unbalanced or injected tag fails closed.

**Ownership is unchanged by this amendment.** One caption renderer, one escape
function, one guard. No second styling path is introduced.

---

## 5. Stable error catalog (FROZEN)

**Permanent:** `edit_plan_identity_mismatch`, `edit_plan_invalid`, `edit_plan_too_large`,
`edit_plan_divergent`, `edit_plan_unsafe_cut`, `edit_plan_filler_disabled`,
`edit_plan_no_kept_media`, `render_asset_integrity_failed`, `render_font_integrity_failed`,
`render_music_license_invalid`, `render_graph_invalid`, `render_output_profile_invalid`,
`output_decode_failed`, `output_duration_mismatch`, `output_stream_mismatch`,
`output_audio_invalid`, `output_caption_invalid`, `output_cover_invalid`,
`output_completion_conflict`, plus **`source_too_long_for_editor`** (§2).

**Retryable:** storage transient, output-upload transient, database/network transient,
FFmpeg process-infrastructure failure with the plan still valid, low temporary disk after
cleanup, worker termination.

**Cancellation** is not failure: kill the process group, remove partial local files, never
publish pointers, retain immutable plan/analysis for audit.

All persisted errors pass the existing sanitizer. **No raw stderr, signed URLs, service
keys, local temp paths or provider prompts are ever persisted.**

---

## 6. Database and RPC ownership (FROZEN)

Migration **`0094_editor_editplan_render_completion.sql`** — confirmed free in both ledgers
by version *and* name (the ledger uses timestamp versions, so a version-number lookup alone
would have been the wrong check).

| Concern | Sole authority |
|---|---|
| Plan persistence | `editor_record_edit_plan(...)` — fenced, re-proves lease/attempt/stage |
| Plan immutability | trigger; rejects UPDATE for **every** role including `service_role` |
| Output path reservation | fenced RPC; **server-derived paths only**, never client/model text |
| Completion | `editor_complete_output(...)` — the **only** path to `completed` |

`completed` with a null or non-ready output must be **impossible**, not merely unused.
Client roles get RLS-scoped `SELECT` only; `anon` gets nothing. **No billing change in
Phase 8** — credits and reservations stay untouched until a separately frozen contract.

---

## 7. File ownership (FROZEN)

| File | Sole responsibility |
|---|---|
| `worker/src/jobs/editorCompile.ts` | pure Decision + evidence → EditPlan |
| `worker/src/jobs/editPlanContract.ts` | strict validator + canonicalization |
| `worker/src/jobs/editorRender.ts` | render lifecycle orchestration |
| `worker/src/jobs/ffmpegGraph.ts` | typed plan → graph/argument AST |
| `worker/src/jobs/assCaptions.ts` | plan cues → ASS bytes |
| `worker/src/jobs/editorValidateOutput.ts` | output + cover validation |
| `worker/src/jobs/editorComplete.ts` | fenced persistence/completion calls |
| `worker/edit_policy_v1.json` | frozen numeric policy authority |
| `worker/render_catalog_v1.json` | profiles/presets/fonts — no secrets |
| `scripts/staging-integration/phase8.mjs` | real Phase 8 matrix |
| `scripts/db-tests/gate-f/*` | plan/output SQL hostile gate |

---

## 8. Non-vacuous fixture matrix (FROZEN)

Every hostile, retry, cache, cancellation or failure fixture must:

1. assert the preconditions that distinguish the target branch;
2. record a stable branch/evidence marker from the system under test;
3. invoke the **production** boundary;
4. assert the exact stable code **and** all expected row/object/call deltas;
5. run a **mutation control** proving the scenario fails when the guard is removed;
6. fail if any setup/mutation/upload/cancel/crash/cleanup helper did not complete;
7. **never infer branch coverage from a final project status alone.**

### 8.1 Why this rule exists

The Phase-7 round produced six findings. Five were real defects, three of those were
introduced by fixes made during review, and **none were reachable by unit tests**. Gate-D
stayed green throughout until it was made faithful to the real schema — a subset that
omitted two foreign keys produced both a false PASS and a false FAIL in one evening.

Separately, a Phase-6 assertion had **silently stopped testing anything**: it fed a huge
generation to an `origin='upload'` source, which can never be oversize, so the project
simply completed and the guard never fired. It passed for weeks.

Most recently, a hostile case written for the VPS inventory validator was itself vacuous —
it "substituted" an identical body, so the hash legitimately matched. Its own selftest
caught it. **A test that cannot fail is worse than no test**, and every guard therefore
requires a mutation control.

---

## 9. Render capacity thresholds (FROZEN BEFORE MEASUREMENT)

Taken from the Phase 8 plan as the starting contract. **These are frozen now, before any
render benchmark exists.** Hardware inventory may determine whether the VPS is *viable*;
it may never be used to set these numbers after observing results.

| Measure | Limit |
|---|---:|
| Compiler p95, 15-minute maximum plan | ≤ 2 s |
| Render median ratio, 60 s fixture | ≤ 4× realtime |
| Render max ratio, maximum-duration fixture | ≤ 6× realtime |
| Peak worker RSS per render | ≤ 2 GiB |
| Peak temp disk | ≤ 3× source + expected output + 1 GiB |
| Cancel → process exit | ≤ 12 s |
| Stale processes after cancel/timeout | **0** |
| Safe concurrent renders (initial) | **1 per VPS** |
| Analysis job while rendering | must not OOM or lose lease |

**Phase-6 analysis figures (0.58× realtime, 92 MiB peak RSS) must never be cited as render
evidence.** Analysis reads frames; rendering re-encodes them with a per-frame caption
filter pass. Different workload, different curve.

Benchmarks run on the production VPS class at **15 s, 60 s and maximum duration**, each
exercising cuts, captions, zooms, transitions, music, cancellation, crash recovery and two
queued renders.

---

## 10. Lane discipline (what may proceed, and where)

| Lane | Scope | Gated by |
|---|---|---|
| **1 — this session** | finish #208's bounded VPS inventory; keep this document truthful | — |
| **2 — fresh context** | redesign migration reconciliation from scratch. The previous algorithm is DISABLED and must not be reused: it mutated staging before deciding whether drift existed, could not see additive drift, and its hostile suite never executed the real guard | — |
| **3 — fresh offline worktree** | Batch 8.1 and the database-independent part of Batch 8.3 | contract prerequisites only |

### 10.1 Offline lane boundary (absolute)

**May contain:** EditPlanV1 schema and validator; canonical serialization and hash;
interval / cut / time-map compiler; caption cue generation; framing, zoom, transition and
audio instruction builders; the typed FFmpeg graph and argument builder; unit, property,
golden and real-media tests.

**May NOT contain:** any migration, RPC, edge function, database, storage, provider,
network, staging, production or deployment change.

Complete a coherent, locally green batch before **one** draft candidate push. That
candidate stays unmergeable until both stateful gates pass.

## 11. Gate-0 row status

| Row | State |
|---|---|
| Entry blocker: staging-matrix gate merged, required, **proven to block** | ✅ closed |
| Deployed worker recorded; CI-only drift accepted | ✅ closed |
| Duration contract | ✅ frozen (§2) — unimplemented |
| EditPlan schema + contract laws | ✅ frozen (§3) |
| Policy constants | ✅ frozen (§4) |
| Stable error catalog | ✅ frozen (§5) |
| DB/RPC ownership + `0094` name | ✅ frozen (§6) |
| File ownership | ✅ frozen (§7) |
| Non-vacuous fixture matrix | ✅ frozen (§8) |
| Capacity thresholds | ✅ frozen (§9) |
| Migration audit (hashes, grants, RLS, triggers, staging parity) | ✅ closed (§1.1) |
| **VPS capacity inventory, validated** (STATEFUL) | 🟡 PR #208 in flight |
| **Migration ledger reconciliation** (STATEFUL) | 🔴 OPEN — previous algorithm DISABLED as unsafe; redesign required (lane 2) |

## 12. Explicitly out of scope for Phase 8

A second editor; manual timeline; EDL/refine screen; a second Director call, EditPlan or
renderer; Revideo, Chromium rendering or a managed rendering service; arbitrary FFmpeg
strings, paths, URLs, fonts, colours or music from browser or model; a new upload bucket or
source path; a second progress/recovery system; **any post-hoc threshold weakening**.
