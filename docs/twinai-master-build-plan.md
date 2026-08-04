# TwinAI — Master Build Plan

**Status:** living document. This is the consolidated plan of record.

> ### ⚠️ READ THIS FIRST — sections 1–8 are HYPOTHESES, not decisions
> A fresh 4-person panel reviewed this document and found its weakest
> assumption: **the raw take is treated as a solved input.** Everything here
> optimises which sentence to cut and which clip goes where, on top of a
> recording step nobody has ever observed. The real video-#1 failures are bad
> room audio, a backlit window, a cropped head, a phone in landscape, eyes
> reading below the lens, and a monotone teleprompter delivery. **This plan has
> no mechanism for any of them** — and §4.1 deletes the only screen where they
> could have lived, conflating *technical vocabulary* with *the technical
> problem*.
>
> The rules below are written in the register of decisions ("Hard rule:",
> "Absolute rule:") — the register that makes a team stop testing them. The
> renderer earned that voice with evidence. The creative half has not.
> **Apply §2.1's own provenance schema to this document**: every rule needs a
> `source: observed` stamp before it is treated as settled.
**Sources:** a 10-person user panel run over two rounds; three independent
codebase audits (transcription/captions, cuts/hooks/zooms/framing,
branding/output); the Phase 8/9 render rebuild; and the founder's
information-architecture critique.

---

## 0. THE ONE IDEA

The renderer already solved this problem. `EditPlanV1` is a validated,
versioned, hashed contract. `ffmpegGraph.ts` reads it and **executes**. An
instruction it does not understand is a hard failure — never a substitution,
never an approximation. That discipline is why the editing half is the
strongest part of the system.

**The creative half has no contract.** One AI call is researcher, strategist,
writer and director simultaneously, and nothing records what it decided or why.

> **Build the Creative Plan with the same discipline as the Edit Plan.**
>
> Whoever decides, decides. Whoever executes, executes.
> Nothing in the middle invents anything.

And the operational form of that rule:

> **Every time the machine would have to guess, ask instead — at the moment
> the person already knows the answer.**

The audience, while the brand scan is already loading. What is in the clip,
while they are filming it. Which line to cut, while they are reading it back.

**CORRECTED BY PANEL — the original framing said "each costs the user seconds."
That is wrong. The cost of a question is the DECISION, not the seconds.** As
written there are ~15 decision surfaces between signup and a posted video,
against a manual workflow of four. A tool that is 60% automated with a higher
step count than manual loses to one that is 80% automated with fewer — which is
this plan's own churn metric (§9.3) pointed back at itself.

**Budget: no more than 6 decision surfaces from signup to posted.** Every new
screen must retire one.

---

## 1. THREE THINGS THAT WOULD BREAK IF BUILT AS PROPOSED

### 1.1 We cannot show "what came from the reference" — we never watched it

Twin extracts from a reference: transcript, word timings, duration, language,
hook, story beats, CTA, speaking pace. It does **not** observe shots, camera
movement, zoom frequency, caption design, B-roll purpose, transitions, music,
lighting, grading or composition.

A Creative Transfer row saying *"Reference used physical comedy → Twin adapted
✓"* would be **fabricated**. A trust screen that fabricates is worse than no
trust screen: it is the single thing that destroys the product the first time
a user checks.

**Rule: every row carries its evidence.**

```
Story structure   OBSERVED       from transcript beats
Hook type         OBSERVED       from first 3s of speech
Pacing            OBSERVED       from word timings
Editing rhythm    NOT OBSERVED   we did not analyse the video
Camera work       NOT OBSERVED   using your brand default
```

"We didn't look at this" builds more trust than a tick we cannot back. When
real visual analysis ships, rows move from grey to green and visibly earn it.

### 1.2 "Attention Score 9.6" is a number we do not have

Absent a model trained on real retention data, a confident score is an LLM
guessing — the same "AI explanation, not creator explanation" failure in a new
costume.

**Rule: show the reason, not the score.** *"This scene runs 14 seconds with no
visual change; the reference changed shot every 4."* That is checkable.

### 1.3 The plan must never promise what the editor cannot do

The renderer does cuts, captions, zooms, one crossfade. It does not do music,
graphics, overlays or arbitrary transitions — and it *refuses* unknown
instructions rather than approximating (`ffmpegGraph.ts`, Gate-0 §7).

A plan requesting "graphics" produces a hard failure, not a video.

**Rule: the plan's vocabulary and the renderer's capability grow together, in
the same change.** The plan never learns a word the renderer does not know.

---

## 2. ARCHITECTURE

```
CONFIRMED TRUTH          who they are (user-confirmed, not guessed)
        +
CAMPAIGN BRIEF           what THIS video must do
        +
REFERENCE MECHANICS      what we actually observed
        +
RESEARCH                 what fills the container
        ↓
CREATIVE DECISION PLAN   ← the contract. recorded. hashed. shown.
        ↓
CONCEPT → SCRIPT → SCENE CARDS
        ↓
ASSET RESOLUTION         every container filled or has a fallback
        ↓
EDIT PLAN                (existing, extended carefully)
        ↓
RENDER                   executes. never invents.
```

### 2.1 DNA, split five ways, every field stamped

**Identity · Audience · Business · Creative · Production**

```json
{ "field": "audience",
  "value": "non-technical startup founders",
  "source": "user_confirmed | observed | inferred",
  "confidence": 1.0,
  "updated": "2026-08-01" }
```

**Hard rule: nothing marked `inferred` may decide anything about money,
claims, products or audience.** It may suggest. It may not decide.

**Production DNA is the one nobody builds, and its absence is why plans fail.**
Can they record screens? Do they have product footage? Multiple locations? A
media library? Without it, Twin writes plans requiring footage that does not
exist — which is exactly how "add B-roll here" becomes unusable.

### 2.2 ~~Creator archetypes~~ → THREE CAPABILITY FLAGS

**The archetype model was reviewed and rejected — unanimously, for different
reasons.** Kept here only as the reasoning; **do not build it.**

Why it is a trap:
1. **It sorts the person; the variable is the video.** One panellist is three
   archetypes in a week, another is four. The one persona it fits cleanly is
   the simplest user, who needs routing least.
2. **It is not one dimension.** Explainer/Demonstrator/Maker are content
   formats, Brand is an org structure, Reluctant is a motivation state. Three
   taxonomies in one enum — and three subsystems were to be routed off it.
3. **This document could not finish it.** §6 gives briefs for three of five.
   The maintenance cost appeared before a line of code was written.
4. **One bucket is a rejection, not an archetype** ("Maker: not servable").
5. **No escape hatch existed** — one-way routing off a loading-screen tap.

**Build this instead — three booleans** *(this line used to say "already being
collected". They were collected NOWHERE — corrected 2026-08-04 when item 9 was
built. Onboarding asks handle, platform, audience, product, goal and stops.)*:

```
can_film_objects     from "Can you show a product?"
can_record_screen    from "Can you record your screen?"
needs_approval       from "Who approves?" / org account
```

`can_film_objects=false` → no footage checklist ever shown.
`can_record_screen=true` → screen clip type offered.
`needs_approval=true` → the review screen gains a lock, comments, and a record
of who approved what.

**Flags compose; archetypes don't. Flags change per video; archetypes don't.**
No detection model, no ×5 script matrix, no naming.

Keep exactly **one** named distinction, because it is a genuine pricing and
product boundary rather than a content one: **solo seller vs. team.**

### 2.2a The archetype reasoning (retained for context only — DO NOT BUILD)

Twin currently collects a lot of DNA and then treats everyone identically.
**Half of all users should never be asked to film extra clips at all.**

| Archetype | Who | B-roll? | Actually needs |
|---|---|---|---|
| **Explainer** | consultants, founders, finance, coaches | **None** | hard words spelled right, restraint, name/title card |
| **Demonstrator** | reviewers, fitness, software | **Essential** | own footage, screen recording, clip slots |
| **Maker** | cooking, beauty, process | Is the content | montage, beat-sync, text, music — **not servable; do not fake it** |
| **Brand** | in-house teams | Product shots | locked identity, banned claims, others' footage, approval |
| **Reluctant** | dentist, realtor, local service | Minimal | fewest possible steps; someone else drives |

An Explainer shown a "film 7 clips" checklist is friction that loses the
customer. A Demonstrator given a talking-only script cannot use the product.
**Same engine, different surface.**

### 2.3 Research fills the container

