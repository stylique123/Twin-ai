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
