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

| # | Category | Source |
|---|---|---|
| 1 | Clean natural speech | LibriSpeech dev-clean |
| 2 | "Um"/"uh" among real words | AMI (word annotations mark disfluencies) |
| 3 | Meaningful "like" | AMI |
| 4 | Meaningful "well"/"so" | AMI |
| 5 | False start + correction | AMI |
| 6 | Intentional rhetorical repetition | AMI |
| 7 | Accidental repeated phrase | AMI |
| 8 | Long dead air | AMI (inter-utterance pauses) |
| 9 | Short emphasis pause | AMI |
| 10 | Off-script / spontaneous addition | AMI (spontaneous, no script) |
| 11 | Moderate background noise | AMI (multi-party / far-field segments) |
| 12 | Accent + gender + speed variation | LibriSpeech (speaker metadata) + AMI |

Reference transcripts and disfluency spans come from each corpus's OWN manual
annotations — never hand-guessed. Every clip in the emitted manifest records its
corpus, source clip id, license, and the annotation it was selected for.

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