The reference supplies a **shape** ("three items, escalating, strongest
last"). Nothing today decides what goes in it, so the model invents products —
possibly outdated, possibly never used by the creator, possibly not real.

Three routes, chosen explicitly:

- **Brand-led** — only the confirmed catalogue, approved claims, real reviews
- **Reference-led** — same subject, analysis written fresh, claims never copied
- **Research-led** — search, verify existence, check recency, check the creator
  has not already covered it, score audience fit, select

**Absolute rule: an unverified fact never reaches a script.** If research
cannot confirm it, the slot changes shape or the scene is dropped. A
confidently wrong product recommendation costs the creator their credibility —
the most expensive failure this product can produce.

---

### 2.4 Per-task model routing — A NAMED GAP, NOT YET A DESIGN

*Written down 2026-08-03. This requirement — "different models for different
things, not one call" — had been stated repeatedly in conversation and appeared
**nowhere in this document**, which meant it could not be planned, estimated or
built. A requirement that lives only in chat is not a requirement; it is a
recurring conversation. This section exists to end that, and it deliberately
records the QUESTION rather than inventing an answer.*

**The requirement.** The pipeline should not route every language task to one
model. The work is not homogeneous — extracting structured evidence from a
transcript, choosing a hook, writing scene dialogue, and judging a rendered
result are different jobs with different cost, latency, quality and
failure-tolerance profiles. Sending them all through a single call means paying
the most capable model's price for the cheapest task, and accepting the cheapest
model's judgement on the hardest one.

**What already exists and must not be broken by this.** Model identity is
already pinned and enforced — `check_model_pin_coupling.mjs` is a required CI
guard, the boot manifest records `componentVersions`/`componentDigests`, and
`editor_record_analysis` refuses a write whose bundle version disagrees with the
pinned manifest (0087). Any routing scheme has to keep that property: **which
model produced a given artefact must remain recoverable from the record.**
Routing that makes provenance ambiguous is worse than no routing.

**Open questions, all unanswered:**
- What is the unit of routing — the job type, the individual call site, or a
  declared task class? A task class is the only one that stays pinnable without
  a new allowlist per call site, and this project has just spent a day removing
  one such family of allowlists (see the analysis-component catalog, #244).
- Where does the mapping live? It is a frozen numeric/identity authority, so on
  current form it belongs beside `edit_policy_v1.json` and the model pin, read
  by exactly one loader — not scattered at the call sites.
- What happens on a model being unavailable or deprecated? A silent fallback to
  a different model would break the provenance property above.
- How is a routing choice evaluated? Phase 7's quality gate and the
  director-eval harness already measure output quality; routing changes should
  be judged there rather than by impression.

**DECIDED AND BUILT (2026-08-03) — the routing unit is a TASK CLASS, declared
in one frozen catalog: `worker/model_routing_v1.json`, resolved by
`modelForTask` in `worker/src/modelRouting.ts`, enforced by
`scripts/ci/check_model_routing.mjs`.**

**IT LANDED AS A NO-OP.** The catalog encodes the model each task ALREADY used,
so nothing was re-pointed — the only safe way to put an authority over live
behaviour, and the same property that made wiring `pacing` safe.

**ROUTING ALREADY EXISTED, decided three ways and recorded nowhere:** a frozen
`DIRECTOR_MODEL` constant, an env knob passed at exactly one call site, and an
implicit fallthrough for everything that passed no model at all. Three
mechanisms, two different default models, nothing comparing them.

**AND WRITING THEM SIDE BY SIDE SHOWED THE ROUTING IS INVERTED.** The Director —
which picks cuts, hook, pacing, captions and zooms, and shapes every video —
runs on **flash**. Schema-constrained reference extraction, whose own code
comment argued a flash model costs *"no quality loss on these schema-constrained
tasks"*, runs on **pro**. Nobody chose that; it is what three independent
decisions added up to once `GEMINI_FAST_MODEL` was never set. **Not fixed in the
same change:** re-pointing `decide` changes what the model produces, which is
what the director-eval harness and quality gate exist to judge. The next move is
an eval, not an edit — and naming replacement model ids from memory would be the
chosen-not-measured mistake this project has already made three times.

*The original reasoning, kept because it is what produced the design:* *(Proposed 2026-08-03, recorded with its reasoning so it can
be accepted, amended or rejected on the merits rather than re-derived in
conversation each time.)*

Not the call site, and not the job type:

- **Per call site** fails exactly as the analysis-component namespace failed.
  Every site privately encoding its own model choice is a dozen allowlists that
  nothing compares — the defect removed in #244, which cost four staging matrix
  runs to diagnose because each failure named a symptom rather than the cause.
  Do not rebuild it in a new place.
- **Per job type** is too coarse. `editorAnalyze` alone does extraction,
  scoring and summarisation; one model for the job means the cheapest sub-task
  pays the dearest model's price and the hardest gets whatever suited the
  cheapest.
- **Per task class** is the granularity the work actually has: *extract
  structured evidence*, *choose among candidates*, *write prose*, *judge a
  result*. Those differ in cost, latency, and in what a wrong answer costs —
  which is the whole reason to route at all.

**Shape, following what this repo already does well.** One catalog beside
`edit_policy_v1.json` and the model pin, mapping task class -> pinned model id,
read by exactly one loader. Then:

- provenance survives, which is the non-negotiable: a task class resolves to a
  pinned id already recorded in `componentVersions`/`componentDigests`, so which
  model produced an artefact stays recoverable;
- a CI guard of the `check_analysis_components.mjs` shape asserts every task
  class used in code exists in the catalog and every catalogued class is
  reachable, so the two cannot drift;
- an unavailable model is a HARD FAILURE, never a silent fallback. A quiet
  substitution breaks the provenance property above, which is worth more than
  the render it would have saved.

**Cost of being wrong is low and reversible:** the mapping is data, so a bad
routing choice is a catalog edit rather than a refactor.

**Deliberately not decided here:** the initial class list, and whether a class
may be overridden per environment. Both are cheap once the unit is settled, and
neither blocks starting.

---

## 3. THE B-ROLL PROBLEM — DIAGNOSED AND SOLVED

B-roll was removed previously because output was **inaccurate** (wrong content)
as well as **jumbled** (bad timing/quality). These are two different failures.

**Root cause of inaccuracy: the machine was guessing what was inside each
clip.** It matched a vibe, not a fact. It never knew what the file contained.

### The fix — nothing is inferred

| Mechanism | |
|---|---|
| **The script declares position** | `[SHOW: the bottle]` written into the script |
| **The app requests the shot** | "Film the bottle, 3 seconds, hold steady" |
| **The clip is labelled at birth** | It *is* "the bottle" because that is what was asked for |
| **They join by name** | slot `the bottle` ← clip `the bottle` |

Nobody guessed. The machine matches a name to a name.

### Quality rules (prevent "jumbled")

- Never in the first 3 seconds (the hook must show the face)
- Never over an emphasised word
- 1.2s minimum, 4s maximum
- Never crosses a sentence boundary
- Clip audio **always muted** — the voice is the spine
- Identical conform pipeline to main footage (scale, crop, fps, colour)
- Never two clips back to back
- Maximum 35% of total runtime
- **No stock footage, ever** — user's own footage or a generated card

### Pre-render validity check
Black frame? Under 1s? Wrong orientation? → use the fallback card, never ship
broken footage.

### Mechanism note
`ffmpegGraph.ts` already splits the joined stream into time windows, applies a
treatment to one slice, and concatenates back (built for zoom time-gating).
**B-roll is the same machinery with a new window type.** A window is `face`,
`punch-in`, or `clip N`. One system, three kinds.

**Rename it.** Not "B-roll" — **"show this while I say that."**

### If the user has no product / cannot film
1. Skip → slot falls back to a generated card over their voice
2. Upload later → slot marked `NEEDS_UPLOAD`, rest renders
3. **Declared upfront in Production DNA → Twin never writes a script that
   needs one.** This is why that onboarding question exists.

---

## 4. UI / UX CHANGES

### 4.1 The governing rule

**Every screen answers exactly one question.**

| Screen | The only question |
|---|---|
| Today's Video | What are we making? |
| Creative Transfer Plan | Why will it work — and where did each piece come from? |
| Footage Checklist | What exactly do I film? |
| Twin Will Handle | What happens automatically? |
| Review | What is it about to make — and can I change it? |

**Delete the "Film & Edit" page.** It talks to an editor, not a human. Nobody
filming cares about LUFS or caption typography. Replace with a shot checklist
plus a short "Twin will handle" list. Technical settings become invisible
implementation detail.

### 4.2 Onboarding — questions during the scan (no added wait)

The brand scan already makes the user wait. Fill the wait.

```
Reading your profile…  ████████░░

Who do you make videos for?     [Founders] [Small business] [Consumers] [Other]
What should your videos do?     [Followers] [Leads] [Sales] [Teach]
What do you sell?               [Product] [Service] [Software] [Nothing yet]
Can you show a product?         [Yes] [No]
Can you record your screen?     [Yes] [No]
Anything you must never say?    [ short text ]
```

Big buttons, almost no typing, six answers inside the existing load time.
Then one confirm screen: *"Here's what I found, here's what you told me."*

**Colours and logo are NOT asked here.** Nobody configures branding before
seeing value. Use scraped defaults; confirm at the only moment it matters —
immediately before the first render: *"Captions will use this colour. Right?"*

### 4.3 "Your video idea" card — five answers, not an AI paragraph

Replace *"Fast paced POV exposing…"* with:

```
Goal            Get shares
Audience        Gen Z
Core emotion    Embarrassment
Reference used  POV story structure
What changed    Topic adapted to your audience
```

Three seconds to *"I know exactly what we're making."*

### 4.4 Hooks — show why, not just what

```
Hook A  ★ Recommended    Highest watch time
        Matches your tone · strongest curiosity gap · closest to reference
Hook B                   Higher engagement, more controversial
Hook C                   More educational, better for LinkedIn
```

### 4.5 Scene cards — outcomes, not instructions

```
Scene 2 — Tool one
Purpose        First proof
Viewer feels   "I could use that today"
You say        "The first one removes meeting notes completely."
You record     Face to camera, medium, positioned left
Twin adds      Screenshot of the tool
If missing     Product card with name + one-line benefit
Why            Walking creates urgency. Stopping creates surprise.
```

The **why** line is not decoration — people perform measurably better when
they know what a moment is for. The teleprompter should carry it too.

### 4.6 Extra clips — categorised by purpose, never "copy theirs"

Categories: `Talking · Reaction · Evidence · Environment · Screen recording ·
Photo insert · Generated · Reference only`

And critically, replace **"Copy this"** with **purpose + alternatives**:

```
Reference clip     Walking awkwardly
Purpose            Show embarrassment
You could use      ✓ Looking at wrong email
                   ✓ Wrong website
                   ✓ Wrong elevator
```

This teaches creativity instead of imitation. It is also the difference
between a tool that produces derivative videos and one that produces original
ones.

### 4.7 Recording UI — scene by scene

```
Scene 3 of 5  ✓          [ Redo this one ]   [ Next → ]
```

Camera **stops** between scenes. Countdown on restart. Per-scene retake.
Per-scene time limit. Then extra-shot mode:

```
Now film: THE BOTTLE
Hold steady, fill the frame. 3 seconds is plenty.
[ ● Record ]
This will appear when you say "This one is different"
```

### 4.8 Review screen — the transcript IS the editor

```
Scene 1  "I stopped using every serum I owned. Here's why."
Scene 2  "Most of them are 90% water…"          ← struck through = cut
Scene 3  "This one is different…"      📎 the bottle
Captions will use this colour ████ [Change]
[ Make my video ]
```

Strike a sentence → the cut is removed. Fix a word → the caption changes.
Click a zoom marker → it is gone. **No timeline, no scrubbing, no waveform** —
because every renderer decision already derives from the transcript, editing
the words *is* editing the video.

This one screen simultaneously delivers: the typo fix (Explainer), the
"delete that sentence" revision (agency), the brand preflight (brand), and the
approval gate (regulated). **Build it once; price it by seats and roles.**

---

## 5. WHAT THE PANELS MISSED

Every panellist pictured a warmed-up account making video #10.

1. **The first video.** No history, no clips, no saved vocabulary, no confirmed
   brand. **The riskiest video is #1 and nobody designed it.**
2. **Failure at 11pm.** A batch films Sunday; two renders come back broken;
   the user churns silently without filing a ticket. No failure path exists.
3. **A bad reference link** — 12 minutes, no speech, a slideshow, a song.
   Currently goes straight in and produces confident nonsense.
4. **DNA never learns.** Scraped once, frozen. Video #40 does not know #12 and
   #19 performed. **Which videos actually worked is the only real moat** and
   nothing feeds it back.
5. **Other people in frame.** A gym, a café, an office. Face and voice capture
   with no consent story.
6. **Cost varies ~10x by archetype.** Explainer vs Demonstrator-with-research
   are different unit economics; unpriced.

---

## 6. PRE-SCRIPT BRIEF — three questions, per archetype

Not a form. Defaulted, changeable in one tap.

- **Explainer** — What is the one thing to remember? · Customers or peers? ·
  **Any hard words?** *(feeds the permanent glossary — **the glossary itself is
  BUILT**: `brand_glossary_terms` (0104), pinned into the boot manifest, and
  consumed by the caption re-speller. The QUESTION is not asked yet; it belongs
  to Phase 10 item 2, which capability flags just unblocked.)*
- **Demonstrator** — What are you showing? · Do you have it now? · Screen or
  physical?
- **Brand** — Which product? · Which approved claims? · Who approves?

The Explainer's third question is quietly the highest-value field in the
product: every hard word ever typed is saved forever, and accent stops being a
risk permanently.

---

## 7. THE BUILD PLAN

### Phase 9 — the render truth layer *(COMPLETE — 10/10)*

**Merged and live:** caption emphasis (#233) · brand colours (#234) · zoom
time-gating (#235) · loudness measurement (#236)

**In CI:** free-tier mark, language pin, audit fixes, face-aware zoom (#237)

**Done — each verified against the code, not from memory:**
- [x] Deterministic tail/head trim — `policy.edges` (`trimLeading`/`trimTrailing`/
      `keepMs`/`minTrimMs`), applied at `editorCompile.ts:730`. No longer LLM
      discretion: with or without a hook, whatever sits outside the first and
      last spoken word is removed.
- [x] Caption contrast guard — `captionColours.ts`, `MIN_CONTRAST_RATIO_MILLI`.
      A brand colour that cannot be read inside the preset's outline is
      rejected and recorded rather than rendered black-on-black.
- [x] Long-token wrapping — `fragmentToken()`, wired at `editorCompile.ts:1263`.
      A word longer than the line is split instead of running off-frame.
- [x] Bound the hook trim — `policy.hook.maxTrimMs` (15s) and
      `maxTrimFractionMilli` (half the accepted material). Exceeding either
      falls back to the real opening and says so.
- [x] Emit the frozen encoder settings — `EncoderSettings` is now REQUIRED on
      `GraphAssets`; outputOptions emit `-preset -crf -profile:v -level:v -g
      -keyint_min -sc_threshold -b:a`. Declared and applied, not just declared.
- [x] A/V drift check — `editorValidateOutput.ts`, `output_av_drift`. Bounds
      set from measured renders (audio outlasts video by 93–120 ms because
      video truncates to whole frames), not from a guess.
- [x] Cut-density cap test — `editor-compile.test.ts:909`, both directions:
      under the cap produces no `removal_dropped_cut_density`, over it does.

- [x] **Caption band out of the platform UI zone — DONE, and the question was
      wrong.** This item was written as a vertical problem: whether captions at
      `marginVerticalPx` 320–360 clear TikTok's caption/username block and
      Reels' bottom bar. It refused to guess a number, correctly, and waited for
      a measurement. The measurement arrived — a safe-zone ruler posted and
      screenshotted in both feeds — and **overturned the premise.**

      | | TikTok (17 Pro Max) | Reels (11 Pro Max) |
      |---|---|---|
      | action rail, in from right edge | ~200 px | ~150–200 px |
      | rail icons in the 320–360 band | bookmark ~340 | share ~370 / send ~320 |
      | caption/username block, up from bottom | ~130–200 px | ~60–110 px |

      **The bottom caption block was never the problem.** It sits far below the
      600 px captions already clear (raised in #237 from an earlier screenshot).
      The collision is the **action rail**, and the rail is **horizontal** —
      it runs up the side of the frame. It cannot be escaped by raising the
      band: doing so means clearing the heart at ~600 px, which puts captions in
      the middle of the video.

      So the fix is **width, not height**, and `marginVerticalPx` is deliberately
      **unchanged at 600**. `captions.maxWidthPx` = 680 (= 1080 − 2×200), with
      `captions.railInsetPx` = 200 recorded beside it as the measurement itself,
      and `marginHorizontalPx` raised 140 → 200 so the ASS box actually delivers
      that width. Centring is why the arithmetic doubles: every extra pixel of
      width is spent on both sides at once.

      Pinned by `caption-safe-area.test.ts`, which **reads the frozen policy**
      rather than restating it — both directions, so lowering the margin for
      nicer line length and widening `maxWidthPx` past the rail each fail CI
      rather than a user's video. The old 140 px margin is kept as an explicit
      non-vacuity control.

      *Not claimed:* that each preset's `maxCharsPerLine` fits `maxWidthPx` in
      pixels. That is a character proxy (`fragmentToken` — "the renderer
      measures nothing here"), and turning it into a pixel claim needs a
      glyph-advance constant nobody has measured. The ASS box is the hard bound
      regardless; an over-wide preset is a planned-vs-rendered line-count
      mismatch, a different defect with a different fix.

**Both former blockers — each was a decision, not engineering, and both are now
decided. Phase 9 is COMPLETE (10/10).**
- [x] **Wire `pacing`** — DONE. Decided and built. Pacing controls exactly one
      thing: **how much silence survives**. It deliberately does not touch
      caption style (the Director already picks `captionPresetId` separately),
      zooms or transitions — bundling those would couple four independent
      decisions that currently work.

      | | calm | **balanced** | punchy |
      |---|---|---|---|
      | shortest gap worth cutting | 400ms | **120ms** | 120ms |
      | max cuts/min | 12 | **30** | 45 |
      | protected pause before an emphasised word | 500ms | **350ms** | 250ms |

      **The safety property:** `balanced` declares NO overrides — it is the
      empty profile, so it resolves to the *same policy object*, and enabling
      pacing cannot change any video that already renders correctly. Only a
      recording the Director marked calm or punchy differs. Punchy gets its
      speed from the cut ceiling, never from cutting closer to the words:
      `minPhonemeHandleMs` is 60, so a sub-120ms removal lands inside natural
      word spacing and clips speech — that does not sound fast, it sounds
      broken.

      **These three columns are chosen, not measured**, and ship the way
      loudness did: `compileEditPlan` now returns `cutStats` recording the
      REAL cut density of every render, so the numbers get corrected from what
      actually happens to real videos rather than remaining an estimate with no
      expiry date.
- [x] **Delete `music`** — DONE. `none`/`subtle`/`energetic` was dead in a
      worse way than pacing: there is no music asset pipeline, no licensing
      path, and `editPlanContract.ts` *refuses* any plan whose `audio.music` is
      not null. The model was being asked a question the renderer is built to
      reject. Removed from the contract, the schema and the Director prompt; a
      decision that still carries the field is simply ignored, so nothing
      stored or in flight breaks.

### Phase 10 — stop guessing

**STATUS (measured, not remembered):**

| item | state |
|---|---|
| Provenance stamping on every DNA field | **done** |
| Script-anchored forced alignment | **engine built; WIRED (#242); three consumers built** |
| Onboarding questions + confirm screen | not started — and BLOCKED behind capability flags (Phase 11 item 9), see the note in item 2 |
| Transcript-as-editor review gate | **the backend is complete end to end**: contract (`reviewOverlay.ts`), compiler consumption, persistence + the pause (0102), and a screen that is BUILT BUT UNSEEN — no human has used it |
| Failure path (explain, retain footage, retry without refilming) | **explain built** (`failureExplain.ts`); retain + retry were ALREADY TRUE — see item 5 |

**A CORRECTION WORTH KEEPING.** During the Phase-9 close I reported that the
live Director call was broken in staging, on the strength of phase-7 failures
showing `state=unknown`. That was WRONG, and the way it was wrong is the
instructive part.

`unknown` is a DESIGNED state: it means a worker died with a model call in
flight, so the system refuses to guess whether the model answered. Phase 7
CREATES that state on purpose — it kills a worker mid-call to prove crash
recovery works. Reading the table directly shows the signature plainly: exactly
one `unknown` and one `received` per run, bracketed by successes, identical
across separate runs. Overall 222 succeeded against 77 unknown.

So a healthy, deliberately-induced state was read as a fault, an alarm was
raised on it, and a revert (`ef4282c`, restoring `music`) was applied on
correlation rather than on understanding. The revert is harmless — the plan
contract refuses any non-null `audio.music` regardless — but it was not
justified by what the evidence actually said.

The general lesson, which applies well beyond this incident: a state named
`unknown` is not automatically a failure, and a NULL `failure_code` beside it
was CORRECT rather than missing. Read what a state MEANS in its own schema
before treating it as a defect.

1. Provenance stamping on every DNA field
2. Onboarding questions during the scan + confirm screen
   **NOT STARTED, AND DELIBERATELY NOT STARTED FIRST.** §6 specifies the
   pre-script brief PER ARCHETYPE (Explainer / Demonstrator / Brand) and §2.2
   retired archetypes — *they sort the person; the variable is the video*. Item
   9 replaces them with capability flags, which do not exist yet. Building the
   questions before the flags would reintroduce the discarded model in the worst
   possible place: the answers a creator gives on day one, stored and depended
   on forever. Capability flags (Phase 11 item 9) are the prerequisite, and
   this item is what they unlock.
3. **Script-anchored forced alignment** *(largest single accuracy win — fixes
   captions, cuts, emphasis, zooms, hooks, and every language at once)*
   - [x] **The alignment engine** — `worker/src/jobs/scriptAlignment.ts`, pure
         and dependency-free, 29 tests. Sequence-aligns the pinned script
         against the ASR words and gives every SCRIPT word a REAL timestamp:
         the script is ground truth for spelling, the recording for timing.
         Reports matches, substitutions (with a similarity score), skipped
         words and ad-libs. It never filters — `editorSpeech.ts` requires that
         off-script words stay, so an ad-lib is reported and never removed, and
         a skipped word gets a null time rather than an invented one.
         Reads the snapshot correctly in two ways a caller would get wrong:
         hidden b-roll scenes (`showInTeleprompter: false`) are excluded
         because they were never on screen to read, and an UPLOAD (no captured
         script) returns null as a normal state, so upload-a-take keeps working
         on ASR alone exactly as it does today.
   - [x] **Wiring it into the analyze stage** — DONE (#242), and it was not
         small: it took twelve allowlists, four staging matrix runs, and a
         migration. Verified against the code, not from memory:
         `editorAnalyze.ts:199-226` records the component (cache lookup by
         digest, then `recordAnalysis`); `ALIGNMENT_EVIDENCE_SCHEMA_VERSION` 1
         and `ALIGNMENT_EVIDENCE_VERSION` `alignment-1` in
         `editorAlignment.ts:30-31`; `editorManifest.ts:276,287` puts
         `alignment` in both `componentDigests` and `componentVersions`;
         `directorContract.ts:207,211` requires it and validates 64-hex.
         Migration `0100` bounds the namespace and gives alignment its OWN
         524288-byte cap rather than the 16384 the CASE's `else` would have
         handed it silently — the payload scales with the script (~145 B/word),
         so 16 KiB is ~230 words, and `component_too_large` is PERMANENT.
         `ALIGNMENT_TIMINGS_MAX_BYTES` (400000) bounds the worker side by
         MEASURED bytes, with a test pinning the relationship.

         **The half-wiring warning was heeded, not ignored.** Storable is a
         complete state, not a partial one: nothing reads the component, and
         `editorDirector.ts:356` still iterates `visual/audio/hook` only. That
         is now DECLARED rather than incidental —
         `scripts/ci/analysis_components.json` records
         `"consumedByDirector": false` for alignment, and the CI guard (#244)
         fails if any site disagrees. Flipping that flag to `true` names
         `editorDirector.ts` as the file that must change.
   - **Consuming it — STARTED. One of three consumers is built.**
     - [x] **Captions take the script's spelling at the recording's time.** The
           script is ground truth for SPELLING, the recording for TIMING; until
           now captions used the ASR's spelling for both, so a brand name or
           handle the ASR never heard correctly went on screen misspelled even
           though the creator had typed it correctly minutes earlier.
           `buildScriptSpellingMap` (editorCompile.ts) joins script words to
           spoken words on EXACT integer (startMs, endMs) — no tolerance to
           tune — and applies only to SUBSTITUTIONS at or above
           `captions.scriptSpellingMinSimilarityMilli` (700, chosen not
           measured, with the count of applications and floor-refusals returned
           so it gets corrected from real videos).
           **The bound is the point:** it can only change the LETTERS of a word
           the aligner already paired. It cannot add, drop, reorder or retime a
           caption word, ad-libs keep their ASR text (the transcript is
           evidence), and a take with no alignment renders byte-identical
           captions to before it existed — which covers uploads, scripts with
           no dialogue, and every project pinned before #242, whose manifests
           carry no alignment digest at all. Alignment is therefore OPTIONAL at
           compile time; requiring it would have broken every in-flight project
           permanently for a spelling improvement.
     - [x] **False starts — DONE, as `alignment-2`.** `detectFalseStarts`
           (scriptAlignment.ts) reads the alignment OPS, which only exist at
           analyze time: the record keeps timings and counts, not the op list,
           so a later reader could not reconstruct this without re-aligning.
           A restart falls out as a RUN OF INSERTIONS beside the script region
           then said properly — every false start has that shape. What separates
           it from an ad-lib is that the abandoned run RESEMBLES what follows,
           **in order**, which is why the measure is sequence-wise rather than
           the unordered overlap `matchedTokenRatio` uses.
           Thresholds live in `analysis_rules_v1.json` (the ANALYSIS stage's
           authority, not the compiler's) and enter `alignmentEffectiveConfig`
           and therefore the component digest — so retuning one cannot silently
           reuse a record computed under the old one. Bounded by construction:
           `maxReported` caps the list and each entry is six small integers, so
           it cannot threaten the byte budget the way timings can.
           **The measure was corrected by probing, not by reasoning.** The first
           version refused *"this changes ev— this changes everything"*, the most
           characteristic restart a person makes, because Levenshtein scores
           "ev" against "everything" at 733, just under the 800 floor. The floor
           was not wrong; the measure was. A strict prefix at the FINAL position
           now counts as a match — final position only, because that is where
           abandonment physically happens, and allowing it anywhere would make
           "show" match "shoulder" mid-sentence and start inventing restarts.
           Nothing consumes it yet: it is EVIDENCE, for the review gate (item 4)
           and the failure path (item 5).
     - [ ] ~~**False starts** — blocked on `alignment-2`~~ *(superseded; the
           analysis below is kept because it is what made the design)*
           **The earlier reading was measured rather than assumed:** The component records `insertionCount` and nothing else
           about insertions (editorAlignment.ts) — a count, not where they are
           or what was said. A false start IS a run of insertions adjacent to
           the region that was then said properly, so the count alone cannot
           distinguish "they restarted a sentence" from "they ad-libbed
           throughout". Detecting it needs insertion SPANS in the record, which
           is a schema-version bump: a new `ALIGNMENT_EVIDENCE_VERSION`, a new
           digest, and therefore a recompute for every pinned project, plus room
           inside the 524288-byte cap that `ALIGNMENT_TIMINGS_MAX_BYTES`
           (400000) already spends most of. Cheap to build, not cheap to land —
           and worth doing as one deliberate `alignment-2` rather than smuggled
           in beside something else.
     - [x] **Exact hook boundary — BUILT, and landed FROZEN OFF.**
           `scriptStartSpokenIndex` (scriptAlignment.ts) gives the spoken word
           index at which the SCRIPT actually starts; everything before it is
           preamble — settling into frame, "hey guys welcome back", clearing the
           throat. That is the boundary `hookStartWordIndex` needs.
           **It does not depend on `snapshot.hook`, and could not.**
           `spokenScriptFromSnapshot` builds the aligned script from scene
           DIALOGUE and ignores the hook field, so the hook line is not reliably
           part of what alignment sees. The first-script-word boundary is
           derivable without it and is the more useful fact anyway.
           Matches on `startMs` ALONE: the Director's envelope projects words
           without `endMs` (`SpeechWordLike`), and reaching around that
           projection would use a shape the envelope has decided not to expose.
           A start claimed by two words yields null rather than a guess — an
           index on the wrong word opens the video in the wrong place.
           **`DIRECTOR_SEES_ALIGNMENT` is FALSE, and that is the safety
           property.** Adding a field to `summaries` changes the envelope bytes,
           therefore `envelopeSha256`, therefore what the model sees — which is
           what the director-eval harness and quality gate exist to judge. So the
           plumbing lands with the envelope PROVABLY byte-identical (a test
           compares summaries with and without the component; the field is
           omitted rather than set to null, because a null key still moves the
           bytes). **Flipping the flag IS the eval**, and it is one line.
           With the flag on the Director gains
           `hook.scriptStartWordIndex` beside the existing `matchedTokenRatio`
           — *where* the script begins, next to *how much* of the hook was said.
           A test pins `consumedByDirector` to the flag, so the catalog and the
           code cannot drift apart in either direction.
     - [ ] ~~**Exact `hookStartWordIndex`**~~ *(superseded above; the analysis is
           kept because it is what produced the design)* — today the hook component reports
           `matchedTokenRatio`, an UNORDERED multiset intersection between the
           hook's tokens and the opening window. That is a similarity score, not
           a boundary: it says how much of the hook was said, never where it
           ended. Alignment gives an ordered, timestamped script→recording map,
           which is the thing a boundary can actually be read off.
           **BLOCKED ON AN EVAL, NOT ON PLUMBING.** The plumbing is small:
           `buildEnvelope` already receives `{ visual, audio, hook }` and
           alignment is already pinned and digested beside them
           (editorDirector.ts:374), so passing it in is a few lines and needs no
           change to the hook component at all — an earlier reading of this item
           assumed a hook schema bump and that was wrong. What it does change is
           WHAT THE MODEL SEES, and this project has a director-eval harness and
           a quality gate precisely because a changed Director input changes
           Director output. So the gate on this is an eval run, not an
           implementation. It is also the change that makes
           `consumedByDirector: true` correct.
     - **THE EVAL DECISION, TAKEN 2026-08-04: both flag flips stay FROZEN OFF
       for now.** `scripts/director-eval/` is not a program — `thresholds.json`
       is a frozen HUMAN protocol: 16 recordings across mutually-exclusive
       strata (plus 4 reserves), 3 blinded raters each, and a senior adjudicator
       who is not a rater establishing ground-truth spans BEFORE seeing Director
       output. It cannot be run by anyone today for a reason that is not about
       cost: **there are no recordings**, and whether a real phone take survives
       ingest at all is still unverified. Collecting 16 of them is downstream of
       that one take, not upstream.
       Writing a smaller `evaluationVersion` was considered and rejected for
       now: it carries the same coordination cost for weaker evidence, and the
       strata exist precisely because Director quality plausibly varies by
       duration and delivery — a 6-recording sample cannot distinguish "the
       Director is good" from "the Director is good on short scripted takes".
       Revisit the moment a real recording lands.
     - Note: none of the three consumers built or described here passes
       alignment into the DIRECTOR, so the component catalog's
       `consumedByDirector: false` remains correct today. The hook item above is
       what flips it, and flipping it is a decision about the model's inputs
       rather than a prerequisite for reading the evidence in the compiler.
4. **Transcript-as-editor review gate — the CONTRACT is built, the screen is not.**
   `worker/src/jobs/reviewOverlay.ts`. A screen could not be the first thing
   here, because the hard question is not what the creator clicks but WHAT A
   CLICK IS ALLOWED TO MEAN — which has to hold whether it comes from the review
   screen, a future API, or a support tool acting on someone's behalf.
   **It may REMOVE and CORRECT. It may not INVENT.** Strike a sentence, restore
   a cut, fix a word's letters, drop a zoom. Nothing in the vocabulary can add a
   word that was never spoken or move one in time — the same bound A18h asserts
   of captions and script re-spelling already lives under. The one door that
   could have been left open is closed explicitly: a respelling may not contain
   whitespace, because "twinny" -> "Twin AI and also buy my course" would
   otherwise be a spelling fix.
   **The decision is never edited.** `edit_director_decisions` is append-only
   and hash-pinned; a record of what the model chose that can be rewritten
   afterwards is not evidence. The overlay is its own record and composes with
   the decision, so "why is this cut here" always names either the model or the
   person.
   **An empty overlay returns the SAME OBJECT**, and a test asserts identity
   rather than equality — so this lands ahead of the UI having provably altered
   no render. 27 tests, mutation-checked.
   **THE COMPILER NOW CONSUMES THE TWO FIELDS THE DECISION CANNOT CARRY.**
   `removeWordRanges` becomes removals with their own origin (`review_edit`) and
   `respellWords` becomes caption letters, in `editorCompile.ts`. They could not
   live in the decision: it expresses removals as indices into the Director's
   CANDIDATE list, and a struck sentence may have no candidate at all.
   A strike is exempt from the three gates that exist to stop the MODEL cutting
   on evidence the analyzer declined to vouch for — a person who read the
   sentence and struck it is the authority those gates defer to — and exempt
   from nothing structural: the allowed domain, the protections, the plan
   maxima and the minimum kept segment all still apply, none of which is about
   who decided.
   **The two places a creator's edit could vanish are closed and
   mutation-checked.** The cut-density ceiling ranks and drops only DIRECTOR
   cuts; the min-segment repair never picks a strike as its victim. Either one
   would produce the failure `validateReviewOverlay` refuses at the edge: the
   creator watches the render, finds the sentence they struck still in it, and
   learns the review screen is advisory. Plan schema 5→6 —
   `identity.reviewOverlaySha256` (null = nobody reviewed; a digest = somebody
   looked and approved, which are different facts) — and a compile with no
   overlay is byte-identical to one from before this existed.
   **THE PAUSE (0102).** `awaiting_review` is the first status on
   `edit_projects` that names work a PERSON is doing. That distinction is
   load-bearing in three places, each destructive if missed: the lost-project
   reconciler fails any non-terminal project whose job is gone (here it is gone
   on purpose); an empty stage list falls through to
   `finishProject('completed')`, so a duplicate claim would complete a project
   with no plan; and the stage guard is a strict +1 walk, so putting the status
   INSIDE the pipeline array would make `directing -> compiling` illegal and
   strand every project in flight the moment the gate is switched off. The
   array is therefore unchanged and the two review transitions sit beside it.
   `editor_submit_review` stores the overlay, releases the project and queues
   the resume job in ONE transaction — any two without the third leaves a
   project rendering an edit nobody recorded, or resting on an edit nothing
   will read. The overlay is written once and frozen, because the plan cites
   its digest. Env-gated and OFF; a typo renders the video rather than parking
   every project in a state whose only exit is a screen nobody was told about.
   *Still to build:* nothing in the backend. The SCREEN exists
   (`apps/web/src/pages/v2/V2EditReview.tsx`) and **no human has used it** —
   the overlay building and the sentence grouping are unit-tested, but §4.8's
   actual claim is that editing the words reads AS editing the video, and no
   test in this repository establishes that.
5. **Failure path — the EXPLAIN half is built; the other two were already true.**
   `worker/src/jobs/failureExplain.ts`.
   **Checking first changed the work.** "Retain footage" and "retry without
   refilming" read like things to build and are not: 0099's purge fires on a
   `media_assets` DELETE or status→deleted, and a failed PROJECT does neither,
   so footage is retained by construction; and
   `edit_projects_active_source_uniq` is PARTIAL (active statuses only), so a
   failed project does not block a new one on the same asset, while
   `media_analyses_reuse_uniq` means the retry reuses the analysis rather than
   paying for it twice. The gap was never the mechanism. It was that nobody
   TOLD the creator any of it.
   **Classes, not a paragraph per code.** A creator is asking four things — is
   my footage still there, must I film it again, will retry help, is this my
   fault — and there are only five answers: `retry_helps`, `retry_wont_help`,
   `refilm`, `reupload`, `our_config`, plus `unknown`. One explanation per code
   would be 40+ pieces of prose that all say the same four things and drift.
   **The coverage guard found four codes on its first run** that a hand-written
   grep had missed (`brand_snapshot_corrupt`, `model_version_mismatch`,
   `speech_transcript_mismatch`, `source_not_ready`) — it reads every
   `new PermanentJobError` in the tree from source, and a companion test refuses
   entries for codes nothing can emit, so the catalogue cannot rot in either
   direction.
   **Fails safe:** an unclassified code is `unknown`, never a guess, and
   specifically never claims a retry will help — telling someone to retry a
   failure that can never clear is exactly how this defect hurts.
   *Still to build:* surfacing it (the API/UI), and the retry button itself.

### Phase 11 — the take itself *(REORDERED — this is now the highest-risk area)*
6. **Preflight check before recording** — room echo, backlight, orientation,
   head cropped, mic source. *The panel's #1 gap. Nothing in the pipeline
   addresses the actual failures of video #1.*
7. **Teleprompter design** — eyeline relative to lens, scroll speed matched to
   the speaker, font size, pause markers. *The word "teleprompter" appeared
   once in the first draft of this document, as a subordinate clause, in a
   teleprompter product.*

   7a. **Teleprompter behaviour differentiated BY CONTENT TYPE.** *(Written
   down 2026-08-03 because it existed only in conversation and therefore could
   not be built. Item 7 above covers the CRAFT of the teleprompter — eyeline,
   scroll speed, font, pause markers — and treats it as one artefact tuned the
   same way for every video. The requirement is that it should not be: a
   demonstration read while the creator's hands are busy is not the same
   instrument as a piece to camera.*

   **UNSPECIFIED, and deliberately not guessed here.** What is recorded is the
   requirement and the open questions, not an invented answer:
   - Which axis differentiates? Item 9 retires archetypes in favour of the
     three capability flags (§2.2), so "content type" must be defined against
     those flags or against something new — it cannot quietly reintroduce
     Explainer/Demonstrator/Brand. See the §6/§2.2 conflict item 9 already owns.
   - What actually varies — scroll speed, chunk size, whether it scrolls at all,
     whether it shows the next line or the next beat, whether it hides during
     a declared `[SHOW: …]` clip (Phase 12, item 11)?
   - Is the choice the creator's, the Director's, or derived from the script?
     A Director-chosen value needs a contract both copies agree on, which is
     the cost item 9's capability flags were introduced to avoid paying twice.

   **DECISION — ACCEPTED 2026-08-04: differentiate on the SCRIPT'S OWN
   STRUCTURE, never on a content-type enum.** *(Proposed 2026-08-03 with the
   reasoning below so it could be rejected on the merits; accepted unchanged.)*
   The open questions at the top of this item are answered by it: the axis is
   the existing per-scene `scene_type` / `purpose` / `show_in_teleprompter`
   fields, the choice is DERIVED from the script rather than made by the creator
   or the Director, and no new enum, screen or contract is introduced. What
   remains open is only the per-`scene_type` parameter values, which are craft
   numbers and stay with item 7 — chosen against a real recording, not guessed.

   The scene timeline already carries `scene_type` (`talking_head`,
   `demonstration`, …), `purpose` (`hook`, …) and `show_in_teleprompter` per
   scene. Route the teleprompter off those, and off nothing new.

   Why that and not a content-type field:

   1. **A content-type enum is the archetype trap in a new costume.** §2.2
      retired archetypes because *they sort the person; the variable is the
      video* — and a per-video content type is one short step from a per-creator one
      the moment anybody defaults it from the brand. Item 9 owns that
      reconciliation and a new enum would hand it a second one to do.
   2. **The granularity is wrong, and the script already has the right one.**
      "This video is a demonstration" is false of a video whose first scene is a
      piece to camera and whose third is hands-on. The teleprompter should
      change BETWEEN SCENES, which is what the existing per-scene fields
      describe.
   3. **It costs zero decision surfaces.** §0 budgets six from signup to posted
      and requires every new screen to retire one. Deriving from the script asks
      the creator nothing they are not already answering.
   4. **It cannot be fabricated.** The scene timeline is pinned in the script
      snapshot, so what the teleprompter did is recoverable from evidence the
      render already carries — the same rule the rest of this pipeline runs on.

   **What varies, concretely:** whether it scrolls at all (a `demonstration`
   scene wants a fixed beat, not a moving line, because the creator's hands and
   eyes are busy), the chunk shown (a line vs the next beat), and whether it
   hides entirely during a declared `[SHOW: …]` clip (Phase 12 item 11).

   **Deliberately not decided here:** the per-`scene_type` parameter values.
   Those are craft numbers and belong with item 7, chosen against a real
   recording rather than guessed — the same discipline the caption safe area
   waited for and was right to.
8. **Edit the script BEFORE filming.** Three of four panellists hit this
   independently: you cannot currently change a word before reading it into a
   camera 40 times.
9. **Capability flags** (§2.2) replace archetype routing.
   **BUILT — the data model and the resolution rule (0103,
   `packages/shared/src/editor/capabilities.ts`). Nothing consumes them yet,
   and that is declared rather than incidental.**
   **Two claims in this document were false against the code, and checking
   changed the work.** (a) There is NO ARCHETYPE ROUTING to replace — no
   Explainer/Demonstrator/Brand enum exists anywhere in the repository, and the
   only occurrences of the word describe a creator's recurring video FORMATS in
   their scraped DNA, which is a different concept and a legitimate one. So
   this is a build, not a migration, and nothing had to be un-wired. (b) §2.2
   calls these "three booleans already being collected"; they were collected
   NOWHERE — onboarding asks for handle, platform, audience, product and goal
   and stops. Every consumer §2.2 names is downstream of asking the question
   for the first time.
   **UNSET IS A THIRD STATE, and it is the whole design.**
   `can_film_objects = false` means "never show this creator a footage
   checklist" — a feature being REMOVED. Defaulting it to false for everyone
   who has never been asked would silently remove that screen from every
   existing account: this project's most-repeated defect (a missing value read
   as a real one) landing where it costs most. So a flag is `true`, `false` or
   UNANSWERED; `isExplicitlyFalse` and `isExplicitlyTrue` are separate
   questions; and there is deliberately no backfill, because there is no answer
   to backfill.
   **The video wins over the brand default, including when it says false.**
   "Flags change per video" is the sentence that separates this from the
   archetype trap — a default acting as a floor would make the per-video answer
   advisory, which is a setting that sorts the person and cannot be escaped for
   one video. The resolution records WHICH scope answered, so "why was I not
   asked to film anything?" names the video or the brand rather than a rule
   nobody can see.
   **The refusal is in the DATABASE, not only in the reader.** A CHECK
   constraint refuses `"true"`, `1`, `"yes"` and any fourth key — the last of
   which is how an enum grows back. Proven by Gate-H against a real Postgres
   with a mutation control, because the TypeScript reader is not the only
   writer a column ever gets.
   *Still to build:* the three consumers §2.2 names, each blocked on something
   real — the footage checklist does not exist (Phase 12 item 12), the
   screen-recording clip type does not exist (Phase 12 item 13), and the
   approval lock is a regulated-tier surface on top of the review screen rather
   than a flag read. And the QUESTIONS: Phase 10 item 2 is what asks them, and
   it is now unblocked.
10. Reference validation *(reject unusable links before they poison a script)*
    **BUILT** — `packages/shared/src/editor/referenceCheck.ts`, wired into the
    build flow. §5's four cases are all measurable from what the transcriber
    already produces: twelve minutes (`too_long`), no speech (`no_speech`), a
    slideshow and a song (both `sparse_speech`, at 13 and 10 words per minute
    against ordinary conversational speech of 120-160).
    **"NOT MEASURED" IS NEVER A FACT ABOUT THE VIDEO** — the rule `assessProbe`
    was fixed for, applied to a different input. A missing duration is
    `duration_unknown`, never `too_short`, and an UNKNOWN reference is still
    USABLE: refusing on no evidence discards the creator's own choice, which is
    the same overreach in the other direction.
    **Withholding the transcript id is the whole mechanism.** `generate-blueprint`
    already builds from the reference plus the creator's DNA when no transcript
    arrives — the pattern mode a failed read has always fallen back to — so this
    adds a REASON rather than a code path, and the reason is shown rather than
    swallowed. Silently building from something else is how a creator ends up
    with a script unrelated to the video they chose and no idea why.
    **The bounds are chosen, not measured**, and deliberately loose: a false
    "unusable" costs the creator their reference, a false "usable" costs a
    slightly worse script, and those are not symmetric. Every reason's text
    states what was CHECKED and never judges the video (§7c) — a test asserts
    none of them contains "bad", "poor" or "perform".
    *Found on the way:* `IngestJob.result.duration_sec` had been declared by the
    client since it was written and NEVER emitted by the worker, so every reader
    saw `undefined` with no way to tell that from a reference with no duration.
11. Scene-by-scene recording — **with continuity preserved.** Camera stopping
    between scenes breaks a gym/kitchen workflow where scene 3 must physically
    follow scene 2. Make stopping the default, not the law.

### Phase 12 — show the right thing
11. Declared clips (`[SHOW: …]` → guided capture → name-matched)
12. Container resolution with fallbacks; nothing unresolved reaches filming
13. Screen recording as a clip type
14. Research layer with verification

### Phase 12a — after the render *(MISSING ENTIRELY from the first draft)*
The plan ended at "Make my video." The user's job ends at "posted."
- Download, cover/first-frame selection, description + hashtag text,
  aspect and safe-zone variants, scheduling and posting.

### Phase 13 — don't all look the same
15. Output variation + 3 moods (calm / normal / punchy)
16. Creative Transfer page with honest OBSERVED / NOT OBSERVED labels
    — **or do not ship the page at all.** §1.1 calls the fabricated version
    "the single thing that destroys the product the first time a user checks",
    so shipping it dishonest for three phases is not an option.
17. Performance feedback — see §7a for its contract.

---

## 7a. THE RECOMMENDATION GALLERY

Solves: **which reference should THIS creator use?** Belongs after provenance
and the capability flags, before deeper research automation.

Rank every reference by:

| Signal | Question |
|---|---|
| DNA match | does this voice/tone fit them? |
| Goal match | does this structure serve their stated goal? |
| Production-mode match | can they physically shoot this? *(reads the flags)* |
| Recreate feasibility | is this achievable with what they have? |
| Structure transferability | does the format survive a topic change? |
| Content availability | do we have something to fill its containers? |
| Freshness | is this format still working, or exhausted? |

**Production-mode match is the one nobody builds and it is the most valuable:**
it is what stops the gallery recommending a multi-clip montage to someone who
answered "no" to filming objects. The flags already carry it.

## 7b. PERFORMANCE FEEDBACK — ITS OWN CONTRACT

"Feed performance back into the DNA" is too vague to build and dangerous to
guess at. Five distinct claim types, never conflated:

| Type | Example | Evidence needed |
|---|---|---|
| **Correlation** | "list-format videos average higher watch time" | ≥N videos, stated N |
| **Hypothesis** | "the hook may be contributing" | flagged as untested |
| **Confirmed preference** | "this creator prefers this style" | repeated, explicit choice |
| **Business outcome** | clicks, leads, sales | attributed, not inferred |
| **Platform outcome** | views, retention, saves, comments | measured |

**Absolute rule: never conclude "this hook caused performance" from one
successful video.** A single result is an anecdote; the product must say so.
A confident causal claim from n=1 is the same failure as "Attention Score 9.6"
(§1.2) wearing a different costume.

**START LOGGING NOW, even though the feature is late.** Video → outcome rows
must be written from the first render onward. **You cannot recover history you
did not record**, and this is the only real moat in the document.

**BUILT (0105).** `post_outcome_observations` is an APPEND-ONLY log, one row per
(post, metric, observed_at, source), enforced by a trigger. It exists rather
than reusing `posts.views/likes/comments` because those are SCALARS and updating
one destroys the previous value — *views at 24h and views at 30d are different
facts about the same video, and the difference between them is most of the
signal*. Those columns stay as a cache of the latest reading; this is the record.
The metric list is CLOSED, because a free-text metric name is how "engagement"
appears and stops being comparable to anything.
`dna_claims` carries the five types, and **the absolute rule is a CHECK
CONSTRAINT rather than a paragraph**: a `correlation` with no sample size, or
with n=1, cannot be inserted. A rule of that kind never ships broken as a
decision — it ships as an absent check on a hurried Tuesday. A `hypothesis` may
not carry a sample size (it would render beside a correlation with the same
furniture), and a `business_outcome` may not exist without attribution. The
floor of 2 is the ONLY number asserted: it is where the word "correlation"
becomes definitionally wrong, and §7b deliberately does not fix N because the
honest N depends on the effect being claimed. Proven by Gate-I with two mutation
controls. *Still to build:* the writers (nothing populates the log yet — a
platform read needs the OAuth connections) and any consumer.

## 7c. WHAT MAKES A HIGH-PERFORMING VIDEO

Two layers, and they must never be mixed:

**Craft rules — general, checkable, explainable.** Hook lands in the first 2–3
seconds · no dead air before the first word · visual change often enough to
hold attention · captions legible muted and clear of platform UI · audio at
platform loudness · vertical, safe-area respected · ends on a reason to act.
These are stated as *checks with reasons*, never as scores:
> *"Your hook takes 6 seconds to reach its point; the reference reached its
> point in 2."* — checkable, arguable, honest.

**Learned preferences — theirs, earned over time, through §7b's contract.**
Never general advice dressed as personal insight.

**The honesty line: Twin may say what it CHECKED. It may never say what will
PERFORM.** The moment it predicts a number it has not measured, it becomes the
thing §1.2 exists to prevent.

### After
Brand lock · approval workflow · Spanish + Portuguese *(Latin script — nearly
free; the STT and fonts already exist)* · agency capture links · lower-thirds

### Explicitly deferred
Non-Latin fonts (Korean/Japanese/Arabic/Devanagari) — an entrenched local
incumbent exists in Korea (Vrew), Indian creators caption Hinglish in Latin
script, and "properly Korean" is nine things of which the font is the
smallest. · Music beds · Full montage editing · Regulated-enterprise
compliance *(33x worse revenue per engineering-month than solo)*

---

## 8. POSITIONING

**Every creator on the panel said no. All three buyers were people who sell
something and use video to find customers.**

- Not "AI video editor" — every creator tool says that, and creators decline.
- **"Turn what you know into videos that bring you clients — without editing."**
- Compare against **paying an editor $40/video**, not against free CapCut.
- The restraint (no music, no memes, no effects) is a **selling point** to
  serious buyers, not an apology.

**Best content:** one person, one idea, 45–90 seconds, where the speaker *is*
the content — founder POV, myth-busting, objection-handling, same-day
reactions, sponsored talking segments, FAQ answers.

**Structurally wrong for:** anything that must *show* something without the
clip system — demos, screen walkthroughs, charts, before/after, cooking.

---

## 9. VALIDATION DISCIPLINE

1. **Real footage before more features.** No human has recorded a video and
   run it through the editor. Every verification to date is automated tests
   and synthetic test-pattern footage. A design partner shooting in a bad room
   beats every opinion in this document, including the panel's.
2. **Ship behind the user's own eyes.** No caption change ships until someone
   watches it muted, on a phone, while scrolling.
3. **Watch two churn predictors:** batch failure rate (2 bad renders in 6 is a
   silent cancel), and whether users still open another editor afterwards
   ("partial automation is worth ~20% of full, not 80%").
4. **Re-run the panel after real output exists.** Half of the above is people
   reacting to a description.

---

## 8a. ONBOARDING, PROVENANCE, AND WHERE A REFERENCE COMES FROM

Supersedes the four-question sketch in §4.2. The founder's five-question design is
adopted with five corrections; each correction is a defect the original would have
produced, not a preference.

### 8a.1 What is asked, and when

The scan runs 45-60s. Five questions with a conditional and two multi-selects is
realistically EIGHT interactions and ~90 seconds of reading — longer than the scan,
so the "free" onboarding stops being free. Split by whether the scan can answer it:

**During the scan** — things the scan CANNOT know, because they are about intent:

| | Question | Decides |
|---|---|---|
| Q1 | Primary goal — followers / authority / educate / leads / sell / entertain / personal brand | Format choice, hook strategy, CTA strength |
| Q2 | Intended audience + optional free text | Vocabulary level, examples, objections |
| Q3 | What you do, with one conditional follow-up | Where subject matter and business truth come from |
| Q3b | **The offer itself, free text: what is it called and what does it do** | The CTA on every video |

Q3b is new and is the highest-value field on the form. `offer` is currently
INFERRED and forced non-empty (voice.ts's prompt forbids blanks), and it decides
the call to action. A guessed offer is a wrong CTA on every video shipped.

**On the confirm screen, pre-filled from the scan** — things the scan CAN see:

| | Question | Why it moved |
|---|---|---|
| Q4 | What your videos promote | Partly observable from captions and CTAs |
| Q5 | What your videos look like | Fully observable. Asking someone to tick 14 boxes describing content we are actively reading is wasted effort AND less accurate — people mis-report their own format. Shown as "you mostly do X and Y — anything else you want to make?" One tap, and the "anything else" captures the intent the scan cannot see. |

**Conditional, when Q3 is Professional / Ecommerce / Brand:** what may you NOT
claim. Unguessable, and unforgivable to get wrong for a doctor, lawyer, financial
adviser or supplement brand.

Every "Other" carries free text or it trades a real answer for a null.

### 8a.2 Provenance — three corrections that make the rule enforceable

The hard rule is right: *inferred information may suggest, but may not decide
products, prices, claims, audience truth, or offers.* It is only enforceable if
the labelling is honest. Three fixes:

**(a) No float confidence.** `confidence: 0.91` from a model reporting on itself is
uncalibrated and will be read as meaning something. Discrete source + a real
evidence count instead: `"evidence": "consistent across 9 of 12 posts"`. A count is
a fact and can carry a threshold; 0.91 cannot.

**(b) Never merge sources.** `"source": "user_answer_and_observed_posts"` destroys
the mechanism — no code can then decide whether the rule applies. Keep both values
side by side:

```json
"video_formats": {
  "stated":   { "value": ["talking head", "software explanation"], "source": "user_answer" },
  "observed": { "value": ["talking head", "lifestyle"], "source": "observed",
                "evidence": "8 of 12 posts" }
}
```

"Prioritise what they said, preserve what they do" becomes executable rather than
aspirational.

**(c) Observed audience is not observed.** The design's own example mislabels
itself. We read CAPTIONS. We have no follower demographics. "Their audience appears
to be students" is inference from subject matter, and calling it `observed` grants
authority it has not earned — in the one field where being wrong matters. Label it
`inferred`, and phrase the conflict as "your content READS as student-focused",
never "your audience IS students".

**(d) Each profile group records what it may decide.**

| Group | May decide | May never decide |
|---|---|---|
| Identity | Subject matter, framing | — |
| Audience | Vocabulary level, examples | Claims about them |
| Business | The CTA, whether research runs | Prices, product facts, unless user-confirmed |
| Creative | Voice, hooks, tone, pacing | Anything factual |
| Production | Which references are recreatable | — |

Without this the hard rule is a comment. With it, it is a check.

### 8a.3 The gallery is ONE entry point, not the pipeline

**Correction.** An earlier revision of this section claimed no gallery existed.
That was wrong — `/gallery` ships, with "Remix in my voice", and an upload mode
(`V2Capture ?mode=upload`) ships alongside recording. The error came from
misreading a grep result. The architectural point survives the correction and is
actually strengthened by it.

There are **four ways a video starts**, and they are peers:

| Entry | What the user brings |
|---|---|
| Gallery | Picks a ranked reference |
| Paste a link | Brings their own reference |
| Own idea | Brings a topic, no reference |
| Upload a take | Brings FOOTAGE — already filmed |

The first three converge at the same place and everything after is identical:

```
gallery ─┐
paste   ─┼─→ reference read → brief card → script → record → edit → post
idea    ─┘                                    ↑
upload a take ────────────────────────────────┘  (joins at the edit)
```

**Anything one entry gets that another does not is a bug**, with one honest
exception: an upload has no script, so it cannot have teleprompter alignment or
scene-level keep/retake. It still gets transcript, cuts, captions, punch-ins,
loudness and every output check — `origin: 'upload'` is already a first-class
case in the compiler, where the allowed domain is the whole file.

What an upload MUST also get, and does not today: the brief card cannot precede
it (the video is already shot), but the REVIEW screen and the "what Twin
changed" summary apply unchanged, and so does the transcript-as-editor.

**Why gallery suggestions are wrong today, mechanically:** ranking needs a
PRODUCTION profile and nothing produces one. A reference is recommended for
matching your niche even when it is a dance video and you make software
walkthroughs. Q5 plus observed format is exactly the missing input — §7a's
"production-mode match" has never had data behind it.

**The container rule.** A reference shaped "three products I stopped using" is a
CONTAINER, and Q3+Q4 decide what fills it:

| Answers | Fills with |
|---|---|
| Affiliate creator | Three researched relevant products |
| SaaS founder | Three tools, or three mistakes — the shape survives, the noun changes |
| Product brand | Confirmed own products only, never inferred ones |
| Non-commercial educator | Three ideas or three mistakes; a product is not forced in |

That last row is the one that matters. Forcing a commercial container onto
someone with nothing to sell is how a tool starts producing videos its user
cannot post.

### 8a.4 Extra clips — when the question appears

Never as a general question. The SCRIPT declares the slots (`[SHOW: the settings
page]`), and slots are only generated when the merged profile supports them:

- `production.observed ∪ stated` contains a product-led or software format
- and Q4 says a product or app may appear

An educator whose formats are all talking-head sees no clip stage at all. For a lot
of creators the correct amount of B-roll is none, and the profile is what makes
that decision rather than a guess.

### 8a.5 Cost, honestly

Measured baseline today ~$0.09-0.10 per video, of which ~60% is storage egress —
and most of THAT is a defect (the source is downloaded three times; §9a.3). Fixing
it funds most of what follows.

| Addition | Added cost | Why |
|---|---|---|
| Preflight | **~$0** | Runs in the browser on frames that never leave the device |
| Onboarding questions | **~$0** | Form input during a wait that already happens |
| Gallery ranking | **~$0.002** | References are shared across users, so the expensive read is amortised; only the per-user score is fresh |
| Provenance merge | **~$0** | Deterministic code, not a model call |
| Research (only when Q4 says products) | **+$0.02-0.08** | Fetches plus passes. Route-metered from day one or the pricing model is guessing |
| Extra clips | **+$0.01-0.02 per clip** | Upload, validate, download, conform. 5-17 clips is the real risk; fix the graph fan-out first |

**Re-cut with my edits is much cheaper than it looks.** It re-runs the compiler and
the renderer only. Transcription (~35% of pipeline time), visual analysis (~15%),
audio analysis (~6%) and the Director call are all content-addressed and reused —
the footage did not change. A re-cut is **~25-30% of a full video**, not 100%.

So: **first re-cut free, further re-cuts cost a credit.** It is the single strongest
retention moment in the product — the user just found something they want changed —
and charging for the first one to save two cents trades that for nothing. "Start
again from the script" is a genuinely new video and is priced as one.

---

## 9a. VERIFIED DEFECTS — these are not risks, they are live

Everything in §§1–8 is a hypothesis about what to build. **This section is
different: every item was read in the shipped source and confirmed by hand
before being written down.** Nothing here is a report I took on trust. Where a
claim could not be checked from the repository, it says so.

They came out of three parallel reviews on 2026-08-01 — a pre-mortem, a
security/privacy audit, and an efficiency/measurability audit — and they
reorder the build, because polishing the renderer matters less than the fact
that the renderer has been executing partly-empty plans.

### 9a.1 The four silent joints — evidence computed, then read by nobody

This is the same failure mode §7's Phase 9 list already names five times over
(emphasis, brand colours, face positions, safe area, cue limits). It is worse
than recorded: **four joints are disconnected in a way that produces no error
and no warning a human ever sees.**

| # | Defect | Verified at | Consequence |
|---|---|---|---|
| 1 | Analyzer writes `snrDb` / `earlyEnergyRatio`; compiler reads `snrDbMilli` / `earlyEnergyRatioMilli` | `editorAudio.ts:286,290` vs `editorCompileInput.ts:213-214` | `readComponentAudioFacts` returns `null` on every render. **Every video ever made used `speech-clean-v1`.** `speech-noisy-v1` and `speech-roomy-v1` — the only response to a bad room — have never once run. |
| 2 | Hook writes `scriptAlignment.matchedTokenRatio` (nested); Director reads `hk.matchedTokenRatio` (flat) | `editorHook.ts:62` vs `editorDirector.ts:135` | The Director has always been told `null`. It has never known whether the creator actually said the hook they were shown. |
| 3 | `\|\|` binds tighter than `?:`, so the ternary consumes the whole condition and the real CTA is never read | `recordingScriptAdapter.ts:150-152` | **Every video ever made ended on "Follow for more like this"** — while the blueprint prompt spends a paragraph demanding a concrete CTA pointing at the creator's actual offer. For §8's buyer persona, that line is worthless. |
| 4 | Catalog declares `x264Crf`, `x264Preset`, `gopSizeFrames`, `audioBitrateKbps`; the argv builder emits none of them | `render_catalog_v1.json:41-46` vs `ffmpegGraph.ts` (zero matches for `crf`/`preset`/`-g`) | Every render used ffmpeg's compiled-in defaults. "Deterministic output" was never true: an ffmpeg bump on the worker silently changes every customer's video while every hash, test and validator reports green. |

**Why the test suite did not catch a single one.** At each of these joints the
fixture was written from the *consumer's type declaration* rather than the
*producer's real output* — `compile-input.test.ts:53` invents
`{snrDbMilli, earlyEnergyRatioMilli}`, `director-summaries.test.ts:46` invents
a flat `matchedTokenRatio`, `fixtures/editPlanFixture.ts:88` repeats the first
invention. Every module proves it honours its own types. **Nothing proves any
two modules are connected.**

The renderer is the exception, and the reason is instructive: `validateEditPlan`
is *the same validator on both sides of the wall*. No other joint in the system
has that property, and every joint that lacks it is broken.

> **RULE — stage-boundary contract tests.** Every producer→consumer joint gets
> one test that feeds the producer's **actually persisted** output into the
> consumer. Not a literal. This is the only defect class here that recurs, and
> it is the one that hid the other three.

### 9a.2 Security — one critical, fixed; three that gate later phases

**FIXED 2026-08-01 (commit `6ea86ac`).** `ci-bootstrap` vends the project's
service-role key to a GitHub-OIDC caller. Its header says "never deployed to
prod"; `deploy-edge.yml` ran `supabase functions deploy` with **no function
list**, which deploys every directory, and the function had **no project pin** —
its gate checks repo/workflow/ref, never which project answered. A copy on
production would hand out production credentials to anyone able to trigger
`staging-integration.yml`. Fixed in two independent layers: the function now
refuses to run anywhere but staging (checked first, before the body is parsed),
and the deploy set is explicit and *closed* — an unclassified function fails
the build, so a new one can neither be silently skipped nor silently shipped.

> ~~**STILL NEEDS A HUMAN WITH CONSOLE ACCESS:** set `CI_BOOTSTRAP_DISABLED=1` on
> the production project and delete the function from it.~~
> **CHECKED 2026-08-03 — NOT NEEDED. `ci-bootstrap` was never deployed to
> production.** The function list on the production project holds 17 functions
> and `ci-bootstrap` is not among them; it exists only on staging, which is
> where it belongs. The concern was correct in shape — a copy on production
> would have handed out production credentials — but the copy does not exist,
> so there is nothing to delete and no env var to set. Recorded rather than
> deleted, because "we assumed it was there" and "we looked" are different
> states and only one of them is evidence.

Three more, each of which **blocks a named later phase**:

- ~~**Nothing in the codebase ever deletes a stored recording.**~~ **CLOSED —
  `0099` built it, and on 2026-08-03 it was APPLIED to production and staging.**
  A trigger on `media_assets` queues a `purge_media` job on DELETE and on
  status→`deleted`, so a generation cascade and an account cascade are both
  covered without application code; the worker handler treats a 404 as success,
  so a retry after a partial success cannot dead-letter. Verified in both
  databases by object, not by ledger: both triggers present, the function body
  matching the committed one.
  **The interval is the lesson, not the fix.** `0099` sat on `main`, unapplied
  and unnoticed, while nothing in this repository could tell anyone that. That
  is what `scripts/db-tests/migration-presence` now answers.
  What `0099` still does NOT do: sweep objects that never had a row. That needs
  an age-based reaper over storage prefixes — a separate change with a different
  risk profile, since a reaper that is wrong deletes live footage.
- ~~**`generate-blueprint` has none of the Director's injection discipline.**~~
  **CLOSED — checked in the source 2026-08-04, and it is built.** The system
  prompt carries an UNTRUSTED DATA section naming the fence and forbidding the
  model from following, repeating or acting on anything inside it — including
  emitting a URL, @mention, discount code or hashtag that appears only there.
  `fenced()` STRIPS both delimiters from the content before wrapping, so fenced
  text cannot close its own fence and continue as instructions. All four
  untrusted inputs go through it: the derived structure, the reference
  transcript, the creator's typed note, and the scraped creator DNA.
  **The DNA being fenced is the part worth noticing**, and its comment says why:
  it reads like our own text, but every field was synthesized from scraped
  captions, so it is exactly as attacker-influenceable as the transcript and one
  step further from scrutiny because it arrives pre-formatted as a briefing.
  This no longer blocks Phase 12a or the research layer.
- **Social OAuth access + refresh tokens are plaintext at rest. STILL LIVE —
  re-verified 2026-08-04**: `0040_platform_connections.sql:14-15` declares
  `access_token text` and `refresh_token text`, with no encryption anywhere in
  the tree. Column grants are correct so clients can never read them, but any
  dump or service-role leak buys the ability to post as every connected creator.
  **Blocks §7b analytics scopes**, which would widen a leak from "post a video"
  to "read this creator's whole audience".
  **DECIDED AND BUILT 2026-08-04 — the key lives with the edge function.**
  Checking who actually reads these tokens decided it: exactly ONE consumer
  touches them (`supabase/functions/social`), and the worker never does. So the
  key never needs to be reachable from SQL.
  **The service-role row is the whole argument.** Against a `pg_dump`, an
  in-database key (Vault) and an edge-function key both hold. Against a
  SERVICE-ROLE LEAK — the other threat named above — an in-database key does
  NOT: decryption is then a SQL call `service_role` can make, so the leak still
  buys every creator's tokens. Holding the key outside the database is the only
  option that defends the credential which can read the database, and because
  the sole consumer already runs outside SQL it costs nothing here. That is not
  true in general, which is why it is written down rather than assumed.
  AES-256-GCM via WebCrypto, `v1:<iv>:<ct>`, with the AAD bound to
  `owner_id|platform` so a ciphertext copied between rows fails to decrypt
  instead of authorising a post as the wrong creator. Legacy plaintext rows are
  read as themselves and re-encrypted on their next write, so the population
  drains without a backfill that could half-succeed and cost someone their
  connection.
  **STILL NEEDS A HUMAN, and this one is real:** set `SOCIAL_TOKEN_KEY` (32
  random bytes, base64) on the project's edge-function secrets before deploying.
  The connect path refuses to run without it — storing plaintext instead would
  reintroduce the defect, and pretending the connection succeeded would be
  worse — so an unset key means "connect fails loudly", not "connect quietly
  degrades".

Also worth recording, because it is the correct instinct applied unevenly: the
render half — the EditPlan contract, the argv alphabet, the ASS escaper, the
Director's index-only protocol, the digest-pinned model/font/watermark chain —
audited clean, with no bypass found. The risk is entirely in the perimeter.

### 9a.3 Cost and measurability

- **The source is downloaded three times per video**, and ~60% of unit cost is
  storage egress. `runRenderingStage` constructs its **own**
  `VerifiedSourceSession` (`editorRenderStage.ts:148`) writing to the exact path
  the orchestrator's session (`editorV2.ts:536`) already downloaded to. This
  contradicts three module headers that assert "at most ONE download per
  attempt", and `source_downloads` on the durable record is consequently always
  wrong. **Fix is passing one parameter.** At 1,000 videos/day it is ~$540/mo.
- ~~**`posts` has no join key to a render.**~~ **CLOSED — `0098` added
  `posts.edit_project_id` and `posts.output_asset_id`, and on 2026-08-03 they
  were APPLIED to production.** Both nullable and both `on delete set null`: a
  row created before the columns existed genuinely does not know its render, and
  a guess would be worse than the gap, since a wrong attribution is
  indistinguishable from a right one and poisons the exact analysis the columns
  exist to enable. Verified by reading `information_schema` on production:
  both columns present, the partial index present.
  **This one had the longest fuse in the document** — "every video posted before
  it exists is permanently unattributable" was true for every day between `0098`
  being written and being applied, and nothing anywhere reported the gap.
  `0098` is also the migration `migration-presence` structurally CANNOT see: it
  creates no table and defines no function, so it is reported as *unprobed*
  rather than verified. The single highest-value migration landed in the tool's
  declared blind spot, which is the argument for declaring blind spots.
- **Render timing is computed and discarded.** `RenderEvidence` carries
  `renderMs`, `realtimeRatioMilli`, `budgetMs`, `graphSha256`; `editorV2`
  consumes the three loudness fields and drops the rest. A render that failed
  after burning 95% of its budget and one that failed in 2 s are
  indistinguishable in the record. Gemini `usageMetadata` token counts are
  parsed and dropped too, so LLM spend per project is unknown.
- **`EDITOR_RENDER_ENABLED` defaults OFF** (`env.ts:120` requires the literal
  `'true'`). Combined with `scaffoldBoundary`, a project can be `completed`
  with `output_asset_id` NULL. **Any success-rate query must require a non-null
  `output_asset_id`, never `status='completed'`.**
- **Retention deletes the moat.** The nightly trim drops `analytics_events`
  after 90 days. Whatever performance tables get built must be explicitly
  excluded, *with the reason written in the migration that does the trimming*.

### 9a.4 What this changes about the order of work

§7's Phase 9 spends nine items polishing the render of footage nobody has ever
recorded. That was defensible when the inputs were believed sound. They are not.

**Revised order:**

1. ~~The four silent joints (§9a.1)~~ — **done**
2. ~~Stage-boundary contract tests~~ — **done**; and the class recurred where
   nobody was looking for it. A stage boundary is not only producer→consumer
   inside the worker: **repository→deployed database is one too**, and it had no
   test at all. `0098`, `0099` and `0100` sat on `main` unapplied to production
   while every gate stayed green, because every gate reads the migration FILES.
   `scripts/db-tests/migration-presence` is the contract test for that boundary.
3. ~~`posts.edit_project_id`~~ — **column applied to production 2026-08-03.**
   The decision/outcome tables remain.
4. The single-download fix + persist `RenderEvidence` + capture token counts
5. ~~Media deletion~~ — **`0099` applied to production and staging 2026-08-03.**
   Retention (excluding the performance tables from the nightly trim, with the
   reason written into the migration that trims) remains, and is still needed
   **before** Phase 11 adds preflight capture.
6. The blueprint injection envelope — **before** Phase 12a posting
7. *Then* the rest of Phase 9 (long-token wrapping, caption band vs platform UI,
   A/V drift, `pacing`). **Caption band vs platform UI is now MEASURED and the
   news is bad:** every preset's `maxCharsPerLine` draws 1.45x-1.57x wider than
   the 680 px box on ordinary text, and `WrapStyle: 2` means libass does not
   re-wrap — it draws through the rail inset instead. The number is pinned in
   `worker/src/__tests__/caption-line-width.test.ts` with an honest `fits: false`;
   which knob closes it (chars per line, font size, words per cue, or a wider box
   that spends safe-area margin) is a product decision, deliberately not taken
   inside a test.

§9's item 1 — real footage, one human, one phone — moves ahead of all of it.
Every defect above was findable in an afternoon that way, and the pre-mortem's
sharpest line is that a phone recording may not survive ingest at all: a
`MediaRecorder` WebM often has no duration in its container, and
`validateSource.ts` reads `format.duration ?? '0'` and rejects on `too_short`.
**That one is not yet verified against a real device** — and it is the single
cheapest thing left to check.

---

## 10. CHANGE LOG

| Date | Change |
|---|---|
| 2026-08-01 | Created. Consolidates 10-person panel (2 rounds), 3 codebase audits, Phase 8/9 rebuild, and the information-architecture critique. |
| 2026-08-01 | Added §8a: five-question onboarding adopted with five corrections (offer as free text, Q4/Q5 moved to the confirm screen, no float confidence, never-merged sources, observed-vs-inferred audience). Gallery defined as a chooser, not a second pipeline. Cost per addition estimated, and re-cut priced at ~25-30% of a render. |
| 2026-08-01 | Added §9a from a pre-mortem, a security/privacy audit and an efficiency/measurability audit run in parallel. Four silently-broken pipeline joints, one critical credential-vending defect (fixed), and the missing post→render join key. Reorders Phase 9: the inputs come before the polish. |
| 2026-08-03 | Two blocked items given RECOMMENDED DECISIONS rather than left as named gaps: §2.4 routes per TASK CLASS from one frozen catalog (not per call site, which rebuilds the twelve-allowlist defect, and not per job type, which is too coarse), with provenance preserved and no silent model fallback; Phase 11 item 7a differentiates the teleprompter on the SCRIPT'S OWN per-scene structure (`scene_type`/`purpose`/`show_in_teleprompter`), never a content-type enum, which would be the retired archetype trap at a per-video granularity that is still wrong. Both recorded with reasoning so they can be rejected on the merits. Also measured why the two remaining alignment consumers are not "just a read": false starts need an `alignment-2` schema bump (the component records `insertionCount` only, and a count cannot distinguish a restart from an ad-lib), and the exact hook boundary needs a director-eval run rather than plumbing (the envelope change is a few lines; changing what the model sees is the risk). |
| 2026-08-03 | Phase 10 status corrected against the code: forced alignment is now WIRED and STORABLE (#242), not "NOT wired into the pipeline". Nothing consumes it, and that is a declared state rather than an omission — `analysis_components.json` records `consumedByDirector: false` and CI fails if any site disagrees. Consuming it is the next step and is now a read, not a rebuild. |
| 2026-08-03 | **Phase 9 COMPLETE (10/10).** Its last item is closed by measurement, and the measurement overturned the item's premise: the caption collision is the platform ACTION RAIL, which is horizontal, not the bottom caption block. Fixed by width (`captions.maxWidthPx` 680, `railInsetPx` 200, `marginHorizontalPx` 140→200) with `marginVerticalPx` deliberately unchanged at 600; pinned by a contract test that reads the frozen policy in both directions. Also written down two requirements that existed only in conversation and were therefore unbuildable: §2.4 per-task model routing, and Phase 11 item 7a teleprompter-by-content-type. Both are recorded as named gaps with their open questions, not as invented designs — each is blocked on a human decision. |
| 2026-08-04 | **Phase 10 item 4's backend is complete end to end.** The compiler consumes the overlay's two span fields (`removeWordRanges` → removals with a `review_edit` origin, `respellWords` → caption letters that beat the script's, which beat the ASR's); 0102 adds the `awaiting_review` pause, the write-once overlay table and `editor_submit_review`. The design work was in what a creator's edit is EXEMPT from and what it is not: exempt from the three gates that stop the model cutting on evidence the analyzer would not vouch for, exempt from nothing structural, and never given back by the density ceiling or the min-segment repair — both of which would otherwise reintroduce, in the compiler, the exact silent drop the overlay validator refuses at the edge. Plan schema 5→6 adds `identity.reviewOverlaySha256`, where null (nobody reviewed) and a digest (somebody looked and approved) are deliberately different values. The pause needed three separate places to learn that resting is not dying — the reconciler, the empty-stage-list fallthrough to `completed`, and the stage guard's strict +1 walk. The SCREEN exists and no human has used it; §4.8's claim is that editing the words reads as editing the video, and nothing in this repository tests that. |
| 2026-08-04 | Item 2 (onboarding questions + confirm screen) recorded as BLOCKED behind capability flags rather than left as "not started". §6 specifies the brief per archetype and §2.2 retired archetypes; building the questions first would store the discarded model in the one place it is hardest to undo — the answers a creator gives on day one. |
| 2026-08-04 | **Phase 11 item 9 (capability flags) BUILT — data model, resolution rule, and the refusal in SQL (0103).** Checking first changed the work twice over: there is no archetype routing to replace (no Explainer/Demonstrator/Brand enum exists anywhere; the word only appears describing a creator's recurring FORMATS in their DNA), and the "three booleans already being collected" were collected nowhere. So the item was a build, not a migration. The design is one distinction: UNSET IS NOT FALSE. `can_film_objects = false` removes a screen, so defaulting it for accounts that were never asked would silently remove that screen from all of them — a missing value read as a real one, in the place it costs most. Three states, two separate questions (`isExplicitlyFalse` / `isExplicitlyTrue`), no backfill. The video's answer beats the brand default including when it says false, because a default acting as a floor is a setting that sorts the person and cannot be escaped for one video — the archetype trap in the other costume. The CHECK refuses `"true"`, `1` and any fourth key in the database rather than only in the reader, proven by Gate-H with a mutation control. Nothing consumes the flags yet and that is DECLARED, following the alignment component's precedent. Phase 10 item 2 is now unblocked. |
| 2026-08-04 | **The permanent glossary (§6) BUILT — table (0104), pinned into the boot manifest, consumed by the caption re-speller.** The design is one sentence: a glossary term LOWERS THE SIMILARITY FLOOR for a pairing the aligner already made, and never matches against the transcript on its own. The ordinary floor (700) exists because a substitution is the aligner's GUESS that two words are the same word; a term is evidence that reduces that risk for exactly one word, because the creator typed it deliberately as a word they expect to be got wrong. So every existing caption property survives — nothing added, dropped, reordered or retimed — and `glossaryAdmitted` counts the re-spellings admitted ONLY by the lower floor, which is simultaneously the evidence the feature works and the evidence it went too far. Both floors are chosen, not measured, exactly like the 700. **The cost of the bound is stated rather than hidden: an UPLOAD with no captured script gets nothing**, because there is no pairing to adjust; matching terms against ASR words directly would cover that case and is how "kubernetes" becomes "cucumbers" on screen — a change to make against a real recording, not against reasoning. The glossary is PINNED at manifest time beside the brand snapshot, so a hard word added mid-project can neither retro-alter nor fail a running edit. A term is ONE WORD in the database as well as the client, because a row can be written by anything holding the owner's credentials. The pin also survives the window where the worker deploys ahead of its migration: `42P01` reads as an empty glossary, which is ENTAILED (no table means no row means no term was ever stored, so the glossary genuinely is empty at pin time) — and without it that window would be a TOTAL EDITOR OUTAGE rather than a degraded caption, because the read sits inside `pinManifest`, which every project passes through at its first stage. |
| 2026-08-04 | **§7b's log BUILT (0105) — "start logging now", with the absolute rule as a CONSTRAINT.** `post_outcome_observations` is append-only and one row per (post, metric, observed_at, source): `posts.views/likes/comments` are scalars, and updating one destroys the previous value — views at 24h and views at 30d are different facts and the difference between them is most of the signal. The metric list is closed, because free text is how "engagement" appears and stops being comparable to anything. `dna_claims` encodes the five types with their DIFFERENT evidence requirements in SQL: a correlation with no sample size or n=1 CANNOT BE INSERTED, a hypothesis may not carry a sample size, a business outcome may not exist without attribution. That rule never ships broken as a decision — it ships as an absent check — so it is a CHECK, proven by Gate-I with mutation controls. The floor of 2 is the only number asserted, because §7b deliberately does not fix N and inventing one would be the confident-number-from-nothing the section exists to prevent. Nothing writes to the log yet (a platform read needs the OAuth connections) and nothing consumes it — declared, not implied. |
| 2026-08-04 | **Phase 11 item 10 (reference validation) BUILT.** §5's four cases — twelve minutes, no speech, a slideshow, a song — are all measurable from what the transcriber already produces, so the check is a pure function over (duration, word count) and needs no new infrastructure. It follows `assessProbe`'s rule exactly: a missing measurement gets its OWN verdict and never borrows a real one, so `duration_unknown` is not `too_short`, and an unknown reference stays USABLE because refusing on no evidence discards the creator's choice. Withholding the transcript id is the entire mechanism — `generate-blueprint` already falls back to pattern mode — so this adds a reason, and the reason is SHOWN. A test asserts no reason text contains "bad", "poor" or "perform", because §7c's honesty line applies to references too: say what was checked, never what will perform. Found on the way: `IngestJob.result.duration_sec` was declared by the client and never emitted by the worker, so no reader could tell an unmeasured reference from a missing field. |
