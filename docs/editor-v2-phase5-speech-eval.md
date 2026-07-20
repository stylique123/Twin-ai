# Phase 5 human-speech evaluation — corpus, provenance, and predefined thresholds

Two independent gates:

1. **Engineering gate (this doc)** — a permissively-licensed PUBLIC human-speech
   corpus proves the pipeline works on real (not synthetic) speech. Closes the
   Phase 5 engineering gate only if (a) the final `cc1a447` Phase 1–5 rerun is
   green AND (b) the baseline meets the **predefined thresholds below**.
2. **Pre-beta gate (mandatory, separate)** — public-corpus success is NOT proof
   of target-user quality. Before beta, ~12 short, **privately consented**
   recordings from representative TwinAI users must pass the same harness.
   Tracked independently; blocks beta.

## Where it runs

The corpus is fetched and evaluated **in CI** (`.github/workflows/speech-eval.yml`),
because GitHub runners have open internet. Audio is downloaded into the
ephemeral runner (private CI storage) and **never committed to Git**. Provenance
is verified BEFORE download (the job fetches each source's license and asserts
it matches the recorded license/version; a mismatch aborts before any audio is
pulled).

## Corpora (verified in CI before download)

| Corpus | Version | License | Source | Attribution | Categories it supplies |
|---|---|---|---|---|---|
| LibriSpeech ASR | `dev-clean` (SLR12) | CC BY 4.0 | openslr.org/12 · openslr.org/resources/12/dev-clean.tar.gz | Panayotov et al., "LibriSpeech: an ASR corpus based on public-domain audiobooks", ICASSP 2015 | clean natural speech, accents, genders, speaking speeds, low-confidence (quiet/fast passages) |
| AMI Meeting Corpus | 1.6.2 | CC BY 4.0 | groups.inf.ed.ac.uk/ami | Carletta et al., "The AMI Meeting Corpus", 2005 | fillers (um/uh), meaningful like/well/so, false starts, repetition, pauses/dead air, off-script/spontaneous, background/cross-talk |

Allowed CI use: both are CC BY 4.0 — redistribution and automated/commercial use
permitted **with attribution** (recorded in `scripts/speech-eval/NOTICE`). The
CI job re-verifies the license string before download and records the resolved
version + SHA-256 of every artifact into the run report (`speech-eval-report.json`).

> Note: verification could not be performed from the build sandbox (its egress
> proxy 403s these hosts); it is therefore enforced as a mandatory CI step, not
> asserted by hand.

## Category coverage (12 required)

