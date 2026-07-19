# Editor v2 — Phase 5: Speech Analysis (`transcribing` + the speech portion of `analyzing`)

Phase 5 makes the `transcribing` stage REAL: Faster-Whisper word-level
transcription of the validated recording, Silero-VAD and audio-energy
evidence, and silence/filler/false-start/repetition **candidates** — persisted
as one immutable, versioned `speech` component per source asset. The
`analyzing` stage gains its real speech portion: re-verifying the durable
component against the current bytes. Everything downstream (visual analysis,
music/beat, hook selection, Gemini Director, EditPlan, FFmpeg cutting,
captions, zooms, audio cleanup, output rendering, charging) remains
simulated/absent — later phases.

Related: `editor-v2-media-inspection.md` (Phase 4), `editor-v2-worker-orchestration.md` (Phase 3).

## The contract

`SpeechAnalysis` (packages/shared/src/editor/contracts.ts, schema version 1):

* **Integer milliseconds everywhere.** Words, sentences, VAD segments and
  candidates carry `startMs`/`endMs`; no float seconds are persisted.
* **Deterministic, stable ids.** `w<i>` / `s<i>` / `c<i>` in spoken order.
  Greedy decoding (beam 1, temperature 0, `condition_on_previous_text=False`)
  over fixed (model, bytes) is deterministic, so one
  `(source bytes, speechVersion)` pair always reproduces the same ids —
  later phases can reference words durably.
* **The actual recording, never a script.** The transcript is whatever was
  spoken. Nothing is filtered against a teleprompter; off-script additions
  stay. No teleprompter text ever reaches the worker.
* **Candidates are evidence, not cuts.** Each candidate has a kind
  (`silence` | `filler` | `false_start` | `repetition`), the words it refers
  to, an evidence object (gap length, VAD support, pause, repeated text) and
  a bounded heuristic confidence. **Low ASR confidence alone never produces a
  candidate**, and a low-confidence filler is marked `low` so no later phase
  treats it as a safe removal.
* **Provenance pinned**: engine, model, beam size, VAD engine, silence
  threshold — the component is auditable and reproducible.

## Identity, caching, immutability

Same model as inspection (Phase 4):

* One row per `(source_asset_id, 'speech', analyzer_bundle_version)`
  (`EDITOR_SPEECH_VERSION`, default `speech-1`). No cross-tenant dedup —
  identical bytes under two owners are two rows; the fenced writer derives
  `owner_id` from the asset, never from a caller.
* Repeat projects cache-hit (no download, no ASR). A version bump recomputes
  into a NEW row; old rows are kept (append-only trigger blocks
  UPDATE/DELETE even for service role).
* Concurrent misses and crash-retries converge on ONE row
  (`on conflict do nothing`); a stale worker's late persist is refused by the
  attempt-token fence (`editor_assert_lease` inside the writer).
* Persistence reuses the Phase-4 fenced writer `editor_record_inspection`
  (component-generic since 0082). Migration **0085** adds a 1 MiB payload
  bound at the DB and scopes the `edit_projects.analysis_version` stamp to
  the `inspection` component only — sibling components never clobber the
  inspection epoch.

## Integrity — independent of Phase 4

Order inside `runTranscribingStage`, every run:

1. eligibility re-checks (ready, source, checksum present, editor-eligible)
2. **current etag + byte-size reconciliation against the finalize reference —
   BEFORE the cache lookup** (a cached speech analysis is valid only for the
   unchanged validated bytes)
3. cache lookup; a cached row whose `source_hash` diverges from the asset is
   an integrity failure, never reused
4. bounded, abortable download → **SHA-256 verification** against the Phase-1
   checksum → only then audio extraction (ffmpeg, mono 16 kHz) → ASR
5. fenced persist

A Phase-4 cache hit does **not** authorize later processing of changed bytes:
the speech stage re-reconciles even when inspection passed moments earlier in
the same run (staging matrix T-a tampers in exactly that window). Legacy
assets without a finalize reference are covered by the sha256 step — the
speech stage always verifies the bytes it processes.

## Cancellation

The shared watcher (`editorCancel.ts`, 750 ms poll on `cancel_requested_at`)
trips an AbortController wired into:

