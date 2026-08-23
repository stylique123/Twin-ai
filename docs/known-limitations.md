# Known limitations

Deferrals that are still open, and the condition that re-opens each one.

⚠️ **The list of record is `packages/shared/src/pilot/knownLimitations.ts`**, not this
page. Entries there are typed and pinned by
`packages/shared/src/pilot/__tests__/knownLimitations.test.ts`, so closing one is an edit
somebody reviews. This page is the prose; the module is the thing that fails a build.

---

## `TALKINGHEAD_LOOSER_THAN_INDUSTRY` — OPEN

**What is wrong.** The visual pass asks, verbatim
(`worker/src/visualPrompt.ts`, `FIELD_QUESTIONS`):

> `'performance.talkingHead': 'Is someone speaking to camera?'`

No framing requirement. The industry definition is stricter — Synthesia: *"the camera is
usually positioned so that only the speaker's head and shoulders are visible."* A wide shot
of someone addressing the camera from twenty metres satisfies Twin's question and fails the
industry one. That is the shot the owner stopped on while labelling.

**What was decided.** Keep the loose definition through the current pilot, and say so on the
card: *"Someone is talking to the camera. They do not have to be close up."*

**Why the obvious fix is wrong.** Tightening the reviewer-facing sentence without changing
the question the model was asked would have the reviewer judging a **stricter claim than the
model answered**, and every resulting label would record that gap as a *model* error. The
measurement would be corrupted by a change that reads as a pure improvement. It was drafted,
then rejected.

**Revisit when.** The first visual pilot run reaches **LOCKED**. Tightening mid-measurement is
the expensive mistake. Tightening between cohorts is cheap, and comparability is already
broken by the cohort change.

**What it will actually cost.** Two things that are easy to understate:

1. **An analyzer version bump.** `VISUAL_ANALYSIS_VERSION` (`'visual-2'`, mirrored in
   `worker/src/jobs/editorManifest.ts` and `packages/shared/src/editor/contracts.ts`) is
   stamped on every row as `visualVersion` **and** feeds `componentDigest()`. Changing the
   question set without bumping makes old and new rows indistinguishable and yields the *same
   digest for different content*.
2. **It is not retroactive.** A `shotType` field (close / medium / wide) captured alongside
   `talkingHead` is a good idea and cheap to add — but references already analysed under
   `visual-2` carry no `shotType`, and re-running frame analysis on a live pilot is not
   permitted. The payoff lands on the **next** cohort, not the one being labelled now. Absent
   is not "wide".

**Bundled work when this re-opens.** The explanatory comment in `worker/src/visualPrompt.ts`
is deliberately *not* added separately: `worker/` classifies as `FULL` tier, so a
comment-only change would spend a full 40–95 minute staging-matrix lane to say something this
page already says. It goes in with the `shotType` change, which has to touch that file anyway.

---

## `PILOT_COHORT_IS_NOT_THE_PRODUCT_PATH` — OPEN

**What is wrong.** The first visual pilot cohort was drawn from `no_speech` references **only**.
In practice that selects montage and B-roll — aerial festival footage, cut sequences with no
presenter — not the talking-head creator videos the product exists to remake.

Measured on run `7204de6f` before any labelling:

| finding | value |
|---|---|
| `performance.talkingHead` | `false` on **8 of 8** references — no variation |
| `performance.screenInteraction` | `false` on **8 of 8** references — no variation |
| claims that therefore discriminate nothing | 16 |
| `armComparison` | will report **NOT RUN** — `content_beats` cannot appear in a `no_speech` draw |

The owner met this directly at claim 13 — asked whether *"filming this would only need one
location"* about a drone montage of a festival — and said they did not know how to answer. That
is the correct reaction to the question, not a failure to understand it.

**What was decided.** Label and complete the run anyway. Its labels are still evidence: they
measure how well the visual pass reads B-roll, which is a real question. They **do not** measure
the product path, and no report from this run may be read as if they did.

**How to answer a claim a montage cannot settle.** Press **3, "These frames cannot settle it."**
That is a real answer and it is counted. A forced guess is worse than a recorded non-answer,
because afterwards it is indistinguishable from a real judgement.

**Revisit when.** The with-speech cohort is drawn. #475 ships the selection; the draw itself is
the owner's Start button. ⚠️ **The two runs must be reported separately, never pooled** — pooling
to save a round would hide exactly the difference being measured.

**What it will cost.** A fresh run: new cohort, new frame-analysis pass, a second round of
labelling. It cannot be recovered from `7204de6f` by re-analysis — re-running frame analysis on a
live pilot is not permitted, and re-drawing would discard the labels already given.

