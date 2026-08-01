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

**Build this instead — three booleans already being collected:**

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

### Phase 11 — the take itself *(REORDERED — this is now the highest-risk area)*
6. **Preflight check before recording** — room echo, backlight, orientation,
   head cropped, mic source. *The panel's #1 gap. Nothing in the pipeline
   addresses the actual failures of video #1.*
7. **Teleprompter design** — eyeline relative to lens, scroll speed matched to
   the speaker, font size, pause markers. *The word "teleprompter" appeared
   once in the first draft of this document, as a subordinate clause, in a
   teleprompter product.*
8. **Edit the script BEFORE filming.** Three of four panellists hit this
   independently: you cannot currently change a word before reading it into a
   camera 40 times.
9. **Capability flags** (§2.2) replace archetype routing.
10. Reference validation *(reject unusable links before they poison a script)*
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

> **STILL NEEDS A HUMAN WITH CONSOLE ACCESS:** set `CI_BOOTSTRAP_DISABLED=1` on
> the production project and delete the function from it. The commit stops the
> next deploy from re-creating it; it cannot remove what is already deployed.

Three more, each of which **blocks a named later phase**:

- **Nothing in the codebase ever deletes a stored recording.** No
  `storage.remove`, no object DELETE, anywhere. Account deletion cascades the DB
  rows; the raw takes — a person's face and voice — survive indefinitely and
  unreferenced. Retention trims telemetry only. **Blocks Phase 11**, which adds
  preflight capture and many more discarded retakes.
- **`generate-blueprint` has none of the Director's injection discipline.**
  Scraped page text and reference transcripts are concatenated into the prompt
  with no data/instruction boundary, while `editorDirector.ts:64-65` states
  exactly the right one. Attack path: publish a video whose speech contains
  instructions → target pastes the link → it reaches the prompt verbatim → the
  model's output is read aloud and posted to the creator's audience.
  **Blocks Phase 12a (posting) and the research layer**, which turns this from
  opportunistic into trivial.
- **Social OAuth access + refresh tokens are plaintext at rest.** Column grants
  are correct so clients can never read them, but any dump or service-role leak
  buys the ability to post as every connected creator. **Blocks §7b analytics
  scopes**, which would widen a leak from "post a video" to "read this
  creator's whole audience".

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
- **`posts` has no join key to a render.** It has `generation_id`; one
  generation has many `edit_projects`. So even with perfect view counts you
  cannot say *which render* was posted. §7b calls performance feedback the only
  real moat and says you cannot recover history you did not record — **this one
  column is the difference, and every video posted before it exists is
  permanently unattributable.** One `ALTER TABLE`. It is the highest-value
  change in this document.
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

1. The four silent joints (§9a.1) — three are one-line fixes; #4 is a handful
2. Stage-boundary contract tests — without these, this recurs elsewhere
3. `posts.edit_project_id` + the decision/outcome tables — irrecoverable if delayed
4. The single-download fix + persist `RenderEvidence` + capture token counts
5. Media deletion and retention — **before** Phase 11 adds preflight capture
6. The blueprint injection envelope — **before** Phase 12a posting
7. *Then* the rest of Phase 9 (long-token wrapping, caption band vs platform UI,
   A/V drift, `pacing`)

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
| 2026-08-01 | Added §9a from a pre-mortem, a security/privacy audit and an efficiency/measurability audit run in parallel. Four silently-broken pipeline joints, one critical credential-vending defect (fixed), and the missing post→render join key. Reorders Phase 9: the inputs come before the polish. |