* the storage download stream,
* the ffmpeg audio-extraction **process group** (detached, SIGKILL),
* the faster-whisper bridge **process group** (detached, SIGKILL).

Cancellation lands promptly mid-download, mid-extract and mid-ASR — not at
the next stage boundary. After a post-persist cancellation the component is
kept (it is valid, immutable analysis); the next project converges on it via
the cache.

## Errors

Provider failures (model fetch, ASR runtime) are RETRYABLE with stable code
`asr_failed`; over-length media is permanent `speech_too_long`; undecodable
audio is permanent `audio_extract_failed`. Everything durable passes the
sanitizer (urls/secrets/JWTs/hex/paths/DSNs redacted, ≤300 chars); the raw
stderr tail exists only in the worker's stdout (access-controlled container
logs).

## The bridge (`worker/editor_speech.py`)

Separate from the caption-oriented `whisper_transcribe.py` on purpose: the
caption path has an environment-dependent refiner ladder; the component
contract must be environment-independent. The bridge emits raw evidence only
(words + probabilities, segments, language + probability, VAD regions with
pinned `VadOptions(min_silence_duration_ms=300, speech_pad_ms=100)`, RMS
energy at 200 ms windows); all contract construction happens in the pure,
unit-tested `buildSpeechAnalysis`. `faster-whisper` is PINNED (==1.2.0) in
the worker image and in CI — bump it only together with
`EDITOR_SPEECH_VERSION`.

## Candidate heuristics (v1, deliberately conservative)

* `silence`: word/timeline gaps ≥ `EDITOR_SPEECH_SILENCE_MIN_MS` (700 ms
  default), leading/internal/trailing, `high` confidence only when the VAD
  says the gap is mostly non-speech.
* `filler`: runs of um/uh/erm/… — confidence downgraded to `low` when the ASR
  itself was unsure of the word.
* `false_start` vs `repetition`: a repeated bigram separated by a ≥150 ms
  pause or a comma is a false start ("I want, I want to…"); immediate
  identical words are repetitions.

## Env knobs

`EDITOR_SPEECH_VERSION` (speech-1), `EDITOR_SPEECH_MODEL` (base),
`EDITOR_SPEECH_ASR_TIMEOUT_MS` (20 min), `EDITOR_SPEECH_EXTRACT_TIMEOUT_MS`
(3 min), `EDITOR_SPEECH_SILENCE_MIN_MS` (700), matrix-only
`EDITOR_SPEECH_SLOW_POINT`/`EDITOR_SPEECH_SLOW_MS`.

## Staging evidence map (scripts/staging-integration/phase5.mjs)

espeak-synthesized real speech fixture (known script + 1.5 s gaps + an
off-script sentence):

* S — real transcription end-to-end: scripted-word recall, off-script words
  retained, integer-ms words with probabilities, sentences, VAD, energy,
  gap/filler/stumble candidates, telemetry events, epoch not clobbered
* C — analyze-once cache hit (no second ASR)
* V — version bump → second immutable row; UPDATE/DELETE rejected
* T — tamper mid-project after inspection passed → `source_bytes_changed` in
  `transcribing`, no ASR ran; cached speech never legitimizes tampered bytes
* G — cancellation during download / mid-ASR (prompt process kill) / after
  persist (converges), crash-after-speech converges on one row
* F — SIGSTOPped stale worker's late ASR persist is fenced off
* P — provider failure: sanitized `asr_failed`, retryable, no leaks
* B — boundary: only inspection+speech components, zero plans/outputs/credit
  events/legacy transcripts, temp + event hygiene

Phases 1–4 matrices rerun unchanged except their boundary checks, which now
admit the sanctioned `speech` component (phase3 K1, phase4 K1/K2).

## Carried forward to Phase 6+

* The integrity rule (etag+size → bounded download → sha256 → process)
  applies to every future stage that touches bytes.
* Candidates remain suggestions until the Director phase decides; nothing in
  Phase 5 may be interpreted as a cut list.
* Billing: still DESIGN-only (see Phase 3 doc); no reservation or charge
  exists through Phase 5.
