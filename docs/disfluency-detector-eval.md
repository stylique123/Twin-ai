# Disfluency detector — the bar, and where it has actually been measured

**Issue:** #194 · **Module:** `worker/src/jobs/disfluencyAcoustics.ts` · **Eval:** `worker/src/__tests__/disfluency-eval.test.ts`

> **`autoFillerRemoval` stays `false`.** This document records that a detector exists
> and that it is measured. It does **not** record that the bar for enabling
> automatic filler removal has been met, because the set it is measured on is
> synthetic. See *What has not been measured* below.

---

## Why an ASR token is not evidence

Whisper is not a disfluency detector. It normalises and frequently omits filled
pauses, and with a disfluency-context prompt it will emit an `um` nobody said.
So a token is a **reason to look**, never proof that a filled pause occurred.

Promoting a token straight to a cut is how a product deletes a syllable of real
speech and reports success. #194 exists to make that structurally impossible.

## What the detector uses

Signals the transcript cannot influence:

| Signal | Role | Why |
| --- | --- | --- |
| Silero VAD overlap ≥ 50% | **veto** when absent | An independent model's opinion that sound was made where Whisper claims. |
| Neighbour overlap ≤ 30ms | **veto** when exceeded | Beyond a frame or two of wobble, a cut clips a real word. |
| Duration 80–600ms | **veto** when outside | Below is a segmentation artefact; above is a held word, not a stumble. |
| Energy ≤ 0.8 × speaker baseline | **support** | Filled pauses are produced with reduced effort. Compared per-recording — an absolute dBFS threshold measures the microphone. |
| Flanking pause ≥ 150ms | **support** | A hesitation is flanked by hesitation. |

**Both supporting signals are required** (`MIN_ACOUSTIC_SUPPORT = 2`). Counts, not
a float — the same discipline as `dnaProvenance.ts`, so that which signals fired
stays auditable instead of summing into a confident-looking 0.82.

### A precondition is not evidence

The first version of this module counted *"VAD hears sound"* and *"the duration is
plausible"* as supporting signals. **Both are true of essentially every word a
person says.** Two of them together cleared the bar, so a fully-voiced,
normal-length, fluent **"so"** scored identically to a filled pause.

The eval caught it as two false positives before it shipped. The rule that came
out of it: *a signal may only support if it distinguishes hesitation from
ordinary speech.* Presence and plausible duration are necessary for a candidate
to be actionable at all, and worth nothing once satisfied.

## The bar

| Metric | Bar | Measured |
| --- | --- | --- |
| **Precision** | **1.00** | **1.000** (tp=7, fp=0) |
| **Recall** | 0.75 | **0.875** (tp=7, fn=1) |

Asserted in the eval, so a regression fails the build.

**The bar is deliberately asymmetric.** A false positive is a cut through real
speech, shipped to a creator's audience. A false negative is an `um` left in a
video. Those costs are not comparable, so precision is pinned at 1.0 and recall
is *not* — a detector tuned to catch every filled pause is a detector that has
started guessing.

### The one miss, and why it is the right one

> `emphatic "UM" — loud, but bracketed and in-band`

A filled pause produced at full volume with no energy drop. Catching it would
mean accepting a flanking pause alone as sufficient — and ordinary speech is
full of flanking pauses. Leaving an audible `um` in a video is the cheapest
error available here.

## What has **not** been measured

**The 20 labelled cases are synthetic traces** — hand-built word intervals, VAD
segments and RMS curves encoding the acoustic situations the detector must
separate. They characterise the detector's logic. They are not human speech.

So this document does **not** discharge #194's second condition. Enabling
`autoFillerRemoval` requires the same harness run over **real labelled
recordings**, which the pre-beta gate (#193 / #204) is collecting. Until then:

- `EDITOR_FEATURES.autoFillerRemoval` stays `false`
- the EditPlan compiler rejects filler removal unconditionally (#195, closed — three layers enforce it)

A green suite here reads like permission. **It is not permission.**

## Re-running it

```
cd worker && npx vitest run src/__tests__/disfluency-eval.test.ts
```

Precision and recall print to stdout on every run, with any miss named.

## When real labelled audio exists

1. Encode each clip as a case in `CASES` — same shape, real traces.
2. Re-run. The bars are unchanged; **do not lower them to fit the data.**
3. If precision drops below 1.0, the detector is wrong for real speech — tighten
   it, and record what was tightened here.
4. Only once precision holds at 1.0 on real audio does the `autoFillerRemoval`
   conversation open, and it is still a deliberate code change at
   `editorCompile.ts` rather than a config flip.
