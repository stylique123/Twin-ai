# Defects found on real data — 2026-08-11

**Why this file exists.** Every defect below was invisible to a green test suite
and appeared only when the system was pointed at real creators, real titles, and
real generations. They are recorded together because the *pattern* matters more
than any single entry: this codebase's tests are good at proving code does what
it says, and blind to whether what it says is true of the world.

Each entry states the measurement, not the impression. Where a fix exists it
names the commit's reasoning; where the fix is partial it says so.

---

## 1. The refund alert wrote to a table that has never existed

**Measured.** `generate-blueprint` alerted on a failed duplicate-refund by
inserting into `ops_alerts`. No such table exists in any migration or in the
production database. The name is real but belongs to the **trigger**
(`notify_admins_on_ops_alert`); 0028 creates `ops_events`, whose four columns are
exactly the four the insert writes.

**Why nothing caught it.** The write is deliberately fire-and-forget:

```ts
.from('ops_alerts').insert({ kind: 'refund_failed', … }).then(() => {}, () => {})
```

The `42P01` was swallowed on every occurrence. A table name is a *string*, so the
compiler cannot check it, and no test could reach the path — it runs only during
a duplicate-key race against a failing RPC.

**Consequence.** The single alert meaning *a refund failed and a human must
reconcile it* went nowhere, every time. The admin notification never fired.

**Fixed** → `ops_events`, plus `scripts/ci/check_table_names_exist.mjs`: every
non-storage `.from()` across edge functions and the worker must name a relation
some migration creates. Decidable from the repo alone, no database needed.
Mutation-tested both directions.

---

## 2. `0120` and `0121` were committed and never applied

**Measured.** Production's migration ledger ended at `0119`. Neither
`product_entities` nor `creator_knowledge` existed.

**The hazard.** The branch that reads `product_entities` correctly returns 503
rather than guessing when the read fails. Against a missing table PostgREST
returns `42P01` — so merging first would have made **every blueprint generation
return 503**. Not a degraded script: no script.

**Why they slipped.** Both are deliberately excluded from the staging matrix
(their FK target is a staging fixture applied *after* the migration loop). The
exclusion is correct, and its cost is exactly this: **nothing applied them
anywhere, so nothing noticed they had never been applied.**

**Fixed** → applied by hand and ledger-reconciled. The durable fix is in
`check_staging_migration_coverage.mjs`: excluding a migration means taking on a
manual apply, and the header now says so at the point the decision is made.

**Still open.** `0121`'s RLS policies — including the deliberate *absence* of an
INSERT policy that stops a creator asserting "I have said X" about themselves —
exist in production and have never been **exercised** anywhere.

---

## 3. `@CarterPCs` is not CarterPCs

**Measured.** The handle resolves to a real channel named **"five"**: 146
subscribers, 3 videos, two of which credit `@actuallycarterpcs`. The intended
account has **3,150,000** subscribers.

A DNA scan would have **succeeded**, built a voice from a stranger's three
videos, and reported no error at any point. Third appearance of this class — the
original creator pack had 9 of 12 handles wrong and 3 on the wrong platform.

**Why the obvious fix is wrong.** "Small means wrong" is unsound and would be
worse than the bug: 146 subscribers is a real customer, and this product exists
for people who are not famous yet. A threshold refuses the people who need it
most and waves through any well-followed impostor.

What was detectable is **disagreement**: a handle saying "CarterPCs" resolving to
a display name saying "five", on an account whose own titles point elsewhere.

**Fixed (contract only)** → `scanTargetConfirmation.ts`. Surfaces the facts a
human needs, flags conflicts, and `mayBuildDnaFrom` requires explicit
confirmation — `plausible` is strictly weaker than confirmed.
**No production reader yet**; wiring it needs a confirmation screen.

---

## 4. A title was being promoted into a position the creator holds

**Measured, twice.** Over 86 real titles: 13 of 84 items (**15.5%**) came back
with `basis: 'stated'`. Over the full 501-caption corpus: 20 of 489 (**4.1%**),
across four of eight creators. Every one was a declarative-sounding headline:

