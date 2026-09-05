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


---

## `THE_CLAIM_STOP_IS_DECLARED_BUT_NOT_ENFORCED` — OPEN

**What is wrong.** `entityStatus` and `mayGenerateClaims` in `productEntity.ts` implement what
their own comment calls "the hard half of §14": `missing_information` is *"a STOP, not a warning:
an entity in that state may be MENTIONED but must not have claims generated about it."* Both
functions have **zero production callers** — grep finds them only in their own test file.
`generate-blueprint` reads the owned entity and uses `name` for a beat-audit signal, but nothing
anywhere consults the status before letting a script make claims about a product. The rule was
written, tested, and never connected.

**What was decided.** Still not wired, and the reason has changed because the measurement was
taken. An earlier version of this entry asserted that "most entities in production carry evidence
null" and that enforcing the stop "would silence product claims for MOST existing products" — an
assumption stated as fact. Measured 2026-08-24, read-only: `public.product_entities` contained
**one row in total**, one owner. There was no "most"; the sentence described a population that did
not exist.

**Why the measurement did not settle it either.** That single row would indeed return
`missing_information`, which is 100% of the table and evidence of nothing: n=1 cannot distinguish
"the mint never collects evidence" from "this one row happens to lack it". Reporting 100% there
would have been the same error in the opposite direction. So the refusal stood on a new footing —
not that wiring the stop would break most products, but that **nothing is known** about what it
would do, and a rule whose blast radius is unmeasured must not be connected to a creator-facing
path.

**Re-measured 2026-09-05**, same read-only query, live rows only:

| | 2026-08-24 | 2026-09-05 |
|---|---|---|
| live rows | 1 | **8** |
| distinct owners | 1 | **8** |
| `evidence is null` | 1 | **8** |
| rows with no name | — | **3** |

⚠️ **The trigger has NOT fired, and this entry stays OPEN.** `CLAIM_STOP_MIN_POPULATION` is 25;
eight rows is short of it. Only the "more than one owner" half of the condition is now satisfied.

⚠️ **But one sentence in the old cost note is now stale and is corrected here.** The exposure was
described as "bounded by the same measurement: one entity, one owner". It is not: a script may
currently make claims about an entity with no name and no evidence, and that now reaches **eight
entities across eight distinct owners**, three of which have no name at all. The bound grew by 8×
while the decision did not change.

**Revisit when.** At least `CLAIM_STOP_MIN_POPULATION` live rows across more than one owner, at
which point re-run the same query. If most of that population would return `missing_information`,
the defect is that the mint never collects evidence and **that** is the fix. If few would, wire the
stop. The older trigger — "someone has counted" — is spent: it was counted, and the count was 1. A
trigger a single query can satisfy while teaching nothing is not a trigger.

**What it will cost.** Low to wire, high to get wrong in either direction. The cost of wiring it
blind is unchanged and unbounded, because nobody knows what it would block.

---

## `STAGING_PHASE5_CANCEL_TEARDOWN_FLAKE` — OPEN

**What is wrong.** On 2026-08-24 the staging matrix failed phase 5 on head `9798b1df` with
`AssertionError [ERR_ASSERTION]: assert(!this.paused)` thrown from `Parser.finish`
(`node:internal/deps/undici/undici`) during the deliberate SIGTERM in the `cancel-during_extract`
case. The diff under test touched only `generate-blueprint` show-moment wiring and a generated edge
copy — nothing in the cancellation path, the worker, or the HTTP client. A single
`workflow_dispatch` re-run of the **same head** then passed, and the change merged.

**What was decided.** Recorded as observed-and-recovered, and deliberately **not** as a diagnosis.
Two runs of one head separate "reproducible on this commit" from "not reproducible on this commit";
they do not establish why an undici parser was mid-body when the socket was torn down. Writing
"flaky teardown race" here as a *cause* would make the next person reading it stop looking, and a
cancellation bug that surfaces once every N runs is exactly the kind that gets dismissed by an
inherited label. What is known is the signature, the step, and that it did not recur on the same
commit.

