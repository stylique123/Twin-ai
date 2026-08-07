# The test kit — paste-ready runs, and what each one proves

**Purpose:** produce a BASELINE on what production runs today, so that when the
Composer, beat plan, `workKind` and visual hook deploy, the same inputs can be
run again and diffed. Without the baseline the second run proves nothing.

**Production is at `814bf51`.** It has `promotes` wired and none of the rest.

**Cost:** each generation is 10 credits. The full kit below is 4 generations,
40 credits, plus 1–2 recordings.

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

### What the REFERENCE video needs to be

- **A format, not a topic.** Something whose STRUCTURE could carry a different
  subject: a teardown, a myth-bust, a before/after, a day-in-the-life.
- **Under 90 seconds**, so the beat structure is legible.
- **Talking-head or screen-led**, not something that only works with a crew.
- **Same one for runs 1–3.** Changing it breaks the control.

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

> **What it proves:** on today's code `workKind` reaches no prompt, so the
> script should come back **materially the same shape** — same beat structure,
> same kind of hook, same register. Some wording will differ because the model
> is not deterministic; that is noise, not signal. **What matters is whether a
> regulated professional and a hobbyist get recognisably different scripts.**
>
> If they DO come back meaningfully different, my diagnosis is wrong and I want
> to know before building further on it.

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
| 5 | Run 2 is materially the same as Run 1 | `workKind` already works and A2 is redundant |
| 6 | CTA ownership language IS correct for `promotes` | the merge did not take |
| 7 | `[SHOW: …]` names nothing specific | product evidence already reaches the script |

**Predictions 3 and 5 are the load-bearing ones.** They are the two mutations,
and if either comes back different, a piece of what I built today is aimed at
the wrong target.

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