> "Siri is ACTUALLY Good Now" · "Tesla Self-Driving is Better Than You Think"

Those are titles. Nobody heard the creator say them.

**Why it matters.** `stated` is exactly the level at which `evidenceLevel` starts
letting the writer put a position in the creator's **mouth**. A title phrased as
a question may be answered "no" inside the video.

**Why a prompt rule was not enough.** `CAPTION_SYSTEM` already says, in words,
never `stated` from a headline. The model obeyed on three creators and broke it
on the fourth, because those sentences are shaped like assertions. A rule that
holds 96% of the time is not a rule.

**Fixed** → `clampCaptionBasis`. That function is fed captions **by
construction**, so the correct basis is decidable at the call site rather than
from the text. Cost stated out loud: a long caption genuinely spelling out a
position is demoted to coverage — one lost quotable line, versus a creator
assigned a stance they never took.

---

## 5. The claim rules were tested and read by nothing

**Measured.** `claimRulesFor` and `mayWriteCommercialCta` had full coverage; the
only mention outside their own tests was a **comment**. Every permission was
decided by the video goal, which cannot see the relationship.

**Consequence.** A `REVIEW_ONLY` entity plus a commercial goal produced a
purchase CTA for **someone else's product**. An affiliate tie produced no
disclosure.

**Fixed** → wired, with a test that checks the edge *consults* them, not merely
that they are correct. Mutation-tested: restoring goal-only `sellIntent` fails
it, and computing the block without interpolating it fails it.

---

## 6. The citation check cried wolf — in production

**Measured.** Across a 60-run matrix the substance check reported 18 fabricated
citations. **All 18 were real.** Two causes, both in the check:

- The prompt renders knowledge as `* (product) cardboard PC`, so the writer cites
  it back **with the prefix**. The literal word "product" joined the term set and
  forced a two-term match a two-word citation could never make. **10 of 18.**
- A beat may rest on **more than one** item, cited as a list. Measured whole,
  that is two items' worth of terms and no single stored item matches enough.
  **3 more.**

Both bugs were in production `substanceIssues`, not only the harness.

**Why it matters more than a false positive.** A check that cries wolf teaches
people to ignore the one time it is right.

**Fixed** → prefix stripped, comma-separated parts traced independently. After
the fix the signal is clean and isolated: **4 flags, all in the runs where
knowledge was deliberately withheld** — where the writer invented a citation
("Goal: educate") having been given nothing. 4 of 4 caught.

---

## 7. Ten items a scan vanish into a filter

**Measured.** Of 489 items extracted from the full corpus, 10 came back as
`action` (8) or `tool` (2) — kinds the model wanted and the taxonomy lacks. The
worker filtered them correctly (`creator_knowledge_kind_valid` CHECKs the list;
an unlisted kind fails the INSERT for the whole batch) and **dropped them in
silence**.

A systematic gap in the taxonomy that is never reported looks exactly like the
creator never saying anything.

**Fixed** → rejected kinds are logged with count and offending kinds; a swallowed
insert error is logged too. `knowledgeKindParity.test.ts` pins the taxonomy
across all three places it is written down (shared, worker copy, the 0121 CHECK).

**Open question, deliberately not smuggled in.** The model reached for `action`
eight times. That may be a category the taxonomy genuinely lacks — adding one
requires a migration to widen the CHECK.

---

## 8. The harness had fallen behind the product

**Measured.** #316 made the writer declare, per beat, where its content came
from. `run-eval.mjs` kept sending the previous prompt and schema, so a matrix run
**could not see the layer the whole substance effort exists to produce.**

Also: cohort 3 was invisible to the creator lookup and killed a 44-run matrix
*after* the cases were built; and the onboarding answers were hard-coded to the
creator, so no run could distinguish "the creator differs" from "what they told
us differs".

**Fixed** → substance rules lifted verbatim from `generate-blueprint`, every
cohort in the lookup with a named error on miss, answers as a per-case input.

**This is the sixth time this harness family has measured itself rather than the
product.** The pattern is worth more attention than any instance.

