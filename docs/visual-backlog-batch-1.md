# Visual backlog — batch 1 of the no-speech library (32 references)

**Run:** 2026-08-24T01:18:53Z · enqueued at priority −20 · all 32 terminal by 02:1xZ
**Worker build:** `33c4292` (Deploy worker run #265, SUCCESS 01:03Z) — the first backlog
batch to run with #494's `beatSchedule` on the box.

## Why this batch existed

Run `91fd6b60` (with-speech cohort) came back with frames-per-reference of
`1, 1, 3, 4, 4, 4, 4`. The two 1s were `content_beats` references whose single
frame was the poster image at 0.0s — the owner was asked whether a video needed a
second person **on camera** while looking at a title card.

#494 fixed the cause: the beats path *filtered* beats past the end of the clip
where its comment promised *clamping*, so `[0, 12, 25, 40]` against an 11s clip
collapsed to `[0]`. This batch is the first evidence from production that the fix
holds, and it was deliberately sized at 32 rather than the whole backlog so that a
surprise would cost 32 downloads instead of 330.

## Result: the sampler is fixed

| `frame_schedule_basis` | references | frames each | min | max | single-frame |
| --- | --- | --- | --- | --- | --- |
| `content_beats` | 14 | **4.00** | 4 | 4 | **0** |
| `uniform` | 6 | **4.00** | 4 | 4 | **0** |

`fields_accepted` averaged **16.4**.

⚖️ THE COMPARISON THAT MATTERS is `content_beats` against `uniform`. Before #494
the beats path was the one that could collapse to a single frame while the uniform
path could not; the two now behave identically at 4 frames. **This closes the
question the batch was run to answer** — the sampler needs no further evidence, and
running more references would not make it more proven.

## The finding nobody was looking for: 34% of the batch never got looked at

| outcome | count |
| --- | --- |
| assessed | 21 |
| TikTok — `Your IP address is blocked from accessing this post` | 5 |
| `UNKNOWN_DOWNLOAD_FAILURE` | 3 |
| Instagram — `This Instagram video could not be read: no audio url found` | 3 |

⚠️ **NONE OF THESE ARE SAMPLER FAILURES.** Every reference that was successfully
downloaded was sampled correctly at 4 frames. The attrition is entirely upstream,
at the fetch, and it is a fact about the VPS's egress address and about the
Instagram route — not about the frames pass.

⚠️ **A DOWNLOAD FAILURE IS RECORDED AS `status = 'done'`.** The error lives inside
`jobs.result.error` while `jobs.error` stays null, so a queue-level count of
failures reports zero. Anyone reading job status alone would conclude this batch
succeeded 32/32. It did not.

⚠️ **21 JOBS REPORTED SUCCESS, 20 PROFILE ROWS WERE WRITTEN.** One reference on the
no-speech route (`frames: "ran"`, `skipped: "no_speech"`, `frames_failure: null`)
did not persist a `visual_assessed_at`. Not yet diagnosed. Recorded here rather
than rounded away, because "absent is not zero".

## The decision on the remaining ~292: NOT YET, and why

At 34% attrition, running the rest now spends ~292 downloads to obtain ~193
assessments and burns ~99 on refusals. Fixing the download route first makes the
same spend yield close to 292 assessments.

⚖️ THE BACKLOG IS NO LONGER THE EXPERIMENT — IT IS COVERAGE. The experiment
(does the sampler work?) is finished and passed. What remains is library breadth,
and breadth bought at a 34% loss rate when the loss is a known, fixable cause is
the wrong order of work. **Fix the fetch, then run the rest.**

## Reading this later

- The two pilot runs remain LOCKED and are reported separately, never pooled:
  `7204de6f` (no-speech cohort) and `91fd6b60` (with-speech cohort). This batch is
  **neither** — it is backlog coverage, it was never labelled by a reviewer, and it
  carries no `supported_of_answered` rate. Do not quote it as a pilot result.
- The machine-readable record lives in
  `packages/shared/src/pilot/backlogRuns.ts` and is pinned by a test, so these
  numbers cannot quietly drift.
