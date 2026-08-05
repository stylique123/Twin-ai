# The question layer — what we ask, when, and who reads the answer

**Status:** specification. Nothing here is built yet.
**Owner:** one session, working alone on this. See "Boundary" first.

---

## 0. BOUNDARY — read this before anything else

There is a second track already assigned to another session:

> **Track B (NOT this work):** the composition model, a second video source in
> `EditPlan` + `ffmpegGraph`, and the screen-capture UI.

**Track B must not touch onboarding, and this track must not touch the editor
or the capture UI.** They meet at exactly one place: `can_record_screen`.

That flag was originally listed as Track B's first item. **It moves here.** Track
B should be told: *do not build the onboarding question; assume the flag arrives
answered.* Otherwise two sessions build the same question in two places and the
three-state logic gets implemented twice, differently.

| | Track A (this) | Track B (other session) |
|---|---|---|
| Onboarding, all questions | ✅ owns | ❌ never |
| `capability_flags` storage + write path | ✅ owns | ❌ never |
| Reads the flags to decide what to SHOW | ✅ | ✅ (capture UI only) |
| `EditPlan`, `ffmpegGraph`, second source | ❌ never | ✅ owns |
| Screen-capture recorder UI | ❌ never | ✅ owns |

---

## 1. The problem being fixed

`preScriptBrief.ts` already defines two stages — `during_scan` and `on_confirm`
— and marks five questions `during_scan`. **The onboarding screen imports none
of it** (zero references). Every question landed on the confirm screen, and the
45–60 second scan wait is empty.

So the contract exists, the split is designed, and nothing obeys it.

Separately, three things nobody can currently answer:

- **is this an affiliate creator, a brand, or someone with nothing to sell?**
  §8a.3's container rule depends entirely on this and has no input
- **can they film objects / record a screen / do they need approval?** asked
  nowhere; every consumer answers "we don't know"
- **who is the audience, really?** what we show is a model's reading of their own
  captions. §8a.2: that is `inferred`, not `observed`

---

## 2. THE FOUR MOMENTS

Every question belongs to exactly one. The test for each is written down so a
future edit has to argue with a reason rather than a preference.

### Moment 1 — BEFORE the scan
**One field only: the handle.** Nothing else. Anything added here is friction in
front of the only step that has to feel instant.

### Moment 2 — DURING the scan (45–60s, currently wasted)
**The test: could the scan ever answer this? If no, it belongs here.**

These are questions about INTENT and CONSTRAINT. Reading someone's posts can
never reveal what they want, what they sell, or what they are allowed to say.

### Moment 3 — ON CONFIRM
**The test: did the scan produce a draft answer? If yes, it belongs here.**

These are OBSERVABLES, pre-filled, and the creator is correcting rather than
typing. Asking someone to describe content we are actively reading is wasted
effort *and* less accurate — people mis-report their own format.

### Moment 4 — PER VIDEO
**The test: could the honest answer differ between two videos by the same
person? If yes, it can be re-asked here — never re-asked by default.**

Only capability flags live here, and only as an override. §2.2's rule: *"flags
compose; archetypes don't. Flags change per video."*

---

## 3. THE QUESTION INVENTORY

### Moment 2 — DURING THE SCAN (8 questions, ~50 seconds)

| # | Question | Type | Why not later |
|---|---|---|---|
| 1 | **What do you want these videos to do?** | one of: sell · book calls · grow · teach · launch | Intent. The scan cannot see a goal |
| 2 | **What do you do?** | professional · ecommerce · brand · creator · saas | Decides Q3 and Q4 |
| 3 | **What do your videos promote?** | **your own product · someone else's (affiliate) · nothing to sell** | **THE MISSING ONE.** §8a.3's container rule is undefined without it |
| 4 | **What is your offer called, and what does it do?** | free text | Pre-filling it makes a guess into a CTA on every video |
| 5 | **Is there anything you are not allowed to claim?** | free text · "no restrictions" · skip | Only for professional / ecommerce / brand. Never for SaaS — asking a compliance question of someone with no compliance regime trains them to skip it, which is how the doctor skips it too |
| 6 | **Can you show a product or object on camera?** | yes · no | Capability. Unanswerable from posts |
| 7 | **Can you record your screen?** | yes · no | Capability |
| 8 | **Does anyone approve your videos before they go out?** | yes · no | Capability |

**Q3 is the new one and the important one.** Everything else already exists in
some form; Q3 exists nowhere and unblocks the most.

**Q6–Q8 must be THREE-STATE.** A skipped question is `null`, never `false`.
`unset` and `false` mean different things and 0103 already enforces that in SQL.
The screen must offer a way to move on without answering.

**Seeding is allowed; deciding is not.** If the scrape saw software-walkthrough
formats, Q7 may be *pre-suggested* — clearly marked as a suggestion the creator
confirms. §8a.2's rule holds: observed is not stated, and a pre-ticked box the
creator never looked at is a guess wearing an answer's clothes.

### Moment 3 — ON CONFIRM (pre-filled from the scan)

Everything already on that screen stays: niche, tone, pacing, hook style,
signature words, recurring CTAs, do/don't, enemy, POV, hook patterns, formats.