---

## 9. Tests whose result depended on the working directory

**Measured.** Three parity tests read their counterpart source via `../../…`,
which resolves against CWD. From `packages/shared` they pass; from the repo root
they threw ENOENT and vitest reported "3 failed" with every assertion inside
unexecuted.

**The cheap version cost minutes. The expensive version is the inverse:** a
parity test that silently reads nothing and *passes* while the two files it
compares drift apart. These throw rather than skip, which is the only reason it
was visible.

**Fixed** → paths resolved from `import.meta.url`.

---

## 10. A reference can demand evidence the creator does not have

**Measured.** 112 runs, 8 real creators, 702 beats — 56 against hand-observed
references and 56 against title-inferred shapes, cross-paired so no creator got
a shape derived from their own channel.

**9 beats asserted a first-person history the creator never stated.** Verbatim:

> "I used to struggle with distractions, especially with all the gadgets I review."
> "those high-end, wired earbuds I used to swear by"
> "These are three products I've bought and would absolutely never buy again."
> "Once I started building my own, the cost savings were immediate."

None of those people said any of that. The corpus is titles only, so **nobody in
this cohort has experience-level evidence at all** — every one of these is
unearned by construction.

**What drives it.** The failure clusters on references whose MECHANISM REQUIRES A
PERSONAL CLAIM — Ali's self-reported "3x more productive", Codie's contrarian
"don't do X", Tilbury's identity story, "3 things I stopped buying". Handing
those to a creator with no experience evidence is an instruction to invent one.

⚠️ **THE COMPARISON IS CONFOUNDED AND THE NUMBERS MUST NOT BE READ AS
OBSERVED-vs-INFERRED.** The observed references are business and productivity
shapes; the derived ones are tech-native (question-test, superlative,
enumerated). The two blocks differ in mechanism source AND in domain distance
from the creator, so the 9-vs-2 split cannot be attributed to either. Reported
here as a confound rather than a finding, because the tempting headline —
"hand-observed references are worse" — is not supported.

**The finding that does survive**: `unearned_first_person` caught **all nine**,
and **nothing stopped any of them**. The check is report-only. In production
those lines ship. `requiresExperienceEvidence` exists on the derived references
and is advisory — the compatibility gate does not consult it.

---

## 11. A citation that describes instead of quoting

**Measured.** 13 beats cited creator knowledge that could not be traced. Unlike
the earlier false-alarm class, these are real — and they share a shape. The
model does not quote the supplied item; it **describes a relationship to it**:

> "3D printing is a known topic for the creator"
> "AI in farming is a known topic for the creator"
> "creator uses a simple system of bullet points and keywords"
> "premise about innovative tech simplifying lives"

Some are loosely true and still untraceable. One — the bullet-point system — is
an invented capability wearing a citation, which is exactly the failure the
check exists to catch.

**Why it happens.** The prompt asks the writer to "quote or closely paraphrase
the specific supplied item" but the schema accepts any string, so a description
satisfies the letter. A citation that is prose about the creator cannot be
mechanically checked against a list of claims.

**Not yet fixed.** The fix is to require the citation to overlap the supplied
text rather than talk about it — which is a prompt change AND a stricter check,
and stricter checks on this path have twice produced false alarms. It should be
built with the same discipline: mutation-tested, and measured against a real
matrix before being believed.

---

## 12. The declaration has a hole exactly where the data is missing

**Measured.** Across 112 runs, **46 of 702 beats (6.6%) declared `product_dna` as
their substance source.** No product DNA was supplied to any of those runs — no
cohort-3 creator has a product entity, evidence, or any product field at all.

What those beats contain is invented product specifics:

> "The secret is the Smart Cooker's integrated sensors and pre-programmed settings."
> "Its advanced navigation lets it move seamlessly through your home."
> "Go into your settings, then accessibility, and find the 'Custom Actions' menu."

Those are **factual claims about products**, stated as fact, sourced to a
database that holds nothing.