⚖️ The outcome was **pre-registered** before the re-run — pass meant merge without claiming a
cause, the same failure meant stop and investigate — so the merge is not a decision made after
seeing a convenient result.

**Revisit when.** The same `assert(!this.paused)` signature appears in phase 5 on a **different**
head. One occurrence is an anecdote; a second on unrelated code makes it a property of the
cancellation teardown rather than of a commit. At that point the thing to look at is the undici
response body on the aborted extract call — specifically whether it is consumed or destroyed before
the socket goes away.

**What it will cost.** Investigating now costs a matrix trip per attempt against a failure that has
not recurred and cannot be forced. Leaving it costs a re-run when it happens again — and the
standing rule already caps that at **one** re-run of the same head before it must be routed to the
staging-harness issue rather than re-run until it goes green.

---

## `PER_TYPE_SCENE_DIRECTION_IS_UNFILMED` — OPEN

**What is wrong.** Every screen-shown type now gets its own moments, and **not one of them has been
followed by a person holding a phone**. The direction is written, parity-checked against the edge
copy, and unit-tested for shape. None of that is evidence that a creator can film it.

**What was decided.** ⚠️ Recorded as its own limitation rather than folded into the one it
succeeds. `SCENE_GUIDANCE_DOES_NOT_READ_THE_TYPE` was a defect — five types, one script — and it is
fixed. This is a different claim: that the words now written are words somebody can act on. Marking
the first RESOLVED and stopping there would let a wiring change stand as evidence about a filmed
video, which it is not.

**Revisit when.** A real recording exists of a creator following the moments for something that is
**not** a SaaS dashboard. The two teleprompter recordings and the watched creator session are the
first place that could be seen.

**What it will cost.** Leaving it costs nothing until somebody quotes the per-type direction as
proven. The failure it guards against is exactly that quote.

---

## `AUDIENCE_QUESTIONS_HAS_NO_SUPPLY` — OPEN

**What is wrong.** `generate-blueprint` read the top 8 `audience_questions` rows and interpolated
them into the knowledge block as *"WHAT THEIR AUDIENCE KEEPS ASKING"*. The table has **zero rows,
has never had one, and has no writer anywhere**: 0121 grants SELECT and DELETE to `authenticated`
and INSERT to nobody. A live read against a table nothing can fill is the "written and never read"
defect inverted — read and never written — and it made the prompt look like it carried audience
demand when it never could.

**What was decided.** The reader is deleted, and a writer was deliberately **not** built instead.

⚠️ **The earlier ruling was "the worker writes it, service-role, no client policy", and the
measurement retired it.** Of 1,080 stored `creator_knowledge` rows, **one** carries an audience-asks
frame; 18 mention "ask" at all and 6 mention "question". Captions and transcripts are never
persisted — `brand_voices.profile` has no captions key across all 44 rows — so `creator_knowledge`
is the whole available corpus. A worker writing from it would produce roughly one row across every
creator on the platform: a feature whose ON and OFF states are indistinguishable, which is the exact
failure the ruling was trying to avoid.

⚖️ **And the client-typed version was refused for a different reason.** Asking a creator to type
three questions their audience asks is a fourth place we ask for something we could observe, against
a product direction that is otherwise infer-confirm-never-ask.

**Revisit when.** **Comment ingestion lands.** What this block wanted is what a creator's *audience*
asks; the scan only ever captured what the *creator* says, and those are different corpora. Comments
are the real source: public, already inside the Apify pipeline, and `commentsDatasetUrl` is already
present in the scrape output. The supply is one fetch away, not one feature away. When it lands,
restore the read **and** the block together — a writer without the reader repeats this entry from
the other side.

**What it will cost.** Deleting costs nothing measurable: the block could only ever render empty, so
no prompt changes for any creator. Leaving it would have cost the next person the same
investigation — find the empty table, assume the writer is missing, build one against a corpus that
supports a single row. That is the cost this entry exists to prevent, and it is why the reason is
recorded rather than the code simply removed.
