# Phase 5 human-speech evaluation

Synthetic (`espeak`) fixtures prove the pipeline is deterministic and correct;
they cannot prove transcription quality on the recordings TwinAI actually
receives. This harness measures the REAL worker speech pipeline against a small
set of **legally-usable, consented human recordings** and records an honest
baseline.

## Fixture set (minimum 12 categories)

Short recordings, each with **explicit consent and documented provenance**:

1. Clean natural speech
2. "Um"/"uh" surrounded by real words
3. Meaningful "like" (not filler)
4. Meaningful "well"/"so"
5. False start followed by a correction
6. Intentional rhetorical repetition
7. Accidental repeated phrase
8. Long dead air
9. Short emphasis pause
10. Off-script addition
11. Moderate background noise
12. At least one accent variation

Recordings need not be public, but CI/staging must have **secure authorized
access** and a **retention policy**. Acceptable sources: internal recordings
with written consent; or permissively-licensed public speech (CC0 / CC BY 4.0
with attribution) where the license IS the documented provenance. Record the
consent/license/retention in the manifest `provenance` block.

## How to run

```
# build the worker first (provides dist/jobs/editorSpeech.js + the bridge)
cd worker && npm ci && npm run build && cd ..
pip install -r worker/requirements.txt   # same pinned ASR stack as prod/CI
SPEECH_EVAL_MANIFEST=/secure/path/manifest.json node scripts/speech-eval/evaluate.mjs
```

Writes `speech-eval-report.json` and prints a summary. With no manifest it
exits 0 with an explicit "no eval set provisioned" notice — **never a false
green**. It is an OFFLINE evaluation: no DB, storage, or staging-matrix
mutation.

## Measurements reported

- Word error rate (token Levenshtein) + substitutions
- Missing-word count (deletions) and invented-word count (insertions)
- Off-script retention (expected off-script words that survived)
- Filler / false-start / repetition candidate precision (candidates matching
  expected annotated instances)
- Silence classification (removable / dead_air / uncertain) vs expected
- Low-confidence word count
- Boundary-kind distribution (punctuation_sentence / asr_segment / pause_utterance)

## Baseline first, then thresholds

Run once with `thresholds: null` and record the numbers **honestly** — do not
tune the fixtures or thresholds to force green. Then set beta thresholds
(`maxMeanWer`, `maxInventedWords`, `minOffScriptRetentionRatio`) from the
observed baseline and wire the run into CI once recordings are securely
provisioned.

## Not yet wired into the gate

Until a consented recording set exists with secure CI access, this harness is
run manually and is **not** a staging-integration gate step. Provisioning the
recordings + access is the remaining item for Phase 5 final PASS.