**Why the check missed it.** `substanceIssues` verifies `creator_knowledge`
citations against what the prompt carried. It does not verify `product_dna` at
all — there was never any product DNA to verify against, so the branch was never
written. The result is worse than no declaration: a beat that would have been
caught as an unsupported creator claim is waved through by declaring a different
source instead.

⚖️ **THIS IS THE FAILURE MODE OF SELF-REPORTED ACCOUNTABILITY.** The declaration
was introduced because resolving every beat first would cost a second model
call. It works — 100% of beats declare — and the writer discovered the cheapest
route through it: name the one source nobody checks. Nothing here was
adversarial; it is what any optimiser does with an unpoliced option.

**Severity is higher than the fabricated personal histories.** An invented life
embarrasses the creator. An invented product capability — "integrated sensors",
"advanced navigation" — is a claim their audience may act on and a regulator may
read, attached to a product that is not even theirs.

**Not fixed.** The fix is not merely "check product_dna too". Every enum value
that has no verifier is a hole, so the rule should be inverted: a declared source
with no supplied data behind it is refused, whatever it is named. That is a
contract change and it should be built with a measured before/after, not asserted.

## 13. The scorer carried the same stale rule as the harness

`generate-blueprint` moved CTA permission from the video GOAL to the creator's
RELATIONSHIP. Two other places kept the old rule:

- `run-eval.mjs` sent "your goal is commercial, so a purchase CTA is
  appropriate" and none of the four claim rules production ships.
- `score-matrix.mjs` excused any case whose goal was `sell` or `leads` — so it
  reported **0 inappropriate sales CTAs across 112 runs**.

Re-scored against `relationshipCode`, those same 112 runs contain **16 purchase
CTAs and 7 spoken pitches on creators with no commercial tie to anything**:

> justice — "Link in bio to get your Smart Cooker!"
> jeremy — "Click the link in bio to build your $100K AI dropshipping store!"

A harness and a scorer that share the product's old rule cannot see the
product's bug. Both were fixed and pinned by
`harnessClaimRulesParity.test.ts`, which asserts the four branch conditions are
character-identical to the edge function's.

**After the fix, on the identical 112 cases: 16 → 0 and 7 → 0.**

## 14. The sell check could not tell a review from a solicitation

The first honest measurement of the fix reported 2 CTA leaks and 8 spoken
leaks. All ten were false. The pattern contained a bare `buy ` and a bare
`purchase`, so it flagged:

> "three products I'd never buy again"
> "Don't buy for the sake of buying. Buy for a solution."
> "What's one tech purchase you regret? Let me know in the comments!"

The last is the *engagement CTA the rule asks for*, scored as a violation. The
same class as defect 6: a checker that cries wolf trains its reader to ignore
it, and had I reported the raw count it would have looked like the fix had
failed. A pitch asks the viewer to transact or to go somewhere to transact —
that is decidable; a bare verb is not.

## 15. `product_dna` is an unchecked label, and pressure routes through it

`substanceIssues` validates citations only for `creator_knowledge`
(`knowledgeResolver.ts:345`). `product_dna` is accepted on the model's word.

No product DNA is supplied for any of these 8 creators. They still declared
`product_dna` on **46 beats before the fix and 70 after** — 9.9% of all beats,
citing things like:

> "The product provides a dedicated, clean, and effective charging spot."

Nothing supplied that. It is a fabrication wearing a label nobody checks, and
it grew by half when the claim rules made `creator_knowledge` harder to use
honestly. **Tightening a checked path pushes the same pressure onto the
unchecked one**, which is an argument for checking every declared source rather
than the one that was easiest to check first.

### ⚠️ RETRACTED: most of the "cost" I reported was noise

I reported that the claim rules cost substance — placeholder beats 6 → 17, hook
grounding 31% → 23%, `product_dna` 46 → 70 — and explained it as "prohibition
without substitution". **A replicate run with a byte-identical prompt does not
support that.** Three runs of the same 112 cases:

| | run 1 (old prompt) | run 2 (new) | run 3 (new, replicate) |
|---|---|---|---|
| placeholder beats | 6 | 17 | **7** |
| `product_dna`, none supplied | 46 | 70 | **96** |
| hook grounded in creator knowledge | 31% | 23% | **29%** |
| UNSUPPORTED citations | 13 | 9 | **14** |

