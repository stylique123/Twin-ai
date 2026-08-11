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

Alongside it, in the same run: placeholder beats 6 → 17, and hook grounding
31% → 23%. The prohibition removed false content without supplying true
content, so the writer reached for a bracket instead. Prohibition without
substitution moves a defect; it does not close it.

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

**The standing lesson**, already in this repo's rules and re-earned today: a
contract check beats a prompt rule wherever the defect is decidable — and where
it is *not* decidable, the system must show a human what it found and ask, rather
than choose silently.
