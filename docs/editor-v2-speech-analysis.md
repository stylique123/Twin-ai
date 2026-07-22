# Editor v2 — Phase 5: Speech Analysis (`transcribing` + the speech portion of `analyzing`)

Phase 5 makes the `transcribing` stage REAL: Faster-Whisper word-level
transcription of the validated recording, Silero-VAD and audio-energy
evidence, and silence/filler/false-start/repetition **candidates** — persisted
as one immutable, versioned `speech` component per source asset. The
`analyzing` stage consumes the durable component strictly at the version the
project's pinned boot manifest names (Phase 6 — see
`editor-v2-analysis.md` for the real visual/audio/hook evidence components).
Everything downstream (Gemini Director, EditPlan, FFmpeg cutting, captions,
zooms, audio cleanup, output rendering, charging) remains simulated/absent —
later phases.

Related: `editor-v2-media-inspection.md` (Phase 4),
`editor-v2-analysis.md` (Phase 6), `editor-v2-worker-orchestration.md`.

## The contract

`SpeechAnalysis` (packages/shared/src/editor/contracts.ts, schema version 1):

* **Integer milliseconds everywhere.** Words, boundaries, VAD segments and
  candidates carry `startMs`/`endMs`; no float seconds are persisted.
* **Deterministic, stable ids.** `w<i>` (words) / `u<i>` (boundaries) / `c<i>`
  (candidates) in spoken order.
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

## Word contract

Each word: stable id (`w<i>`, spoken order), original `text` (verbatim ASR),
integer `startMs`/`endMs` (clamped so `endMs >= startMs` and every word stays
inside `durationMs` — Whisper's occasional end-overrun is clamped, never
dropped), `confidence` (0..1), `endsUnit`, `unitId`, and `normalizedText`.
Starts are monotonic non-decreasing. Ids are deterministic for a given
`(source bytes, speechVersion)`. In a `compact` component (see Payload) the
derivable fields (`normalizedText`, `unitId`, `endsUnit`) are omitted —
all reconstructable from `boundaries`.

## Speech-unit boundaries (NOT blindly "sentences")

`boundaries: SpeechBoundary[]` — each `{ id, kind, startWordId, endWordId,
startMs, endMs, text, evidence }`. An ASR segment is **not** guaranteed to be a
grammatical sentence (it can end mid-sentence, merge sentences, or shift with
model parameters), so every boundary records HOW it was determined:

* `punctuation_sentence` — closed by terminal punctuation; the only kind that
  asserts a real sentence (evidence `terminal_punctuation`).
* `asr_segment` — closed at a Faster-Whisper segment edge, a decoding unit
  (evidence `asr_segment_end`).
* `pause_utterance` — closed by a long inter-word pause with no segment or
  punctuation (evidence `pause_gap`).

The future AI Director / hook selection / cut safety MUST consult `kind` before
treating a boundary as a complete sentence — arbitrary ASR segmentation is
never asserted as grammatical completeness. `boundary.text` is derivable from
`startWordId..endWordId` and is omitted in `compact` components.

## Candidate contract

Every candidate carries: stable id (`c<i>`, start order), `kind`
(`silence`/`filler`/`false_start`/`repetition`), `startMs`/`endMs`, `wordIds`,
`prevWordId`/`nextWordId` (adjacent context), `confidence`
(`high`/`medium`/`low` — heuristic strength, never permission), **`safeToConsider:
true`** (a proposal, never `safeToRemove`), `evidenceCodes` (stable machine
codes), `evidence` (structured detail) and `ruleVersion` (`speech-rules-1`).
The analyzer proposes; the later Director/compiler decides.

Evidence codes (v1): `silence_gap`, `gap_removable`, `gap_dead_air`,
`vad_nonspeech`, `vad_ambiguous`, `filler_disfluency`, `asr_low_conf`,
`ambiguous_discourse_marker`, `repeat_bigram`, `pause_between`,
`comma_boundary`, `immediate_repeat`, `stutter`, `proper_noun`.

### Silence banding
A gap under `EDITOR_SPEECH_SILENCE_MIN_MS` (700 ms) is a NATURAL PAUSE and
produces no candidate — the resolution threshold generates evidence, it does
not mean "shorten every gap". Above it, banded by VAD + energy:
`removable` (medium, VAD-clear, < 2 s), `dead_air` (high, VAD-clear, ≥ 2 s),
`uncertain` (low, VAD says the gap is actually speech).