Run-to-run variance on an UNCHANGED prompt (run 2 → run 3) is as large as the
change I attributed to the fix. Placeholders swing 17 → 7; `product_dna` keeps
climbing 70 → 96 with nothing changed. So the honest statement is that these
metrics **did not move measurably**, not that they got worse.

What survives three runs is the part with a large, one-directional gap:

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| purchase CTA, no commercial tie | 16 | **0** | **0** |
| purchase pitch in a spoken line | 7 | **0** | **0** |
| unearned first-person history | 11 | **2** | **1** |

**The lesson is the one this document keeps re-learning, arriving from a new
direction:** a single sample is an anecdote even when the tooling around it is
correct. Everything above was measured with a fixed harness, a fixed scorer and
an identical case list — and the cost column was still mostly noise, because
nobody had asked how noisy one run is. A delta is only a finding when it is
bigger than the variance of the thing that produced it.

`product_dna` is still a real defect — 46, 70 and 96 beats citing a source that
does not exist are all indefensible. What is NOT established is that the claim
rules made it worse.

---

## 16. A derived artifact whose source was not in the repo

`derived-references.json` — the 16 reference shapes every matrix run used —
could not be regenerated from this repository. The committed corpus held **4
creators and 86 captions**; the file claimed `actuallycarterpcs` support=29
against 14 available captions, and six of its references cited creators
(`realryankennedy`, `justicebuys1`, `kanekallaway`, `brett.tech`) that were not
in the corpus at all.

The corpus was sitting in a PR **stacked on this branch rather than on main**,
so merging in the obvious order would have silently orphaned it.

**Closed** by merging it first: 8 creators, 501 captions, and re-running
`derive-references.mjs` now reproduces the committed file byte-identically —
which is the proof, not the caption count. `scan-manifest.json` records the
exact actor and input per account so a fresh container does not re-spend Apify
credits rediscovering the two handle traps (`@CarterPCs` resolves to an
unrelated 146-subscriber channel; `@justicebuys` does not exist).

**The shape:** every number this document reports was measured with a fixed
harness and a fixed scorer — and one of the *inputs* was still missing from the
repo. Reproducibility is not a property of the tooling; it is a property of the
whole chain, and the weakest link was the one nobody thought to check.

---

## 17. The evidence ceiling is not what is making scripts empty

I have said repeatedly that transcript-based stance extraction is "not started"
and is "the big unlock". **Both halves were wrong**, and the correction matters
because it was steering the roadmap.

**It is already built and already runs.** `scrapeDna` takes the creator's top 5
videos by plays/likes and enqueues `build_voice`, which transcribes them and
calls `extractKnowledgeFromAudio` — the one path that can produce
`kind: 'experience'` with `basis: 'stated'`. `max_attempts: 1`, because a retry
re-runs paid transcript calls.

**And the "zero experience-level knowledge across 8 creators" figure I kept
citing is a fact about the QA CORPUS, not the product.** Those creators were
caption-scraped for research; `clampCaptionBasis` correctly forces caption
items to `demonstrated`. A real onboarded creator gets 5 transcribed videos.

### What the ceiling actually costs, measured

Captions clamp to `demonstrated`, so caption-only knowledge can never exceed
`coverage` — which means `position` ("I still think X is overrated") and
`history` ("I bought X") are both unreachable. All 479 items across the 8
creators are `coverage`. That sounds fatal. It is not:

| claim strength of a real generated beat | count | share |
|---|---|---|
| discussion — allowed on coverage | 1404 | **97.8%** |
| position — blocked | 24 | 1.7% |
| history — blocked | 8 | 0.6% |

Across 1,436 real beats from two full matrix runs, **the writer is already
writing 97.8% of its lines at a strength coverage-level evidence permits.** The
ladder is not what is holding it back. Raising the ceiling would unlock about
one beat in forty.

### What is actually missing: use, not permission

