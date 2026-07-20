# Phase 5 — Acoustically Grounded Disfluency Detector (DESIGN)

**Status: DESIGN, required by the reviewer stop-rule (2026-07-20).** Run
29755281447 (head `d30e03a`, artifact 8466518334) recorded the finding this
design answers:

> General-purpose Whisper is insufficient for filler detection. With the
> disfluency-context prompt AND the acoustic safeguards active, `small`
> achieves fillerPrecision 1.000 (n=6, CI [0.61,1.00]) and fillerHallucinations
> 0, but fillerRecall 0.333 (2/6, CI [0.10,0.70]) vs the committed ≥0.50 gate.
> A/B on the identical subset: without the prompt recall is 0/6; with it 2/6,
> with ZERO added filler tokens on clean speech — the prompt recovers only
> genuine fillers, but the ceiling is the ASR itself: Whisper's LM omits most
> spoken um/uh, so a token-driven detector cannot reach the recall gate.

Prompt-tuning is stopped. The path to the committed gates (recall ≥0.50,
precision ≥0.80, hallucinations 0) is detection from the **audio**, not from
the ASR token stream.

## Principle

A filler is an acoustic EVENT: a short, spectrally stationary, flat-pitch
voiced span (/əː/ "um", /ə/ "uh", nasal murmur "mm"), typically bracketed by
pauses or clause boundaries. Detect those events directly from the decoded
audio; use ASR tokens only as corroboration, never as the sole source. This is
hallucination-proof by construction: no acoustic event → no candidate,
whatever the LM writes.

## Pipeline (bridge-side, numpy only — no librosa/numba, per the documented
teardown constraint)

Input: the same decoded 16 kHz mono float32 the bridge already has.

1. **Frame analysis** — 25 ms windows, 10 ms hop, Hann + rFFT:
   * spectral flux: normalized L2 delta of consecutive magnitude spectra
   * spectral centroid + rolloff (formant-movement proxy)
   * short-time energy
   * f0 via autocorrelation (60–400 Hz search band) + voicing strength
2. **Candidate event spans** — maximal runs of frames, 80–600 ms long, that are
   simultaneously: voiced (autocorr peak strength above threshold), spectrally
   stationary (flux below the clip's rolling median × k), pitch-flat (f0
   variance below threshold), energy in a mid band (not silence, not a burst).
   Thresholds are FIXED constants committed before evaluation (same
   no-post-hoc-tuning rule as every gate).
3. **Context filter** — an event qualifies as a filler candidate only if:
   * inside a Silero-VAD speech region (acoustic evidence of phonation), AND
   * bracketed by a ≥120 ms VAD pause on at least one side, OR aligned
     (>50% overlap) with an ASR token from the DISFLUENCY set, AND
   * NOT overlapping any lexical ASR word interval by >30 ms (the
     speech-rules-3 neighbor guard, unchanged).
4. **Fusion + confidence** (builder-side, speech-rules-4):
   * acoustic event + matching ASR disfluency token → `filler`, high,
     codes `[acoustic_stationary, pitch_flat, filler_disfluency, vad_speech_at_token]`
   * acoustic event alone (pause-bracketed) → `filler`, medium,
     codes `[acoustic_stationary, pitch_flat, pause_bracketed]`
   * ASR disfluency token alone → **kept as today** (speech-rules-3 guards),
     never upgraded by the prompt
   * Discourse markers ("like", "well"…) are lexical, not acoustic — their
     rules are unchanged.
5. **Bridge output**: a `disfluency_events` array
   (`{start, end, f0_var, flux, voicing, matched_token?}`) alongside the
   existing words/segments/vad/energy; the builder does fusion so the logic
   stays pure and unit-testable.

## Safety invariants (carried over unchanged)

* `safeToConsider` proposals only; the Director decides.
* Low ASR confidence alone never yields a candidate.
* No candidate whose span could clip neighboring lexical speech (>30 ms
  overlap guard).
* Cut boundaries never inside VAD speech (VAD-core rule).
* Hallucination-proof: every candidate has phonation evidence at its span.

## Evaluation plan (same corpus, same gates — values unchanged)

* `speech-eval` reruns with the detector: gates recall ≥0.50, precision ≥0.80,
  fillerHallucinations == 0, per-category + TP/FP/FN + CIs, A/B vs
  tokens-only fusion.
* New unit fixtures: synthetic stationary voiced hum (must fire), rising-pitch
  lexical vowel (must not), noise burst (must not), hum overlapping a lexical
  word (guard must reject).
* Known risks reported per category: far-field pitch tracking (AMI sdm),
  breathy fillers with weak voicing, tonal-language speech (out of scope for
  the pinned `en` policy).
* The mandatory PRIVATE pre-beta gate (~12 consented TwinAI-user recordings)
  re-validates on close-mic target audio.

## Versioning & cost

* Bundle `speech-6` / rules `speech-rules-4` when implemented (new cache
  identity); immutable-component semantics unchanged.
* Pure-numpy O(n·logW) FFT pipeline, ~milliseconds per clip on CPU; zero new
  Python dependencies (constraint: no librosa/numba, see the teardown
  post-mortem in `editor-v2-phase5-speech-eval.md`).

## Explicit non-goals

* No new ML model download, no external services, no training.
* No change to any threshold value.
* No production deploy implied by this document — implementation is its own
  gated change with the full rerun (speech-eval + Phase 1–5 + VPS runtime
  verification on one final head).
