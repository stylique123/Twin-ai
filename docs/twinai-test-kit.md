# The test kit — paste-ready runs, and what each one proves

**Purpose:** produce a BASELINE on what production runs today, so that when the
Composer, beat plan, `workKind` and visual hook deploy, the same inputs can be
run again and diffed. Without the baseline the second run proves nothing.

> ## ⚠️ UPDATED 2026-08-09 — what changed under this kit
>
> This kit was written when production had **`promotes` wired and none of the
> rest**. Three things have shipped since, and one of them **inverts what Run 2
> proves**:
>
> | Shipped | Effect on this kit |
> |---|---|
> | **`workKind` + `workKindOther` now reach the prompt** (#294) | **Run 2 flips.** It used to prove the answer was dead; it now proves the wiring is live. Prediction 5 is inverted below. |
> | **Reference `mode: 'pattern'` refuses before spend** (#307) | A reference Twin cannot read now costs **0 credits** and says why. Trying links is free — only a successful build is billed. |
> | **A failed take now names its cause** (#308) | If a recording will not save, the screen says which of the five failure paths fired instead of silently hiding the edit button. |
>
> `goal`, `productEvidence` and `alsoWantsToMake` are **still unread**, so Runs
> 3 and its prediction stand exactly as written.

**Cost:** each generation is 10 credits. The full kit below is 4 generations,
40 credits, plus 1–2 recordings. **Failed reference reads are free**, so a dead
link costs time and nothing else.

---

## PART A — THE ONE THING TO GET RIGHT FIRST

**Runs 1, 2 and 3 must use the SAME handle and the SAME reference video.**

Only one answer changes between them. That is what makes them a controlled test
rather than three interesting videos: if the output is identical when the answer
changes, the answer is dead — and that is a fact, not an impression.

Run 4 is the only one that changes creator.

---

## PART B — CHOOSING THE HANDLE AND THE REFERENCE

**Pick these yourself.** Two reasons, and the second is the real one:

1. My knowledge has a cutoff and handles change. A handle I recommend that has
   been renamed or deleted costs you a scan and tells us nothing.
2. **You need to be able to judge whether the output is good.** For a creator
   you do not know, neither of us can tell a bad script from an unfamiliar one,
   and that judgement is the entire point of running this.

### What CREATOR A needs to be (runs 1–3)

- **Posts regularly** — a thin scan produces thin DNA and we would be testing
  the scan, not the script.
- **Talks to camera** in at least some posts, so a talking-head script is a fair
  ask.
- **Has a clear niche** you can state in one line.
- **Ideally one you follow**, so you can tell whether the voice is right.

### What CREATOR B needs to be (run 4)

**As different from A as you can find.** If A sells software, B sells a physical
object. If A is a solo creator, B is a business. The point of run 4 is to see
whether two genuinely different creators get genuinely different videos, or
whether the same skeleton comes back wearing different words.

### ⚖️ The strongest Creator A is YOUR OWN handle

Added 2026-08-09, because it resolves the objection above rather than working
around it. Your own account is the only one where **you can tell a right voice
from a plausible one instantly** — which is the entire judgement this test
exists to make. It is also the account whose Product DNA you will build first,
so the baseline stays useful after this kit is finished.

Use a second, unrelated real account for Creator B.

### What the REFERENCE video needs to be

- **A format, not a topic.** Something whose STRUCTURE could carry a different
  subject: a teardown, a myth-bust, a before/after, a day-in-the-life.
- **Under 90 seconds**, so the beat structure is legible.
- **Talking-head or screen-led**, not something that only works with a crew.
- **Same one for runs 1–3.** Changing it breaks the control.

**Only four hosts can be read** — TikTok, Instagram, YouTube and youtu.be. Any
other link is refused before spend, for free, and says so.

**A 30-second way to find one.** Open TikTok or Reels and search a format
phrase rather than a topic, because a format is what transfers:

```
"3 things I stopped"      "nobody tells you about"
"I was wrong about"       "the mistake everyone makes"
"before and after"        "what I'd do differently"
```

Take the first result that is under 90 seconds, is someone talking to camera,
and whose structure could carry a completely different subject. Copy the share
link. **Do not optimise this choice** — the control matters far more than the
pick, and a reference Twin cannot read now costs nothing to try.

---

## PART B2 — THE ANSWER SHEET

Paste-ready. Only the **bolded** cell changes between runs.

| Field | Run 1 (baseline) | Run 2 (`workKind`) | Run 3 (`goal`) |
|---|---|---|---|
| Handle | your handle | same | same |
| Reference | Reference R | **same R** | **same R** |
| Goal | the true one | same | **the opposite one** |
| Audience | one specific line | same | same |
| Offer | the real offer | same | same |
| What do you do | the honest chip | **the furthest-away chip** | the honest chip |
| Videos promote | the honest answer | same | same |
| Forbidden claims | honest, if asked | same | same |
| Tone / fidelity | defaults | defaults | defaults |

**Audience — write a line, not a category.** *"Solo founders who've shipped
something and can't get anyone to watch it"* is usable. *"People interested in
AI"* is not, and the difference will show in the script.

**Goal opposites for Run 3:** `Drive sales` ↔ `Entertain`, or `Generate leads`
↔ `Grow audience`. Pick the pair that is furthest apart for you and watch the
**CTA beat** specifically.

**`workKind` opposites for Run 2:** if Run 1 was `creator`, use `professional`.
If `saas`, use `ecommerce`. The point is maximum distance, not plausibility.

**Run 4** is Creator B with their own honest answers and, if it still fits, the
same reference.

---

## PART C — THE FOUR RUNS

### RUN 1 — BASELINE
*Everything answered, as honestly as you would for real.*

| question | what to enter |
|---|---|
| Handle | Creator A |
| Goal | pick the one that is actually true |
| Audience | one specific line, not "everyone interested in X" |
| Offer | the real offer, or leave untouched if there is none |
| What do you do | the honest chip |
| What do your videos promote | own product / affiliate / nothing to sell |
| Forbidden claims | if the chip triggers it, answer it honestly |
| Reference | Reference R |
| Tone / fidelity | leave both at their defaults |

**This is the "before" everything else is measured against.** Save the whole
output.

---

### RUN 2 — THE `workKind` MUTATION
*Identical to Run 1, except one chip.*

Change **only** "What do you do" to something as far from the truth as the
chips allow. If Run 1 was `creator`, use `professional`. If it was `saas`, use
`ecommerce`.

> **What it proves — INVERTED as of #294.** `workKind` and `workKindOther` now
> reach the prompt as *"What they do: this creator …"*, beside Audience and
> Offer. So this run is no longer a test of a dead field; it is the
> **acceptance test for the wiring**.
>
> The script should now come back **recognisably different** — a regulated
> professional and a hobbyist should not get the same register, the same
> assumed expertise, or the same CTA posture.
>
> **If it comes back materially identical, the wiring did not take**, and that
> is a bug in #294 rather than a finding about the product. Check
> `pre_script_brief.workKind` actually stored the changed chip before blaming
> the prompt: an answer that never persisted cannot change an output, and that
> failure looks identical from the outside.
>
> ⚖️ This is the one run whose meaning changed today. Any earlier notes
> predicting "no difference" describe the old build.

---

### RUN 3 — THE `goal` MUTATION
*Identical to Run 1, except the goal.*

Change **only** the goal, to the most opposite one available: `sell` ↔
`entertain`, or `leads` ↔ `followers`.

> **What it proves:** the brief's `goal` is never read. Generation takes goal
> from the voice profile, then `profiles.dna`, then the literal string
> `'turn attention into trust'`. **So the CTA should barely move.**
>
> Watch the CTA beat specifically. If you pick "sell" and still get "follow for
> more", that is the defect, visible.

---

### RUN 4 — A DIFFERENT CREATOR ENTIRELY
*Creator B, their own honest answers, and the SAME reference if it still fits.*

> **What it proves:** whether the DNA does real work. Two creators in different
> businesses, given the same reference, should not produce the same skeleton
> with swapped nouns. This is the one run testing the part that already works,
> so it is also the check on whether the scan is worth what it costs.

---

## PART D — WHAT TO CAPTURE

Raw paste. Do not tidy it — formatting choices hide things.

**From every run:**

1. **Every scene with its estimated seconds.** The single most important number
   in this whole exercise.
2. The hook, and anything at all about what is ON SCREEN at the start.
3. The CTA beat, word for word.
4. The background / framing / posing lines from **three** scenes.
5. Any `[SHOW: …]` or `[SHOW SCREEN: …]` markers.
6. The shot list.
7. Anything that made you wince. Trust that reaction; it is data.

**One extra thing, and it is the most valuable:**

> **Would you actually film this? If not, what is the first thing you would
> change?**

---

## PART E — THE RECORDINGS

**One or two, on the run whose plan you liked most.**

Do not perform. Follow the plan exactly as written, including the parts that
feel wrong, because how it fails is the finding.

Note as you go:

- **Which scenes ran over their estimate, and by how much.** This is the direct
  test of the scene-length defect.
- Where you had to invent something the plan did not tell you: where to stand,
  what to hold, where to look.
- Where you stopped, re-read, and started again.
- Whether the teleprompter pace matched how you actually talk.

---

## PART F — PREDICTIONS, RECORDED BEFORE THE RUNS

Stated now so this is a test rather than an explanation of whatever arrives.

| # | prediction | if it fails |
|---|---|---|
| 1 | Scene seconds vary widely with no logic — some 3s, some 15s | the beat plan is solving a problem that does not exist |
| 2 | Nothing describes the opening VISUAL, only the opening words | `visual_hook` is unnecessary |
| 3 | Run 3's CTA barely differs from Run 1's | `goal` is already wired and I misread it |
| 4 | Background guidance is generic, likely the literal "Clean, well-lit background" | the shoot plan is already specific enough |
| 5 | **INVERTED (#294).** Run 2 is materially DIFFERENT from Run 1 — different register and assumed expertise | the `workKind` wiring did not take; check the brief stored the changed chip before blaming the prompt |
| 6 | CTA ownership language IS correct for `promotes` | the merge did not take |
| 7 | `[SHOW: …]` names nothing specific | product evidence already reaches the script |

**Predictions 3 and 5 are the load-bearing ones**, and they now point in
opposite directions, which is what makes the pair worth running:

- **Run 3 should barely move.** `goal` is still unread — three authorities beat
  the creator's own answer, ending in a hardcoded string. A CTA that ignores
  "sell" is the defect made visible.
- **Run 2 should move.** `workKind` is wired now. This is the acceptance test.

If Run 2 does *not* move, the wiring is broken. If Run 3 *does* move, `goal`
was already reaching the prompt by a path I did not find, and step 3 needs
re-scoping before it is built.

**Misses matter more than hits.** Anything bad in the output that is NOT on this
list is a gap in my diagnosis, and those are worth more than seven confirmations.

---

## PART G — THE HONEST LIMIT

**One run cannot separate "the pipeline is weak" from "the model had an off
day."** The useful question about anything disappointing is:

> **Was it structurally impossible, or merely done badly this time?**

A missing visual hook is structural — no field exists to hold one. A flat hook
LINE is not; that is a model outcome and a rerun might fix it.

The mutation runs exist precisely because they are immune to this. Run 1 versus
Run 2 is the same model, the same temperature, the same reference, and one
changed answer. That comparison survives a bad day.