`build_corpus.py` emits a `categories` block in the manifest and report that
accounts for **all 12** with real counts. Coverage is honestly labelled: `auto`
= reliably selectable from the corpora's own streamed annotations; `deferred` =
not reliably isolatable here (speaker *intent*, sub-second/inter-utterance pause
*timing*, or a config that doesn't stream) and therefore covered by the VAD/
candidate unit tests **and** the mandatory private pre-beta gate — never silently
claimed as covered.

| # | Category | Coverage | Source / selection signal |
|---|---|---|---|
| 1 | Clean natural speech | auto | LibriSpeech dev-clean |
| 2 | "Um"/"uh" among real words | auto | AMI ihm — transcript contains um/uh |
| 3 | Meaningful "like" | auto | AMI ihm — transcript contains "like" |
| 4 | Meaningful "well"/"so" | auto | AMI ihm — well/so/actually/… |
| 5 | False start + correction | auto | AMI ihm — partial-word marker (`word-`) |
| 6 | Intentional rhetorical repetition | **deferred** | intent not annotated; merged into repetition, split covered by private gate |
| 7 | Accidental repeated phrase | auto | AMI ihm — adjacent repeated token / bigram |
| 8 | Long dead air | **deferred** | inter-utterance pause timing not in ihm token stream; covered by VAD unit tests + private gate |
| 9 | Short emphasis pause | **deferred** | sub-second pause timing not annotated; covered by VAD unit tests + private gate |
| 10 | Off-script / spontaneous addition | auto | AMI ihm — spontaneous meeting speech, no script |
| 11 | Moderate background noise | auto | AMI **sdm** (single distant mic, far-field/noisy); fail-soft to 0 if the config doesn't stream |
| 12 | Accent + gender + speed variation | auto | LibriSpeech distinct speakers + `SPEAKERS.TXT` gender + words/sec speed bins (see `manifest.diversity`) |

Reference transcripts and disfluency spans come from each corpus's OWN manual
annotations — never hand-guessed. Every clip in the emitted manifest records its
corpus, source clip id, license, and the annotation it was selected for. The
report's `diversity` block records distinct LibriSpeech speakers, gender balance
(best-effort from `SPEAKERS.TXT`), and fast/normal/slow speed distribution.

## Runtime / dependency note — teardown-crash fix (no masking)

An early CI run crashed at **interpreter finalization** with
`Fatal Python error: PyGILState_Release … finalizing` → **SIGABRT, exit 134**,
*after* the corpus was fully written. The faulting thread had `<no Python frame>`
and the loaded extension modules ended in **numba**. Root cause: `datasets`'
librosa-backed audio-decode path imports **librosa → numba**, whose native
threading-layer teardown segfaults at finalization. It was not multiprocessing
and not a defect in our own code.

Fix, part 1 (dependency removal): decode with `Audio(decode=False)` + raw
**soundfile** (libsndfile); **librosa is no longer installed**, so numba is never
imported. This removed the numba teardown crash — but CI then surfaced a
**second, independent** finalization SIGABRT whose module list ends in
**pyarrow** (not numba): `datasets`' pyarrow thread-pool also segfaults at
interpreter teardown, AFTER the corpus is complete. pyarrow is **core to
`datasets`** and cannot be removed while streaming HF corpora.

Fix, part 2 (process isolation — described honestly): `build_corpus.py` runs the
pyarrow-heavy build in an isolated **child process**. The **parent** (the process
CI invokes) imports no datasets/pyarrow and **exits normally after validating
the artifacts** — no `os._exit` anywhere in the parent. The **child does NOT
have clean teardown and we do not claim it does**: its pyarrow finalization is
broken **nondeterministically** — run 29747252159 SIGABRT'd (exit 134), run
29748071316 **deadlocked** (the finished child hung 39 min to the job timeout) —
and after the child writes its fsync'd `build.done` **completion sentinel**
(only once every artifact is written, fsync'd and validated in-child) the parent
grants a short grace and then **deliberately terminates the still-finalizing
child**. The gate is the **artifact**, not the child's exit code: the parent
independently re-validates it (reopen + schema + SHA-256 + all-12-categories,
pure stdlib). A build that failed or hung *before* finishing has no sentinel and
an invalid/absent artifact → the gate fails; a mid-build hang is killed at a
hard deadline and fails the same way. The child's crash and all its logs stay
fully visible in CI. Issue #192 records this. The rest of the hardening still
applies:

- Fail-**closed**: any exception forces a non-zero exit, so an earlier failure
  can never be masked by a clean process exit.
- After writing, artifacts are flushed + fsynced + closed, then **reopened and
  schema-validated** (non-empty, required fields, every audio file present with a
  matching SHA-256) and **all 12 categories must be populated** or the build
  fails.
- A regression guard (`scripts/speech-eval/test_build_corpus.py`, a CI step)
  asserts the builder imports **neither librosa nor numba** and unit-tests the
  selection helpers, `pick_offscript`, and the validator.

## Round-2 closing work (conditional-pass items)

- **Off-script retention is measurable.** Every clip carries a `scriptReference`
  (the intended script) distinct from the spoken `referenceTranscript`; the
  removed words are `offScriptWords`. Retention = off-script words that are
  transcribed **and not covered by any removal candidate**, gated at **≥0.90**.
- **12/12 categories populated with real audio.** Cats 5 (false start), 6
  (rhetorical repetition), 8 (long dead air), 9 (short emphasis pause) are
  **constructed on real human audio** (a real speaker's own voice — a duplicated
  leading segment for 5/6, a measured inserted silence for 8/9) and disclosed
  per-clip in provenance (`constructed: true`, method + params). The validator
  fails the build unless every category count > 0.
- **Filler recall gate.** Newly-added product-quality requirement:
  `minFillerRecall = 0.50`, committed in `thresholds.json` **before** the rerun.
  Paired with the bridge change `suppress_tokens=[]` (see
  `worker/editor_speech.py`) so Whisper emits disfluencies instead of dropping
  them; the speech-component version advances `speech-1 → speech-2` (cache
  identity). Not tuned after seeing results.
- **Speaker metadata.** Gender is loaded from the public `SPEAKERS.TXT` (multiple
  mirrors, diagnostics logged); speed is computed (words/sec bins); accent is
  honestly reported as unlabelled in LibriSpeech (real accent diversity is a
  private pre-beta gate item), not silently "unknown".
- **Reporting.** Every proportion is reported as value + numerator/denominator +
  a 95% Wilson confidence interval; a mandatory metric with denominator 0 is
  reported **NOT EVALUATED and fails** the gate (never counted as "met").

## Round-3 (reviewer decisions after the honest round-2 failure)

Run **29751818139** (head `89bcf11`) was structurally complete — normal builder
exit with no `os._exit`, 12/12 categories, 40 clips, 0 errored — and **failed
two gates honestly** (no tuning): `fillerRecall 0.167` (1/6, CI [0.03,0.56]) vs
≥0.50, and end-to-end `offScriptRetentionRatio 0.825` (52/63, CI [0.71,0.90]) vs
≥0.90. Recorded as the base-model baseline. Diagnosis: (a) base Whisper rarely
writes disfluencies at all — `suppress_tokens=[]` was not the binding
constraint; precision stayed 1.0; (b) decomposition of the 11 dropped off-script
words showed **all were ASR transcription misses** (0.655 WER in far-field
noise) and **zero were editor removals**.

Reviewer decisions (2026-07-20), both made **before** the round-3 rerun:

1. **Ship `small` instead of `base`** (`EDITOR_SPEECH_MODEL` default, version
   `speech-3`; the worker Docker image already prefetches small) and rerun the
   eval **and** the full Phase 1–5 matrix against the **same unchanged gates**.
   The Phase-5 staging matrix exercises the shipped default.
2. **Approved definition split** for off-script retention: the ≥0.90 gate
   measures **editor-removal retention** (of the off-script words the ASR
   transcribed, none may be covered by a removal candidate); **ASR word-miss**
   is reported separately as ungated `offScriptAsrMissRatio` (WER/model
   domain). Documented in the report's `definitions` block.

Also on record from round 2 (ungated findings): 2 of 3 constructed dead-air
clips produced no silence candidate (Whisper word timestamps bridged the
inserted mid-utterance silence); gender metadata mirrors for `SPEAKERS.TXT`
404'd, so gender remained unknown in that run.

## Round-4 (defect fixes exposed by the first genuine `small` run)

Run **29752731049** was **invalidated for model attribution** (the harness'
bridge invocation still defaulted to base while the report claimed small —
caught because every metric was byte-identical to the base baseline; fixed by a
single `ASR_MODEL` source). The first genuine small run, **29753050199** (head
`a390093`), delivered clean WER 0.013 / invented 0.000 / off-script retention
1.000 (n=52) — and exposed three failures with one shared root:

* `fillerRecall 0/6` — small is MORE fluent and omits um/uh even more;
* `falseStartPrecision NOT EVALUATED` — the constructed clips' inserted pause
  vanished from Whisper **word timestamps**, so the `pauseMs >= 150` rule never
  fired (they classified as repetition);
* `silenceClassAgreement 0/1` + all 3 dead-air clips missed — Whisper word
  timestamps **bridge real mid-utterance silence**, and silence candidates were
  derived from word gaps only.

Round-4 changes are **defect fixes in the analyzer, not metric/threshold
changes** (gates unchanged, `speech-rules-2`, bundle version `speech-4`):

1. **Silence candidates from word gaps ∪ VAD gaps** (merged regions): Silero
   VAD — already stored as evidence — is the ground truth for non-speech; a
   real dead-air stretch the ASR bridged now yields a `dead_air` candidate with
   a `vad_gap` evidence code. Banding rules unchanged.
2. **VAD pause evidence for false starts**: the repeat-bigram rule consults the
   longest VAD non-speech stretch across the junction span
   (`vad_pause_between`) in addition to word-timestamp pause and comma.
3. **Disfluency-context `initial_prompt`** in the bridge (constant string,
   greedy decoding — deterministic): token de-suppression alone measured 0/6
   because Whisper's training transcripts omit fillers; a prompt that itself
   contains fillers biases verbatim emission. Any prompt leakage into output
   would trip the invented-word gate.
4. Corpus: constructed false-start pause 300 → 600 ms so the real silence
   survives Silero's 100 ms speech pads.

Unit tests added for the two bridged-timestamp behaviors (22 pass).

## Round-5 (anti-hallucination safeguards — a prompted recall pass is NOT closure)

Reviewer directive: the disfluency-context `initial_prompt` can bias Whisper
into emitting fillers that were **never spoken**, and the global invented-word
ratio (≤0.03) cannot catch a handful of hallucinated fillers that still create
unsafe removal candidates. Safeguards (all landed, `speech-rules-3`, bundle
`speech-5`):

1. **Exact confusion counts**: filler recall/precision reported with TP/FP/FN.
2. **Dedicated hallucination gate**: the clean set is now ENFORCED to contain
   zero spoken fillers (transcript-checked at corpus build); gate
   `fillerHallucinations == 0` counts filler TOKENS + filler CANDIDATES on it.
3. **Acoustic evidence required**: every filler candidate needs ≥50% Silero-VAD
   speech overlap at the claimed timestamp (Silero is independent of Whisper);
   evidence code `vad_speech_at_token`.
4. **Neighbor-overlap guard**: no filler candidate whose token interval overlaps
   an adjacent lexical word by >30ms — acting on it could clip real speech.
5. **Mandatory A/B**: `small` with vs without the prompt on the identical
   clean+filler subset; the report states whether the prompt improves GENUINE
   recall or only increases emitted filler tokens.
6. WER ≤0.20 / invented ≤0.03 kept, explicitly NOT substitutes for the
   filler-specific gate.
7. **Silence-safety gates**: `minShortPausePreservation = 1.0` (a short emphasis
   pause must never band as removable/dead air), and removable/dead-air
   candidates are shrunk to the largest **VAD-clear core** so cut boundaries
   never sit inside VAD speech.
8. **VPS runtime verification** (required before Phase 6): benchmark `small` on
   the production VPS — processing ratio, peak RAM, CPU, timeout behavior,
   cancellation, safe concurrency — executed at the deploy step; PASS evidence
   must include it.

Strengthened thresholds (never weakened): `minFillerPrecision 0.50 → 0.80`,
`maxFillerHallucinations 0`, `minShortPausePreservation 1.0`. **Stop-rule** on
record: if filler recall ≥0.50 with precision ≥0.80 and zero hallucinations is
not achievable, prompt-tuning stops, general-purpose Whisper is recorded as
insufficient for filler detection, and Phase 5 requires a separate,
acoustically grounded disfluency detector.

## Measurements (published per category + overall)

WER (token Levenshtein), missing-word count (deletions), invented-word count
(insertions/hallucinations), word-timestamp plausibility, off-script retention,
filler / false-start / repetition candidate precision, silence-classification
agreement, low-confidence behaviour, boundary-kind distribution. Failures are
listed per clip in the report artifact.

## PREDEFINED thresholds (set BEFORE any results — never weakened after)

These are principled beta ceilings for the pinned `base` model, fixed in
`scripts/speech-eval/thresholds.json` before the first run:

| Metric | Threshold | Rationale |
|---|---|---|
| Mean WER, clean read speech (LibriSpeech) | ≤ 0.20 | `base` on clean read speech is well under this; a higher value signals a real regression. |
| Invented-word ratio, clean | ≤ 0.03 of reference words | Hallucination guard; near-zero expected on clean audio. |
| Off-script retention | ≥ 0.90 | The transcript must keep words the speaker actually said; script-filtering is forbidden. |
| Filler candidate precision (AMI) | ≥ 0.50 | Candidates are conservative by design; over-flagging real words is the failure mode. |
| False-start candidate precision (AMI) | ≥ 0.40 | Same; false starts are ambiguous, so a modest floor. |
| Repetition candidate precision (AMI) | ≥ 0.40 | Same. |
| Silence-classification agreement (AMI) | ≥ 0.60 | removable/dead_air/uncertain vs annotated pauses. |
| Low-confidence-alone → removal candidate | 0 (hard) | A low-confidence word must never, by itself, produce a removal candidate. |

If the baseline misses a threshold, that is a real finding: fix the system, or
re-calibrate a threshold **with a documented engineering justification** — never
lower it merely to turn the run green.

## Status

Pipeline + provenance + thresholds defined here; the CI job builds the manifest
from the corpora's own annotations, runs the real bridge + builder
(`scripts/speech-eval/evaluate.mjs`), and uploads the report. Baseline pending
the CI run. PR #191 stays draft and Phase 6 stays unauthorized until this
engineering-gate evidence is complete (and the pre-beta private-user gate is a
separate, later blocker).