**Add two, both pre-filled:**

| Question | Pre-filled from | Why here |
|---|---|---|
| **Who are you talking to?** | the scan's inferred audience, **labelled as inferred** | The scan drafts it. The label matters: *"your content reads as student-focused"*, never *"your audience is students"* — we read captions, we have no follower data |
| **Anything else you want to make?** | nothing | Free text. A creator whose posts are all one format may want another, and the scan can only ever see the past |

### Moment 4 — PER VIDEO (override only, never re-asked by default)

The three capability flags, on the plan screen, shown **only** when a consumer
would act on them. The video's answer beats the brand default *including when it
says false* — `resolveCapabilities` already implements this.

---

## 4. WHERE EACH ANSWER GOES

| Answer | Column | Exists? |
|---|---|---|
| goal, audience, offer | `profiles.dna` / `brand_voices.profile` | ✅ |
| workKind, forbiddenClaims | `onboardingDraft` → profile | ✅ (partly) |
| **promotes** | **NEW — `brand_voices.profile.promotes`** | ❌ needs adding |
| can_film_objects, can_record_screen, needs_approval | `brand_voices.default_capability_flags` | ✅ 0103, applied |
| per-video override | `generations.capability_flags` | ✅ 0103, applied |

**Only one storage change is needed: `promotes`.** Everything else has a column
already applied to production. If it fits inside the existing `profile` jsonb,
no migration is required at all — check before writing one.

---

## 5. WHO READS EACH ANSWER — the part that makes this worth doing

A question with no consumer is the exact failure the gap audit names seven
times. **Nothing in this spec ships without naming its reader.**

| Answer | Consumer | Built? |
|---|---|---|
| `can_film_objects` | §7a gallery production-mode match | ✅ **built and starved** — reads it today, answers "don't know" for everyone |
| `can_film_objects` | Footage checklist (Phase 12 item 12) | ❌ not built |
| `can_record_screen` | §7a production-mode match | ✅ **built and starved** |
| `can_record_screen` | Capture UI | ❌ **Track B** |
| `needs_approval` | Approval lock on the review screen | ❌ not built |
| **`promotes`** | **§8a.3 container rule** — what fills "three products I stopped using" | ❌ not built; **this is the highest-value new consumer** |
| `promotes` + `offer` | `generate-blueprint`'s CTA beat | ⚠️ offer IS consumed; `promotes` is absent from the brief |
| `workKind` | claims conditional | ✅ built |
| `goal` | blueprint prompt | ✅ **VERIFIED** — `index.ts:674`, `- Goal: ${goal}` |
| `audience` | blueprint prompt | ✅ **VERIFIED** — `index.ts:670`, `- Audience: ${audienceResolved}` |

**Verified 2026-08-05 by reading the function.** `goal`, `audience` and `offer`
are interpolated into the creator brief at `generate-blueprint/index.ts:670-674`,
with fallback chains (`vp?.audience ?? dna.audience ?? 'unspecified'`) and a
derived `"people into {niche}"` when audience is unspecified, so the model never
receives the literal word "unspecified".

**Consequence: better answers to those three produce better scripts with no code
change.** The only prompt work needed is `promotes` — the brief currently says
*"Product or offer the CTA should point at: {offer}"* with no idea whether that
offer belongs to the creator or is an affiliate link.

**Two are already built and starved.** Answering Q6 and Q7 switches on §7a's
production-mode match with no further code. That is the cheapest win in the
project.

### The teleprompter and the director — a correction

Do **not** invent a question for teleprompter behaviour. That decision is
already made and recorded: Phase 11 item 7a routes on the script's own
`scene_type` / `purpose` / `show_in_teleprompter` fields, **derived from the
script, never from a creator-facing enum.** A "what kind of video is this?"
question would be the retired archetype trap in a new costume.

The director reads the brand snapshot and the analysis components. It does not
need a new question either.

---

## 6. WHEN TO TURN ON THE AI EDITOR

The editor is built, tested, and gated on one server env var:

```
EDITOR_V2_START_ENABLED   # 'true' enables; production is currently off
```

**It is not blocked by anything in this spec.** Turning it on is a decision, not
a build.

The honest gate before flipping it in production:

1. **One real take** through `validateSource` end to end
2. **One full pipeline run** — inspect → transcribe → analyze → direct → compile
   → render → validate — producing a playable file
3. **One human through the review screen** (§4.8's claim that editing the words
   reads as editing the video is untested by anything)
4. Check `EDITOR_MAX_ACTIVE_PROJECTS` (default 3) suits the expected load

Steps 1–3 need one person and one phone. **Enable it for a single test account
first** — the flag is server-side and global, so consider whether a per-owner
allowlist is needed before a wider flip.

---

## 7. BUILD ORDER — everything possible before a recording is needed

**Step 1 — the scan-time question step.** Wire `Onboarding.tsx` to
`questionsFor('during_scan', answers)`. The contract exists and is tested; the
screen ignores it. Q5's conditional and Q6–Q8's three states come free.

**Step 2 — add `promotes`.** One question, one field, and then the §8a.3
container rule becomes buildable.