| | |
|---|---|
| beats whose words overlap a supplied knowledge item | **42%** |
| beats declaring `creator_knowledge` | 37% |
| share of a creator's stored knowledge that appears in ANY of 28 scripts | **12–36%** |

Production shows the writer 10 items per generation (topic-ranked) out of the
47–79 stored. That cap is a defensible relevance decision, not obviously a
defect — but the result is that **58% of beats touch none of the creator's
substance at all**, while 479 real specifics sit unused.

**⚠️ PARTLY WITHDRAWN BY DEFECT 18 — the 97.8% figure was produced by a
classifier that cannot see most first-person claims. Read 18 before relying on
anything below.**

**So the founding defect — voice-accurate, content-empty — is not primarily an
evidence-ceiling problem. The writer is permitted to say the things it already
knows, and mostly writes generic prose instead.** Transcripts remain worth
having (they are the only route to a personal history, and to the `position`
strength a strong opinion piece needs), but they are a second-order lever, and
I had them ranked first on a premise I never measured.

---

## 18. The claim classifier is blind, so the guard under-enforces

Defect 17 concluded that the evidence ceiling barely matters, because 97.8% of
generated beats were `discussion` strength. **That number was produced by
`claimStrength`, and `claimStrength` cannot see most first-person claims.**

Measured against the first real transcripts pulled for these creators:

| | |
|---|---|
| transcript sentences | 55 |
| containing "I" or "my" | 32 — **58%** |
| of those, classified `discussion` (no personal claim) | **31 of 32** |

It misses every one of these:

> "all things considered that was probably the best WWDC I've ever seen"
> "I never expected this fight to get this far"
> "I'm shocked", "I'm glad", "I'm not terrified for Dustin anymore"
> "I woke up early for this"

`HISTORY` matches a fixed verb list (bought/owned/used/switched/…) and
`POSITION` a fixed frame ("I think", "I'd say"). Ordinary speech does neither.

### It is not a measurement problem, it is an ENFORCEMENT problem

`claimStrength` decides, in production, whether a beat needs experience-level
evidence. Over the same 1,436 generated beats:

| | |
|---|---|
| first-person beats | 145 (10%) |
| …classified `discussion`, so waved through on coverage-only evidence | **118 — 81% of them** |

> "My 3D prints used to be so brittle, but then I started doing this one thing,
> and now they're consistently strong."

That is a fabricated personal history about a real creator, and the guard built
to stop exactly it scored the line as carrying no personal claim at all.

**Two conclusions, and the second is the uncomfortable one:**

1. Transcripts are NOT second-order. 58% of spoken sentences are first-person,
   against 0% reachable from captions. Defect 17 under-rated them because it
   counted with a broken ruler.
2. **Every "unearned first-person" count in this document is a floor, not a
   total** — including "11 → 2 → 1", which measured only the claims the pattern
   can see. The real number is unknown and larger.

⚖️ THE SHAPE, AGAIN: a guard is only as good as its detector, and a detector
nobody measured against real speech is a guess with a test suite. The tests for
`claimStrength` all used sentences I wrote, and I wrote them in the shapes the
pattern already matched.

---

## 19. 39/39 in-sample, 14/25 out — the fixture was overfitted

Defect 18 widened `claimStrength` against 39 real lines and reached 39/39.
I then pulled 25 lines from two creators who contributed nothing to that tuning
— Ryan Kennedy (long-form reviews) and Justice Buys (product shorts) — and
labelled them by reading, before running the classifier.

| | tuned-on (39) | held-out (25) |
|---|---|---|
| lexical verb lists (shipped) | **39/39** | **14/25 — 56%** |
| structural: tense + person | 36/39 | **20/25 — 80%** |

**Every miss is under-detection of an ordinary sentence:**

> "I've added a Ryzen 7 because I can afford this one."
> "for the longest time I was looking for a Windows laptop"
> "I've talked to their representatives"
> "this particular color is called Sapphire and I absolutely love it"

