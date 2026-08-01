# TwinAI — Master Build Plan

**Status:** living document. This is the consolidated plan of record.
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
Each costs the user seconds, because it is asked when they already know.

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

### 2.2 Creator archetypes — the missing routing layer

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
  **Any hard words?** *(feeds the permanent glossary)*
- **Demonstrator** — What are you showing? · Do you have it now? · Screen or
  physical?
- **Brand** — Which product? · Which approved claims? · Who approves?

The Explainer's third question is quietly the highest-value field in the
product: every hard word ever typed is saved forever, and accent stops being a
risk permanently.

---

## 7. THE BUILD PLAN

### Phase 9 — the render truth layer *(in progress)*

**Merged and live:** caption emphasis (#233) · brand colours (#234) · zoom
time-gating (#235) · loudness measurement (#236)

**In CI:** free-tier mark, language pin, audit fixes, face-aware zoom (#237)

**Remaining:**
- [ ] Deterministic tail/head trim *(currently LLM discretion; should be a rule)*
- [ ] Caption band out of the platform UI zone
- [ ] Caption contrast guard *(dark brand colour = black-on-black today)*
- [ ] Long-token wrapping *(a word longer than the line runs off-frame)*
- [ ] Bound the hook trim *(nothing stops it deleting most of a video)*
- [ ] Emit the frozen encoder settings *(CRF/preset/GOP declared, never applied)*
- [ ] A/V drift check *(audio stream duration never compared to video)*
- [ ] Wire `pacing` *(Director decides it; compiler discards it)*
- [ ] Cut-density cap test *(implemented, untested)*

### Phase 10 — stop guessing
1. Provenance stamping on every DNA field
2. Onboarding questions during the scan + confirm screen
3. **Script-anchored forced alignment** *(largest single accuracy win — fixes
   captions, cuts, emphasis, zooms, hooks, and every language at once)*
4. Transcript-as-editor review gate
5. Failure path — explain, retain footage, retry without refilming

### Phase 11 — know your creator
6. Archetype detection at onboarding
7. Archetype-specific surfaces
8. Archetype-specific script generation
9. Reference validation *(reject unusable links before they poison a script)*
10. Scene-by-scene recording

### Phase 12 — show the right thing
11. Declared clips (`[SHOW: …]` → guided capture → name-matched)
12. Container resolution with fallbacks; nothing unresolved reaches filming
13. Screen recording as a clip type
14. Research layer with verification

### Phase 13 — don't all look the same
15. Output variation + 3 moods (calm / normal / punchy)
16. Creative Transfer page with honest OBSERVED / NOT OBSERVED labels
17. Performance feedback into DNA

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

## 10. CHANGE LOG

| Date | Change |
|---|---|
| 2026-08-01 | Created. Consolidates 10-person panel (2 rounds), 3 codebase audits, Phase 8/9 rebuild, and the information-architecture critique. |
