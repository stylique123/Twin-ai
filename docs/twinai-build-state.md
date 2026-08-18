# TwinAI — build state: what is done, what is left, what is next

> **This file is the answer to "where are we".** It is not a new plan. Every
> item below already exists in `twinai-master-build-plan.md` (the phases),
> `twinai-one-build-plan.md` (the tracks) or `twinai-open-items-ledger.md` (the
> findings); what did not exist was one page you can read in two minutes that
> says which of them are finished, which are not, and which one is next.
>
> ⚠️ **KEEP IT HONEST OR DELETE IT.** A status page that drifts is worse than no
> status page, because it is believed. When an item ships, move it — do not add
> a second line saying it also shipped. When a claim here is checked and found
> wrong, correct it in place and say so in the log at the bottom; the ledger's
> own D5 row is the precedent, where this document's ancestor reported an open
> item that had been closed months earlier.

---

## The founding defect, restated

Twin writes **voice-accurate, content-empty scripts.** It learns how a creator
sounds and then has nothing for them to say. Every track below is either
closing that gap or is infrastructure that lets a track close it.

---

## 1. THE RENDER TRACK — Phases 9 to 13

### Phase 9 — the render truth layer · **COMPLETE (10/10)**
Caption emphasis, brand colours, zoom time-gating, loudness measurement, free-tier
mark, language pin, face-aware zoom. Its final item closed by overturning its own
premise: the caption collision was the platform ACTION RAIL (horizontal), not the
bottom caption block.

### Phase 10 — stop guessing · **mostly done, two items open**
| item | state |
|---|---|
| 1 · Provenance stamping on every DNA field | **done** |
| 2 · Onboarding questions + confirm screen | **done**; the five-question redesign remains a product-design pass, not a contract gap |
| 3 · Script-anchored forced alignment | **partly** — two consumers still dark |
| 4 · Transcript-as-editor review gate | **contract built, screen is not** |
| 5 · Failure path | **done** |

*Item 3's remainder is not plumbing.* False starts need an `alignment-2` schema
bump — the component records `insertionCount`, and a count cannot distinguish a
restart from an ad-lib. The exact hook boundary needs a director-eval run: the
envelope change is a few lines, but changing what the model SEES is the risk.

### Phase 11 — the take itself · **the highest-risk area, and the least built**
| item | state |
|---|---|
| 6 · Preflight check before recording | **NOT BUILT** — room echo, backlight, orientation, head cropped, mic source |
| 7 · Teleprompter design | partly; the re-hook deletion bug is fixed |
| 7a · Differentiate on the script's own per-scene structure | decided, not built |
| 8 · Edit the script BEFORE filming | **NOT BUILT** |
| 9 · Capability flags | **done** (0103; three states, `unset ≠ false`) |

Item 6 is what the panel called its **#1 gap**: nothing in the pipeline addresses
the actual failures of video #1.

### Phase 12 — show the right thing · **built**
Declared `[SHOW: …]` clips, container resolution with fallbacks, screen recording
as a clip type — all shipped. One piece deliberately left to an eval: **where an
overlay goes**. That needs a `DirectorClipRequest`, which changes the Director
bundle identity, and this project has an eval harness precisely so that call is
measured rather than reasoned.

### Phase 12a — after the render · **partly built**
The plan ended at "Make my video"; the creator's job ends at "posted". Cover and
caption already existed; placement and the generate-once guarantee were added.

### Phase 13 — don't all look the same · **half**
| item | state |
|---|---|
| 15 · Output variation + 3 moods (calm / normal / punchy) | **NOT BUILT** |
| 16 · Creative Transfer page, honest OBSERVED / NOT OBSERVED | **done** |

---

## 2. THE KNOWLEDGE TRACK — what the creator has to say

This is the track that attacks the founding defect directly. It ran in three
phases and they are all shipped:

| phase | what it was | state |
|---|---|---|
| 1 | The entity contract — type × relationship × personal_use, and a correction: an owned entity is minted once and never re-asked | **done** |
| 2 | Entity types + the restriction union | **done** |
| 3 | Link ingestion — paste a URL, extract, confirm | **done** |