⚖️ **THE STRUCTURAL LIMIT.** A verb list cannot close over open-class speech —
the auxiliary carries the tense, not the verb. `I've <anything>` and
`I was <anything>ing` are histories regardless of which verb fills the slot, and
no list will ever contain them all. The structural rule scores 20/25 against
the lexical 14/25 on unseen creators, which is the same evidence from the other
direction.

**Now shipped**, after the false positives were closed and the blast radius
measured: held-out **24/25**, tuned 39/39, **zero** narration false positives
across both sets, and over the 223 stored scripts the escalation rate moves
4% → 6% of beats while the refund bar moves by one script (4 → 5, both 2%).
First-person beats waved through fall 118 → 82 → **72** of 145.

Two regressions the existing suite caught during the swap, both from the same
family as the original defect: the adverb slot lost `still` (the exact case its
own comment called out), and `\\w+ly` in a TS regex literal is a literal
backslash-w — three adverb slots were inert. Fixing that alone moved held-out
from 23/25 to 24/25.

The paragraph below records why it was held back first, because the sequence
matters: measure, then ship.

It was **initially not shipped**, because it introduced false positives of its own —
"in today's video, I wanted to make a comprehensive review" reads as a history,
and "I'm really curious what you guys think" as a position. Those are the
expensive direction: under-detection ships one bad line, over-detection refunds
a whole script. Shipping it without measuring that against the stored runs
would repeat the mistake this document already records twice.

**What is honest to claim right now:** the shipped widening is a real, measured
improvement (first-person beats waved through 81% → 57%, blast radius 4% of
beats, 2% of scripts) and it is *not* a correct detector. `heldOutSpeech.ts`
holds the 14/25 as a floor rather than a target, so the number is visible in CI
instead of being rediscovered.

---

## 20. More substance in the prompt buys variety, not use

The 10-item cap in `generate-blueprint` was the obvious suspect for "57% of
beats touch none of the creator's substance". Tested as a single variable — 8
creators x 4 non-commercial goals, 32 cases per arm, cap 10 against cap 25,
everything else byte-identical, harness selection first corrected to mirror
production's topic ranking:

| | cap 10 | cap 25 |
|---|---|---|
| beats whose words overlap a supplied item | 45% | **47%** |
| distinct knowledge items ever used | 39 | **60** |
| average breadth of a creator's store | 8.2% | **12.7%** |
| declared `creator_knowledge` | 44% | 38% |
| placeholders | 1 | 1 |

**2.5x the substance bought 1.5x the variety and NO change in use.** Showing
more items means more *different* items appear across scripts — real, and worth
having for a creator who does not want their fifth video repeating their first.
It does not move the number that matters: **the share of beats carrying nothing
of the creator's is flat at ~55% in both arms.**

⚖️ **SO THE CAP IS NOT THE CONSTRAINT.** The writer ignores most of what it is
handed regardless of how much is handed to it, which means the lever is HOW THE
PROMPT ASKS FOR SUBSTANCE, not how much it supplies. That is a prompt change,
and it is cheaper than any of the data work that was ahead of it in the queue.

Note the declared-source drift: `creator_knowledge` declarations fell 44% → 38%
while actual overlap held. With more items on the page the writer declares the
label slightly less often while using the substance just as much — a reminder
that the declaration is the model's word about itself, and only the overlap
measurement is evidence.

---

## 21. ⚠️ CORRECTED: the 81% was measured with the wrong knowledge selection

**The headline below is wrong and the correction matters more than the finding.**

The 81% was computed over runs where the QA harness supplied the **12
most-frequently-seen** knowledge items. Production supplies **10 ranked by
lexical overlap with the video's subject**. I fixed that divergence (defect 20's
setup) and re-measured on a production-mirroring arm: proof beats — evidence,
item, demo — are **25% empty, not 81%**.

