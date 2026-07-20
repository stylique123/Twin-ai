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

Fix (dependency removal, not a bypass): decode with `Audio(decode=False)` + raw
**soundfile** (libsndfile, a stable C library); **librosa is no longer
installed**, so numba is never imported and teardown is clean. Hardening that
stands regardless of the crash:

- Fail-**closed**: any exception forces a non-zero exit (`os._exit(1)`), so an
  earlier failure can never be masked by a clean process exit.
- After writing, artifacts are flushed + fsynced + closed, then **reopened and
  schema-validated** (non-empty, required fields, every audio file present with a
  matching SHA-256) and every one of the 12 categories is accounted for; core
  threshold categories must be non-empty or the build fails.
- A regression guard (`scripts/speech-eval/test_build_corpus.py`, run as a CI
  step) asserts the builder imports **neither librosa nor numba** and unit-tests
  the selection helpers + the validator.
- The remaining controlled `os._exit(code)` is documented defense-in-depth (only
  after all validations, code reflects validity). Its removal — once CI confirms
  clean teardown without it — is tracked in issue #192.

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
