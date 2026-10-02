# The angle picker: research, then build

This responds to the owner brief of 2026-10-01. The data comes from production on that date.

## Part 1: Research, answered from Twin's own corpus

Source: about 4,000 short-form videos from the corpus that have both a hook type and a reach figure. They were grouped into 6 angle families. For each niche bucket, the table compares two shares: the family's share of all videos, and its share of the **top-quarter-by-reach** videos.

| Niche | Over-performs at the top (all → top 25%) | Under-performs |
|---|---|---|
| education | teach/list 25% → **52%** | contrarian claim 50→30, problem-question 14→4 |
| mindset | teach/list 11 → **24** | contrarian 81→72 |
| entertainment | teach/list 6 → **19** | problem-question 16→9 |
| beauty & fashion | teach/list 17 → **32**, result-first 10→14 | contrarian 66→51 |
| food | result-first 41 → **42** (it is the leader), teach/list 10→19 | problem-question 5→3 |
| making | result-first 32 → **36**, teach/list 38→39 | contrarian 24→19 |
| health | teach/list, plus curiosity 3→7 | contrarian 46→42 |

**1.3.1 Does one set of angles hold everywhere?**

- Not as one ranked list.
- Teach/list over-performs in every niche.
- Result-first is the top angle wherever there is something to show (food, making).
- The bold or contrarian claim is the most common angle, yet it under-performs everywhere.
- Opening on a problem or a question under-performs almost everywhere.
- The "four angles" framework from the brief holds only partly: its "answer first" type matches result-first, but its "problem first" type does not win in this corpus.
- **Decision:** rank per niche, from the measured lift (`NICHE_ANGLE_LIFT`).

**1.3.2 How her DNA should shape the offer**

Her voice profile's `hook_patterns` and `hook_style` lift the angle her voice already uses:
- confession / "the day I…" patterns → the story angle;
- "N things / how to" → teach/list;
- "stop / never / wrong" → contrarian.

Her voice is ranked first, then her niche's winners.

**1.3.3 What counts as genuinely different**

Each of the 3 options must be a different *kind*, meaning it changes what the viewer watches, not the wording. `cleanAngles` drops a second option of the same kind, the same rule the hook sets follow.

**1.3.4 What a high-retention angle looks like in each niche**

Concrete examples per family are already in the hook-move research (`niche-scripts-2026-10-01.md`), drawn from the same corpus.

## 2.3 New step, or an upgrade of "Reading this as"?

**Decision: an upgrade, not a parallel system.**
- Purpose (why the video exists) and angle (which direction it takes) are different layers, so both are shown.
- They come from the **same single cheap call** (`idea_questions`) on the same card, before any script is written.
- The cost is the purpose-guess call plus about 300 output tokens. There is no extra call and no extra step.

## 2.4 What was built

- **The call:** `idea_questions` now also returns 3 angles: one plain sentence each, in her terms, with no number she did not write. They are ordered by her voice, then her niche's measured winners.
- **The card:** shows "Which way should this video go?" with the 3 options. The first is pre-selected and she can tap another. Nothing expensive runs until she presses build.
- **The writer:** receives an angle contract: hook_options[0] opens this angle, and the body delivers it to the end with no drift. The pick is stored as `blueprint.angle_choice` (kind, gist, what was offered).
- **The lesson:** picking an option other than Twin's first becomes a `prefer` lesson (source `angle_pick`), through the same `learn_lesson` path hook picks use. Taking Twin's first teaches nothing.

## 2.5 Still to verify on real scripts

The brief asks to re-run the thin-input, multi-product and business-vs-product tests and to confirm that each script delivers the angle it promised.

That needs real generations: test scripts made by the owner, or `HEARTBEAT_USER_PASSWORD`. Each generation now records `angle_choice` and `hook_moves`, so the check is a query, not a judgement call.