I flagged this exact risk when I fixed the selection ("those numbers described
the harness") and then quoted the 81% anyway in the next commit. A number
survives its own retraction if you keep repeating the headline.

### And the fix aimed at it did not work

A prompt rule requiring an evidence beat to name a specific from the supplied
lists or declare `needs_user`, tested as one variable against the same 32 cases:

| | baseline | + evidence rule |
|---|---|---|
| beats overlapping a supplied item | 45% | **41%** |
| body beats carrying nothing | 53% | **57%** |
| proof beats carrying nothing | 25% | **45%** |
| superlatives ("unmatched", "seamless") | 10 | **6** |
| `needs_user` escalations | 0 | 0 |

The one thing it did was reduce superlatives. Everything it was aimed at moved
the wrong way. **Reverted** — a prompt rule that adds two hundred words and
demonstrates no benefit is the prohibition-without-substitution pattern this
document already retracted once.

⚖️ **AND THE HONEST CAVEAT ON MY OWN NEGATIVE RESULT:** 22–28 proof beats per
arm is far too small to conclude harm either. The placeholder metric swung
6 → 17 → 7 on an unchanged prompt at four times this sample size. What is
established is the absence of evidence FOR the rule, which is enough not to
ship it, and not enough to call it harmful.

---

## 21b. (superseded) The beat named "evidence" is 81% content-free

If 55% of beats carry none of the creator's substance, the charitable reading is
that a script legitimately contains transitions and CTAs. Measured by section
over 1,436 real beats, that reading does not survive:

| section | beats | carrying none of the creator's substance |
|---|---|---|
| cta / call-to-action | 153 | 72% — **legitimate**, a CTA needs no substance |
| hook | 172 | 44% |
| item | 155 | 45% |
| conclusion | 40 | 43% |
| **evidence** | 32 | **81%** |

Excluding every CTA and outro moves the total from 57% to **55%**. The body of
the script is empty at essentially the same rate as the whole.

**And the `evidence` beats are the founding defect in miniature.** Verbatim:

> "First, its design is incredibly unique, unlike anything else on the market."
> "the seamless integration with your iPhone is what truly sets it apart. It just works."
> "And third, the practical utility it offers is unmatched."

A beat whose declared job is to PROVE something, containing three superlatives
and no fact. Voice-accurate, content-empty, in the one section that cannot
afford to be either.

⚖️ **THE TARGET THIS GIVES THE PROMPT WORK.** Defect 20 showed the lever is how
the prompt asks, not how much it supplies. This says where to aim: an
evidence-or-item beat should be required to name a specific from the supplied
list or declare `needs_user` — the same either/or the substance declaration
already applies to sources, applied to the beats whose entire purpose is to
carry one.

---

## The pattern

Six of these were invisible to a green suite and appeared only under real data.
The common shape is **a claim about the world encoded as a claim about code**:

| The code says | The world says |
|---|---|
| `.from('ops_alerts')` | no such table |
| migration committed | migration never applied |
| handle resolves | wrong person |
| `basis: 'stated'` | it was a headline |
| rules are correct | nothing calls them |
| citation unsupported | citation was fine |
| kind filtered | kind silently lost |
| reference transfers | it demanded a life the creator never lived |
| citation supplied | it described rather than quoted |
| source declared | the source holds no data at all |
| 0 sales CTAs | 16, and the scorer shared the harness's stale rule |
| sell leak found | it was a review saying "never buy this" |
| `product_dna` | nothing was ever supplied under that label |
| one rule, one place | four copies, three of them stale |
| the fix cost us substance | one sample, and the noise was bigger |
| results are reproducible | the corpus they came from was not committed |
| transcripts are the big unlock | already built, and worth ~1 beat in 40 |
| the prompt needs more substance | it ignores over half of what it already has |
| half-empty is just script shape | 55% with every CTA excluded |
| the beat proves the claim | 25% prove nothing — and 81% was the harness again |
| the ladder blocks the good lines | 97.8% of lines were already permitted |
| 97.8% of lines were permitted | the classifier could not see the other kind |
| the guard caught 11 fabrications | it saw 11; it was blind to 81% of the candidates |
| 39/39 on the fixture | 14/25 on creators it had not seen |

**The standing lesson**, already in this repo's rules and re-earned today: a
contract check beats a prompt rule wherever the defect is decidable — and where
it is *not* decidable, the system must show a human what it found and ask, rather
than choose silently.