### Filler vs discourse markers
`um`/`uh`/`erm`/… are `filler` disfluencies (high, downgraded to low when the
ASR itself was unsure). `like`/`well`/`so`/`actually`/`basically`/`right` and
`you know` are discourse markers — frequently meaningful — so they are flagged
ONLY in hesitation context (bracketed by a ≥200 ms pause or a clause boundary),
ALWAYS at low confidence, code `ambiguous_discourse_marker`. A fluent
meaningful use ("I feel like a winner") produces no candidate. **Low ASR
confidence alone never produces any candidate.**

### False start vs repetition
A repeated bigram (A B … A B) separated by a ≥150 ms pause or a comma is a
`false_start`; otherwise `repetition`. Immediate identical words are
`repetition` (`stutter` code for short tokens). A capitalized repeat is treated
as a proper noun / intentional emphasis — kept but LOW (`proper_noun`) so it is
never treated as removable. Repeats spanning a unit boundary (separate
units sharing a word) produce no candidate.

## Payload

The component is bounded by construction: the energy curve is downsampled to
≤ 2000 windows (adaptive `windowMs`, mean-aggregated — coarser, never
truncated), and words/candidates scale with speech, not clock time. A very
long, very dense source that would still exceed the 1 MiB DB limit triggers a
deterministic `compact` mode that drops ONLY the three derivable per-word
fields — no word, candidate or timing is ever dropped. If it still exceeds the
limit after compaction it fails LOUD (`speech_component_too_large`), never
silently truncates. A 30-minute source at 3 words/sec fits well under 1 MiB.

## Dependency reproducibility

`worker/requirements.txt` is the SINGLE pinned Python source; both the Docker
image and CI install from it, so the ASR/VAD stack is byte-identical
everywhere. The full closure is `==`-pinned: faster-whisper 1.2.0, ctranslate2
4.8.1, PyAV 18.0.0, onnxruntime 1.27.0, tokenizers 0.23.1, huggingface_hub
1.24.0, numpy 2.4.6, requests 2.33.1. faster-whisper **1.2.0** was chosen as
the current stable line that ships the bundled Silero VAD assets this worker
uses (`get_speech_timestamps`/`VadOptions`) and word-probability output, over
0.x (no word probabilities) and unreleased mains. The `base` model is
baked into the image (and pre-fetched in CI) so no job downloads a model at
run time. The analyzer identity — model name, compute type (`int8`), device,
beam size (1), language policy, VAD params — is recorded in `provenance`; a
change to ANY of these must bump `EDITOR_SPEECH_VERSION`.

## Cancellation points (all seven proven)

before download, during download, during audio extraction, during model
loading, mid-transcription, after transcription/before persistence, and after
persistence/before stage advancement. The download stream and BOTH subprocess
process groups (ffmpeg, faster-whisper) are torn down on abort; deterministic
bridge holds (`--hold-at after_model_load|after_transcribe`) make the
model-load and mid-transcription windows reproducible. In every non-persisted
window no component is written and no stage advances past `transcribing`; after
persistence the component is kept and reused.

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
  retained, integer-ms words with probabilities, boundaries, VAD, energy,
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

## Human-speech evaluation (quality, not just plumbing)

The staging matrix uses a deterministic `espeak` fixture to prove pipeline
behaviour; it cannot prove transcription QUALITY on real recordings. A separate
offline harness (`scripts/speech-eval/`) runs the real pipeline over a set of
legally-usable, consented human recordings (12 categories: clean, um/uh,
meaningful like/well/so, false start + correction, rhetorical vs accidental
repetition, dead air, emphasis pause, off-script addition, background noise,
accent) and reports WER, missing/invented words, off-script retention,
filler/false-start/repetition candidate precision, silence-classification
agreement, and low-confidence behaviour. Baseline first (honest numbers), then
beta thresholds. See `scripts/speech-eval/README.md`.

## Carried forward to Phase 6+

* The integrity rule (etag+size → bounded download → sha256 → process)
  applies to every future stage that touches bytes.
* Candidates remain suggestions until the Director phase decides; nothing in
  Phase 5 may be interpreted as a cut list.
* Billing: still DESIGN-only (see Phase 3 doc); no reservation or charge
  exists through Phase 5.