**Step 3 — move the confirm screen onto the contract.** Same function,
`'on_confirm'`. Add the audience question with its inferred label.

**Step 4 — teach the brief about `promotes`.** No verification needed: goal,
audience and offer are confirmed consumed at `index.ts:670-674`. `promotes` is
absent, so add one line to the creator brief and one instruction telling the
model what an affiliate CTA may and may not claim (it points at someone else's
product — the creator cannot vouch for it the way they can for their own).

**Step 5 — the §8a.3 container rule.** Route what fills a container on
`promotes`: affiliate → researched products; brand → confirmed own products
only; nothing-to-sell → ideas or mistakes, never a forced product.

**Step 6 — the footage checklist**, gated on `can_film_objects` being explicitly
false. Note the gate direction: **silence means SHOW it.** An unnecessary
checklist is friction; a missing one is a video the creator cannot make.

**Step 7 — the approval lock**, gated on `needs_approval` explicitly true.
Opposite direction — must not appear until asked for.

Steps 1–7 need no camera and no editor change.

### Gate directions, because they are not uniform

| Flag | Gate | Why |
|---|---|---|
| `can_film_objects` = false | **hides** the footage checklist | Missing checklist costs a video; unnecessary one costs friction |
| `can_record_screen` = true | **shows** the capture UI | `capabilities.ts` names this exact case: must not appear until asked for |
| `needs_approval` = true | **shows** the approval lock | Same — an approval step nobody asked for is worse than none |

Getting one of these backwards hides a feature from everyone or shows it to
everyone. They are not symmetric and cannot be written as one helper.

---

## 8. WHAT NOT TO DO

- **Do not put questions before the scan.** One field, then go.
- **Do not default a capability flag to false.** 0103 refuses it in SQL and the
  gallery would tell a creator who cannot film that all 6,608 references suit
  them.
- **Do not pre-tick a capability from the scrape without showing it as a
  suggestion.** Observed is not stated.
- **Do not add a "what kind of video is this?" enum.** §2.2 retired archetypes;
  the teleprompter routes on the script's own structure.
- **Do not build a question without naming its consumer in the PR.** That is the
  failure the gap audit found seven times.
- **Do not touch `EditPlan`, `ffmpegGraph`, or the capture UI.** Track B owns
  them.

---

## 9. THE HANDOFF — copy this to the next session

> **Read `docs/twinai-question-layer-spec.md` first. You own Track A: the
> question layer. Another session owns Track B (the editor's second video
> source, `EditPlan`, `ffmpegGraph`, the screen-capture UI). Do not touch
> Track B's files. Track B has been told to drop the `can_record_screen`
> onboarding question — it is yours.**
>
> Build in this order. Each step names its consumer; if a step has no consumer,
> stop and say so rather than shipping it.
>
> **1. Wire the scan-time step.** `Onboarding.tsx` currently imports nothing
> from `preScriptBrief.ts`. Use `questionsFor('during_scan', answers)`. Eight
> questions, asked while the scrape runs. The contract, the conditional and the
> three-state helpers already exist and are tested — this is wiring, not design.
>
> **2. Add `promotes`.** own product · affiliate · nothing to sell. Add it to
> `BRIEF_QUESTIONS` at `during_scan`. Store in `brand_voices.profile` if the
> jsonb allows it — check before writing a migration.
>
> **3. Move the confirm screen onto the contract.** Same function,
> `'on_confirm'`. Add the audience question pre-filled and LABELLED INFERRED,
> and "anything else you want to make".
>
> **4. Teach the blueprint brief about `promotes`.** `goal`, `audience` and
> `offer` are already consumed (`generate-blueprint/index.ts:670-674` — verified,
> do not re-verify). Only `promotes` is missing. The brief says *"Product or
> offer the CTA should point at: {offer}"* with no idea whose product it is.
>
> **5. The §8a.3 container rule.** Route container filling on `promotes`:
> affiliate → researched products; own product → confirmed catalogue only;
> nothing to sell → ideas or mistakes, never a forced product.
>
> **6. The footage checklist**, gated `can_film_objects === false` HIDES it.
> Silence shows it.
>
> **7. The approval lock**, gated `needs_approval === true` SHOWS it. Silence
> hides it.
>
> **Do not:** put questions before the scan · default a capability flag to false
> · pre-tick a capability from the scrape without marking it a suggestion · add
> a "what kind of video is this?" enum · ship a question without naming its
> consumer in the PR.
>
> **After step 1 alone**, §7a's production-mode match stops answering "we don't
> know" for every user. That is the cheapest win available and it needs no other
> step.

## 10. TURNING ON THE AI EDITOR — independent of all of the above

Not blocked by Track A or Track B. One server env var:

```
EDITOR_V2_START_ENABLED=true
```

Prerequisites, in order, and all needing one person with a phone:

1. one real take through `validateSource`
2. one full pipeline run producing a playable file
3. one human through the review screen — §4.8's claim is untested by anything

Enable for one test account first. The flag is global and server-side; if a
per-owner allowlist is wanted, that is a small change to `start-editor-v2`.