Plus: the Product Library page, the attestation flow (claim a suggestion),
`productEvidence` on the entity, `canBeShown`, and the supply check (#367).

**The one thing this track cannot do for itself: `product_entities` is empty in
production.** Every rule is built and tested; no creator has filled a library.
Until one does, `slotFill` has nothing to match against for a real person.

---

## 3. THE SCRIPT-INTELLIGENCE TRACK — better scripts, not just better voices

| item | state |
|---|---|
| Style Compiler — DNA labels → operational writing behaviour | **done** |
| Reference premise compatibility, before premise selection | **done** |
| Deeper transcript knowledge extraction | **done** |
| Content history — what Twin has already written | **done** |
| Current-video intent, lightweight (three questions, plain English) | **done** |
| `selected_hook` was a free-text instruction channel | **fixed** |
| ProfileAssembler → CreatorProfile, deterministic for confirmed answers | **done** |
| Creative Decision Plan — schema + deterministic validators | **done** |
| Video Plan | **premise disproven — deliberately NOT built** |

---

## 4. THE GALLERY — §7a, and the live front

The 2026-08-05 finding: **six of the seven ranking signals could not be
computed.** A gallery card carried a niche, a platform, a creator, a marketing
sentence and two engagement numbers — nothing about what the video is structured
like or what it takes to shoot.

### Pass 1 — transcripts → `ReferenceContentProfile`
| piece | state |
|---|---|
| `Assessed<T>` — four-state provenance | **done** |
| `ReferenceContentProfile` — the frozen artifact | **done** |
| `parseContentExtraction` — the validator | **done** |
| Deterministic stratified pilot sampler | **done** |
| `assess_reference` job + `0142` table | **done, applied** |
| Ownership refusal (an owner's sentence cannot be borrowed) | **done** |
| `slotFill` — "3 of 3 ready" | **done** |
| Four-creator divergence test on fixtures | **done — and it found a real bug** |
| 35-video pilot on production | **done — and it found two more** |
| The remaining ~3,500 videos | **NEXT** |

### Pass 2 — frames → `ReferenceVisualProfile`
**NOT STARTED.** The seam exists: `ReferenceVisualProfile` ships empty, and
`frameSampleTargets()` reads Pass 1's beat timestamps to tell Pass 2 where to
look. The pilot's ~20% `no_speech` rate is the argument for starting this
sooner than planned — those videos are invisible to Twin entirely today.

### The screen
**NOT BUILT, and this is the gap that matters most.** `GalleryCreatorView`,
the eligibility rules, the refusals and the ranking all work in tests and reach
no creator. A full library of perfect profiles would change nothing on screen
today. Remaining: wire it into the real Gallery page, redesign the card so
"your products cover all 3" is legible, and build the intelligence drawer that
explains a card per slot.

---

## 4a. THE SCRIPTING REBUILD — the ordered track (owner's spec, 2026-08-18)

**One target, and everything else is plumbing:** *a good Twin script says
something worth saying, is true, fits the creator, and is easy to speak aloud.*

⚠️ **THE DIAGNOSIS THAT SETS THE ORDER.** The problem is no longer "the writer
needs a better instruction". It is that **the writer is asked to invent content
nobody supplied**. A generic script is usually not bad prose — it is prose with
nothing specific inside it. So content resolution comes BEFORE prose, and no
further week goes into the raw writer prompt ahead of it.

### The pipeline

```
CreatorProfile + VideoIntent + ReferenceContentProfile + ProductLibrary
        ↓  PREMISE SELECTOR      topic · angle · why_this_creator · why_this_audience
        ↓  SMALL CDP             decisions only, no prose
        ↓  CONTAINER RESOLVER    every slot filled, with its source
        ↓  RESEARCH              only where a slot demands it
        ↓  WRITER                resolved inputs only — five things, not ninety-four
        ↓  SPEECH POLISHER       easier to say, same facts
        ↓  VALIDATOR             binary checks, three judgements
        ↓  FINAL SCRIPT
```

### The writer gets five things, not the account

`creatorStyle` · `audience` · `decisionPlan` · `resolvedContent` ·
`referenceStructure`. No raw onboarding, no whole DNA blob, no Product Library
dump.

### Build order

| # | item | state |
|---|---|---|
| 1 | Small CDP schema — goal, audience, topic, angle, format, length, products, hook, structure, CTA, restrictions, sources | **next** |
| 2 | Container taxonomy — 10–15 containers, each with a template | not built |
| 3 | Container resolver — every slot filled or explicitly research-required | not built |
| 4 | Content-source routing — product / creator / research | not built |
| 5 | Writer receives resolved inputs only | not built |
| 6 | Speech-polish pass — may not add claims, change facts, CTA or premise | not built |
| 7 | Simple validator — binary checks, then three judgements | not built |
| 8 | Six scenario tests | not built |
| 9 | A real creator records 10 videos | **not started — and it gates everything** |
| 10 | Inspect spoken-script differences | after 9 |

### Rules this track carries

- **Facts and opinions are separate classes**: `verified_fact`,
  `user_confirmed`, `creator_opinion`, `researched_fact`, `safe_inference`,
  `forbidden`. The writer may never turn an opinion into a factual claim.
- **Audience level changes wording, in the Style Compiler** — beginner explains
  terms, familiar moves faster, expert skips the introduction. Not a line near
  the top of a 12,000-token prompt.
- **DNA is behavioural, not adjectival.** "Open directly; avoid long setup" is
  followable; "Tone: bold" is not.
- **Write for speech**: mostly 6–16 words, fragments allowed, no nested clauses
  or essay transitions.
- **`product_role` — `none` / `example` / `supporting` / `primary`** — the one
  small field that stops every founder video becoming an advert.
- **The specificity test**: could this script go unchanged to 100 other
  creators? If yes it fails.
- **No score out of ten.** Binary where possible; `pass` / `weak` / `fail` for
  the three that cannot be.

### The six scenarios that decide whether it is real

Own SaaS + sell · Own SaaS + authority (must not become an advert) · Affiliate
with no confirmed use (must never invent "I've used it") · Expert educator
(must skip the basics) · Non-commercial creator (must never invent an offer) ·
Cross-niche reference (transfers structure, replaces content).

### Success, measured on ten real attempts

Relevance 8/10 · usefulness 8/10 · voice 7/10+ · speakability 8/10 · **zero**
serious invented facts · pre-record edits under 20% of words, eventually 10–15%
· and the one that matters most: **script → recording started → recording
completed.** A script admired in Review and never recorded is not good enough.

---

## 5. STANDING RULES — these outrank convenience

- **No B-roll.** An explicit product scope decision, not an omission.
- **Plain English everywhere a creator reads.** A first-time creator with no
  marketing knowledge understands every choice in under two seconds. No internal
  product terms, no jargon, no options that need explaining to tell apart. And
  never make the creator think about Twin's internal architecture.
- **Never widen a security or ref check because deployment is inconvenient.**
- **Freshness stays dark** until there is real publication/performance data. An
  empty column is not a reason to fill one.
- **Silence is not "no".** `unset ≠ false`; `not_checked ≠ indeterminate`.
- **Real footage before more features.** No human has recorded a video yet.

---

## 6. WHAT IS BLOCKED, AND ON WHOM

| item | blocked on |
|---|---|
| Edit pairs as a ranking signal | ~100 accepted finals; there are 0 |
| `slotFill` against a real creator | a filled Product Library |
| The exact hook boundary (Phase 10 item 3) | a director-eval run |
| Where an overlay goes (Phase 12) | the same eval harness |
| Rotating the leaked service role key | **the owner** |
| The 689 `explore/tags/` hashtag rows — hide / delete / leave | **the owner** |

---

## Log

| date | change |
|---|---|
| 2026-08-18 | §4a added — the scripting rebuild, in the owner's stated order. |
| 2026-08-18 | Written. Consolidates the phase plan, the track plan and the ledger into one status page, because "what is left" could not be answered without reading three documents totalling ~5,000 lines. |
