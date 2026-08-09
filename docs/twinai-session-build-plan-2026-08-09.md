# TwinAI — build plan from the 2026-08-09 first-recording session

Written at the end of the session that landed #297, #301 and #304, applied
`0118` and `0119` to production, and put a real creator through onboarding →
DNA → plan → recording for the first time.

**What makes this document different from the ones before it:** every item below
was found by USING the product, not by reading it. Where a claim is evidenced by
a query, a grep or a CI guard, the evidence is named. Where something is
suspected and unreproduced, it says so rather than being listed as a bug.

Status legend:

| | |
|---|---|
| ✅ | Merged AND verified in production |
| 🟡 | Merged, deploy not verified |
| ⚠️ | Half-done — one half live, one half not |
| 🔴 | Open |
| 🚫 | Blocked on a human decision |
| ❓ | Reported, NOT reproduced — do not "fix" blind |

---

## 0. The one root cause

Three complaints that arrived separately are the same defect:

- the script is voice-accurate and content-empty ("stupid things")
- a tech creator gets the same script as a doctor
- "I never saw half these questions"

**A creator answers questions; the answers are validated, sanitized, stored — and
then read by nothing.** `scripts/ci/brief_consumers.json` already documents this
and calls it out in its own header. The generator has the creator's VOICE and
almost nothing else, so it can only produce well-shaped, well-voiced emptiness.

Everything in §4 and §5 is a face of this.

---

## 1. ✅ Done and verified in production

| Item | Evidence |
|---|---|
| **One click = one remix.** `generate-blueprint` had no idempotency; `V2Building` guards its build with a `useRef` that dies on remount, so navigating away and back started a second fully-charged build. Three navigations = three charges = one video. | `0119` applied; column + partial unique index confirmed by query. Merged `f9088558` (#304) |
| **`takes` bucket second write door closed.** `0006`'s INSERT policy let any authenticated user PUT bytes with no capture intent, no finalize record and no etag binding. | `0118` applied; `pg_policies` now shows only `twinai takes read` (SELECT) |
| **Credits restitution.** Two of the three duplicate builds were never owed. | `refund_credits` × 2 through the ledger: 20 restitution + 40 test grant. Balance 60 = 6 remixes |

## 2. 🟡 Merged, production deploy not verified

Frontend only. Vercel deploys from `main` automatically; nobody confirmed the
build landed. Do not assume these are live.

- **Unusable reference stops BEFORE the spend.** Previously `assessReference`
  judged the reference correctly, recorded a note, and spent anyway — telling
  the creator at 94% that the script was built from something else.
- **Trust screen stopped contradicting itself.** In pattern mode the banner said
  "We could not read this video" while every INTERPRETED row underneath claimed
  to be "a model's reading of the transcript". There was no transcript.
- **Recorder has somewhere to go.** The review screen's only exits were record
  again / download raw / leave, under a hardcoded "AI editing is being rebuilt".
  Now offers "Turn this into a video" once the source is SAVED, routing to
  `Result` (which already owns the start-edit flow) rather than adding a second
  start seam.
- **Branding** — `@` glyph, scan sparkle, building sparkle → `LogoMark`.

## 3. ⚠️ Half-done

| Item | State |
|---|---|
| **The editor is switched ON but has never run.** All four gates are live: `EDITOR_V2_START_ENABLED` (Supabase, set 05 Aug), `EDITOR_DIRECTOR_ENABLED` + `EDITOR_RENDER_ENABLED` + `GEMINI_API_KEY` (VPS `/opt/twinai-worker.env`, container restarted 06 Aug 15:24, verified by `docker exec printenv`). **`edit_projects` = 0.** Staging proves all 8 phases including the real render; production has never produced one. |
| **Docs describe a system that was turned on three days ago.** `phase7-exit-contract`, `phase5-production-signoff-evidence`, the open-items ledger and the recording-day runbook all say the editor is gated off. `verify-prod-gate.yml` still ASSERTS the secret is absent — it will fail, and the failure will be wrong. |
| **Landing page still says "AI editing — coming soon"** in three places. Deliberately untouched: it stays true until one edit succeeds. |

---

## 4. 🔴 Onboarding & questions — the biggest cluster

### 4a. What is asked, and what is read

Authoritative source: `scripts/ci/brief_consumers.json`.

| Question | Key | Asked? | Read? |
|---|---|---|---|
| Who you're talking to | `audience` | ✅ | ✅ `generate-blueprint` |
| What is your offer called | `offer` | ✅ | ✅ creator's answer beats the scan's guess |
| Anything you're not allowed to claim | `forbiddenClaims` | ✅ | ✅ |
| What do your videos promote | `promotes` | ✅ | ✅ strongest-wired; changes the CTA rule |
| **Your goal** | `goal` | ✅ | ❌ generator prefers voice profile → dna → the literal string `'turn attention into trust'` |
| **What do you do?** | `workKind` | ✅ | ❌ *"a doctor and a hobbyist get the same script"* |
| **"Something else" free text** | `workKindOther` | ❌ **never asked** | ❌ zero refs in `apps/web` |
| **Product evidence** | `productEvidence` | ❌ **never asked** | ❌ `PRODUCT_EVIDENCE_FORM` fully specified, no screen imports it |
| **Anything else you want to make** | `alsoWantsToMake` | ❌ **never asked** | ❌ |
| How can you film (screen / objects) | `can_record_screen`, `can_film_objects` | ✅ | ✅ `DeclaredClips.tsx` |

**4 of 9 do anything. 3 are never asked at all.**

### 4b. Work items

- 🔴 **Wire `workKind` + `workKindOther` into the prompt.** Two lines beside
  Audience and Goal. Highest single lever on script quality.
- 🔴 **Wire `goal`** — stop preferring three other authorities over the answer
  the creator typed.
- 🔴 **Wire `productEvidence`** — so `[SHOW: the product]` points at something
  real instead of the model inventing product details.
- 🔴 **`alsoWantsToMake`** — give it a consumer or delete the question.
- 🔴 **ASK the three that are never asked.** Wiring a question nobody sees
  produces the same empty script. Asking and wiring are one piece of work.
- 🔴 **Interleave questions with the scan.** Currently ~5 minutes of dead
  waiting, then a wall. Two justifications: the wait feels shorter, AND the
  questions actually get answered. In the real session every chip below the
  fold came back unselected.
- 🔴 **Chunk the review screen.** ~5 phone-screens in one scroll.
- 🚫 **What should each `workKind` answer DRIVE?** Needs a product decision
  before code: what changes for Software vs Licensed professional vs Creator.
- ✅ **DECIDED: keep the screen-recording question, do NOT default it to yes.**
  `DeclaredClips.tsx` shows screen slots only on `isExplicitlyTrue`. Removing it
  hides screen shots forever; defaulting to yes hands screen instructions to
  people who cannot record a screen.

---

## 5. 🔴 Scripting & "containers"

"Containers" = what goes INSIDE each script beat, not the shot slots.

**Observed:** the generated script paraphrased the DNA profile back across five
scenes. Scene 3 restated a stored POV almost verbatim. The result is
voice-accurate and information-free — nothing a creator learns anything from.

**Why:** the generator's only inputs were the voice profile, a one-line idea and
a reference that contributed nothing. Voice says HOW to speak; structure says in
WHAT ORDER. Neither says WHAT TO SAY.

Work items:

- 🔴 **Give the containers a substance source.** Three candidates, in order of
  impact: (1) a reference that genuinely reads — already half-built and failing
  silently; (2) a knowledge/research step for the creator's niche — new
  capability; (3) ask the creator for their own material when no reference was
  read — cheapest and most honest, and nothing in the flow requests it.
- 🔴 **Shot list quality.**
- 🔴 **No pattern-interrupt guidance anywhere.**

---

### 5a. The first script from a reference that genuinely read

Everything above was written when the reference contributed nothing. This is the
next run, with the read working — and it isolates the remaining defects exactly,
because for the first time the pipeline's early layers can be marked ✅ and the
failures that are left cannot be blamed on a missing input.

| Layer | Working? |
| --- | --- |
| Reference read | ✅ genuinely read, specifics extracted |
| Creator DNA → voice | ✅ hook template + signature phrases exact |
| Reference → structure | ✅ container transferred |
| Substance / numbers | 🔴 absent — no Product DNA |
| Director / filming | 🔴 invents inventory, hex-coded lighting |
| Feasibility gate | 🔴 none — asks for unfilmable b-roll |
| Claim safety | 🔴 none — unverified income claim |

**Voice is solved. Structure is solved. Substance and production are not.**

**1 · The script has no numbers, because nothing holds the creator's.** The
reference's power came from two figures — $5,000 and $70. The script that
transferred its structure says:

> "…renting by the room, which completely changes the math on your monthly cash
> flow."

No figure anywhere. That is the content-empty defect in a single line, and it
names its own fix: DNA knows how the creator *sounds*; nothing knows what their
deals actually *return*. **Only step 5 (Product DNA) closes this.** The moment
real numbers exist, "changes the math" becomes "$5,200 a month from one
property" and the script stops being a well-spoken empty container.

**2 · Invented physical inventory, with a hex code.**

> "A brightly lit, fully renovated kitchen with subtle #00E5FF cyan backlighting
> under the cabinets."

Also "Creator tossing keys", "a beautifully staged communal living room". This is
the walnut-chair failure and it is worse than documented: it does not merely
assume a renovated kitchen exists, it specifies under-cabinet lighting **in a
named hex colour**, because the brand palette leaked out of packaging and into a
filming instruction. §20's rule — achievable direction plus a reason, never
assumed inventory — is the fix, and the hex leak says the palette needs a hard
boundary at the shot list, not only a better prompt.

**3 · A scene that cannot be filmed, because packaging leaked into the shot
list.** Scene 4: *Silent shot · Where to film: Thumbnail image · Framing: Split
screen*. "Thumbnail image" is not a place to stand.

**4 · COPY THEIRS transferred a production the creator cannot make.**

> "Fast paced visuals of an outdated house transforming into multiple modern
> private suites."

A renovation timelapse — unfilmable in a single-take short, and flagged COPY
THEIRS, i.e. carried over from the reference without anyone asking whether it
could be recreated. This is the exact case the Compatibility Gate (§16b) exists
to answer REJECT on, so its absence is not a quality problem but a missing gate.

**5 · An unverified claim in the title position.**

> "How one working parent replaced their income using a single coliving
> rehabilitation"

A specific outcome claim, permitted by nothing: no `approvedClaims` exists, and
`forbiddenClaims` only forbids what the creator thought to name. For a finance
creator this is the highest-consequence gap in the system — the one whose
failure mode is regulatory rather than aesthetic.

Work items, in the order their value lands:

- 🔴 **Step 5 — Product DNA.** The single most valuable change in the plan. It is
  what turns finding 1 from a phrasing problem into a solved one.
- 🔴 **Step 8 — Director Plan (§20) + a palette boundary.** Findings 2 and 3.
  Brand colours must not be reachable from a filming instruction at all.
- 🔴 **Compatibility Gate (§16b).** Finding 4. A COPY THEIRS beat that the
  creator cannot physically produce must be REJECTed, not transferred.
- 🔴 **`approvedClaims`.** Finding 5. An outcome claim needs a permission that
  exists, not merely the absence of a prohibition.

---

### 5b. The recording run — the recorder's own defects

The first run that got as far as filming. Everything here is from that session,
with the cause established in code rather than guessed.

**1 · The prompter ran on two clocks, and the wrong one drove the text.** 🟡
*fixed, not verified live.* Reported as "there's two scrollers — one going down,
the other highlighting", and scene 2's prompter "vanished in two seconds".

Both symptoms are one number. The word HIGHLIGHT advanced on words-over-WPM; the
GLIDE advanced on the scene's PLANNED seconds (`estSec = plannedSec`, the
adapter's `duration_sec`). Those disagree by exactly however wrong the plan's
estimate was — and scene 2 is the worst case and not a rare one: planned "about
5s", carrying ~45 words. The highlight paced it at ~20 seconds. The glide ran the
whole text past the read-line in five.

The prompter now moves with the reader — progress is the share of the WORDS due
by now, so the highlighted word IS the word at the read-line by construction.
Plus a 0.8s lead-in, because nobody starts speaking on the frame the light turns
red, and without it the creator is behind before drawing breath.

The plan's own number still drives the timing bar and the auto-stop cap. This
changed what the TEXT does, not what the scene is worth.

**2 · "Phone upright ✗" while the phone WAS upright — and the take came out
horizontal. These are the same bug.** 🔴

`getUserMedia` is called with `width: {ideal: 1080}, height: {ideal: 1920}`.
iOS Safari does not honour a portrait ideal that way: it hands back a LANDSCAPE
track. The preview looks vertical only because it is `object-cover` cropped, so
nothing on screen reveals it — but the recorded file is landscape, which is what
the review screen then plays back, and it is the reason a short-form vertical
take arrived horizontal.

`preflightSignals.ts` reads orientation from *the video track's own reported
dimensions*. Given a landscape track it correctly reports landscape. The
checklist was not broken; it was faithfully reporting the real defect underneath
it, in language ("turn your phone upright") that blamed the creator for it.

Fix is one change with two payoffs: constrain by `aspectRatio` (which Safari does
respect) and/or rotate at capture, and the false alarm disappears with the
horizontal file. **Needs a real device to verify — do not ship blind.**

**3 · Three of five preflight rows say "Not checked".** 🔴 — but *by design*, and
the design is right. `framing`, `lighting` and `room` are `unmeasured` because
each needs a face box or a decay measurement the browser will not give, and the
module's header argues at length that a green tick from a check that never ran is
worse than an honest blank. What is wrong is the SCREEN, not the engine: five
rows of mostly "Not checked" reads as a broken feature. Either show only what is
measured, or say plainly what the phone cannot see and why.

**4 · "Check again" appears to do nothing.** 🔴 Not reproduced in code yet. It
re-runs a ~1.2s mic sample and a track read; if orientation is the only row that
can change and it cannot change (defect 2), the button correctly re-measures and
correctly reports the same thing. Suspected duplicate of 2 — verify after 2.

**5 · The take was not saved.** ⚠️ "Saving to your library…" never resolved.
`edit_projects` is still 0 and now `takes` may be too. **This is the highest
priority item in the whole plan** — see §10.1: nothing downstream matters until
one take completes in production.

Two things were wrong and only one of them is fixed.

*Fixed:* the screen could not tell a slow upload from a dead one.
`uploadSourceRecording` has accepted an `onProgress` callback all along and the
teleprompter passed `undefined`, so one static sentence covered the whole
upload. And `failSave` names five distinct causes — but a STALLED upload
produces no error to name: an XHR whose connection dies mid-PUT can sit open
indefinitely, so the promise never settles and the catch never runs. There is
now a percentage, and a deadline on SILENCE (45s with no bytes moving; a slow
upload that keeps reporting is left alone however long it takes). The Blob stays
in memory, Download still works, and Retry reuses the same attempt id.

*Not fixed, because it is not yet known:* WHY it stopped. The instrumentation
above is what makes the next run diagnostic rather than another blank — it will
say whether the upload never started, stopped at 60%, or completed and failed to
finalize. Until then, naming a cause would be a guess.

**6 · Reopening the review screen after ~5 minutes restarted everything.** 🟡
Same class as the V2Building replay, in a second screen: state held in refs that
die with the component, so a remount re-runs the sequence. The V2Building fix
(look up what already exists, then navigate) is the shape of this one too.

**7 · The plan the creator filmed against contains §5a's defects, live.**
Scene 2 was "Show the product · about 5s" whose direction reads "Real footage of
a dusty, outdated living room being framed out into separate bedrooms" and "None
for the creator, as this is a b roll overlay sequence" — an unfilmable COPY
THEIRS beat handed to someone standing in their bedroom holding a phone. The hook
is "replace your paycheck with passive income", the unverified claim. Not new
findings; confirmation that §5a's four gaps reach the creator.

---

### 5c. One field doing three jobs — the shot-list defect

`WHERE TO BE / BACKGROUND` is the field the creator reads while standing in a
room holding a phone. It is being filled with b-roll.

| Scene | What it said | What it should have said |
|---|---|---|
| 1 | "Real footage of a dusty, outdated living room being framed out into separate bedrooms" | where the creator physically stands |
| 2 | "Footage of a beautifully staged communal living room, then cutting back to the creator in the kitchen" | a background — the cutaway belongs to the edit, not to him |
| 4 | "Same brightly lit kitchen, ensuring the #00E5FF cyan lights are visible" | achievable direction, and no hex code anywhere near a physical instruction |

Location, b-roll and edit instruction are three layers collapsed into one string.
A creator is being told to *be inside footage that does not exist* — which is the
exact failure the ownership matrix exists to prevent, arriving because nothing
enforces the matrix at the field level.

**The required split.** Three fields, because they have three different owners
and three different failure modes:

- `location` — where the creator physically stands. Achievable direction only:
  never assumed inventory, and **never a hex colour**. The observed
  "#00E5FF cyan backlighting under the cabinets" is the brand palette reaching a
  physical instruction, which no amount of prompt tuning makes safe; the palette
  must not be reachable from this field at all.
- `brollRequest` — footage to supply, **gated on whether this creator can
  actually produce it**. Ungated, it is finding 4 of §5a with a new name.
- `editorIntent` — cutaway and return timing, consumed by the Edit Plan and
  **never rendered as a place to stand**.

**The contradiction that makes it unusable.** Scene 1 is labelled `Talking`,
carries a line to say, and then reads *"WHAT TO DO WHILE YOU TALK: None for the
creator, as this is a b roll overlay sequence."* The recorder asks him to perform
a scene it simultaneously tells him he is not in. He stands there reading a line
while the app says he is not needed.

Scene type, spoken line and performance direction must be mutually consistent or
the scene is invalid. **This is a contract check**, not a prompt instruction — a
scene that says both things is malformed and should never reach a recorder.

**Scene type must be gated on capability.** Scene 2 was `Show the product` for a
creator who has no product: `workKind` is coaching, the CTA is "apply for my
one-on-one coaching program". The scene type came from the reference — where
there *was* a product, a $70 framed keepsake — and transferred without anyone
asking whether it could be filled.

That is the Compatibility Gate's job exactly (§16b): every reference dimension
resolves to TRANSFER / ADAPT / REJECT / NOT OBSERVED *before* the Creative
Decision Plan, so `product demonstration → REJECT, creator has no physical
product` is a decision the system makes rather than a gap the creator discovers
while filming.

Work items:

- 🔴 **Split the field into `location` / `brollRequest` / `editorIntent`**, with
  the palette unreachable from `location`.
- 🟡 **Scene-consistency contract check** — `sceneConsistency.ts`, with the two
  real strings from the run as its tests. `palette_leak` is EXACT: a hex colour
  in an instruction a person carries out with their hands is always wrong.
  `absent_performer` is a HEURISTIC and is documented as one — it reads the
  stated contradiction, and a model that phrases it differently escapes. The
  recorder now withholds the contradicting line rather than showing both halves.
  The heuristic exists only until the field split lands, which removes what it
  catches.
- 🔴 **Compatibility Gate (§16b)** — scene types gated on capability, so an
  unfillable type is REJECTed rather than rationalised.

---

## 6. 🔴 The reference pipeline

- 🔴 **`mode: 'pattern'` must be a hard stop before spending, in EVERY path.**
  Currently only the too-long case stops. The no-transcript case (ingest failed,
  timed out, private, unsupported host) still falls through and charges for a
  script built without the reference.
- 🔴 **Nine things are never observed** — shot choices, camera work, framing,
  caption design, transitions, b-roll purpose, zooms, music, pacing of dead
  space. Not a bug in the reader: **the system reads transcripts, never pixels.**
  Making these real needs frame sampling, shot detection, caption OCR. This is
  the widest gap between what the product claims and what it does.
- 🔴 **Long references should be rejected at paste time**, not after a 72s
  ingest poll.

---

## 7. 🔴 Recorder & saving

- 🔴 **Pre-record checklist can't check.** 3 of 5 items say "Not checked — worth
  a look yourself" (you in frame, light on your face, room sound). A checklist
  that cannot check is a to-do list.
- 🔴 **Teleprompter text overlaps the Record button** — unreadable while
  recording.
- 🔴 **Background / phone / laptop positioning guidance is generic.** "Warm beige
  background" to someone in a bedroom at night. Should work from what the
  creator actually has, informed by the reference and DNA.
- 🔴 **"Saving to your library…" never confirms.** Partially masked now, since
  the new edit button only appears once `saveState === 'saved'`, but the state
  itself still doesn't visibly resolve.
- 🔴 **Progress bar restarts from 0 on remount.** The CHARGE is fixed; the
  animation still replays.

---

## 8. ❓ Reported, not reproduced

- ❓ **Gallery showed `Lifestyle` for a `Productivity & Business` voice.**
  Stored voice is `niche: "Productivity & Business"`, `sub_niche: "feel-good
  productivity"`. `resolveNiche` scores that to **Business** (the `business`
  keyword hits; nothing else scores). One default voice per owner, so not a
  multi-default collision. **Do not ship a guess.** Needs a live repro with the
  actual runtime state.

---

## 9. 🔴 Security & housekeeping

- 🔴 `create_workspace_invite()` has **no `auth.uid()` check**. It survives an
  anonymous call only because `workspace_invites.owner_id` is `NOT NULL` — an
  accidental guard, not an intentional one. Drop that constraint some day and it
  becomes an unbounded anonymous insert.
- 🚫 **Leaked-password protection is disabled.** One dashboard toggle, owner
  only. Highest value-per-effort item on the whole board.
- 🔴 11 functions with a mutable `search_path`.
- 🔴 `pg_net` installed in `public` (cosmetic; moving it risks more than it
  fixes).
- 🔴 Three test files pass a dead `uploadTake` prop to `initApi`. Inert —
  `packages/shared/tsconfig.json` excludes `__tests__` from typecheck.
- 🔴 **`verify-prod-gate.yml` asserts the editor secret is ABSENT.** Now wrong.
  Update it to assert deliberate-ON, or it becomes a red check that means
  "you switched your product on".

---

## 10. Recommended order

1. **Get ONE take saved, then press "Turn this into a video."** `edit_projects`
   is 0. Nothing below is worth tuning until the pipeline has succeeded once in
   production. Credits are available. §5b.5 escalates this: the run that was
   meant to produce that take ended on "Saving to your library…" that never
   resolved, so the blocker is now the save itself, not the willingness to film.
1b. **The vertical take that records horizontal** (§5b.2). A short-form product
   that writes landscape files fails at the last step regardless of script
   quality — and it is also the cause of the false "phone upright" alarm.
   Device-verified, not blind.
2. **Reference `pattern` → hard stop before spend, every path.** If we have no
   substance, do not sell a script.
3. **`workKind` + `workKindOther`: ask AND wire.** The single largest lever on
   script quality.
4. **`goal` and `productEvidence`: ask AND wire.**
5. **Interleave questions with the scan; chunk the review screen.**
6. **Product DNA (§28 step 5).** Promoted by §5a: with the reference read
   working, the missing numbers are now the top defect in the produced script,
   and nothing else in this list addresses them.
7. **The shot list the creator films against** (§5c), in this order because each
   is cheaper than the one after it: the three-field split
   (`location`/`brollRequest`/`editorIntent`) with the palette unreachable from
   `location`; the scene-consistency contract check; then the Compatibility Gate
   (§16b) gating scene TYPE on capability. Plus `approvedClaims` (§5a.5).
8. **Visual analysis of the reference** — the nine NOT OBSERVED rows.
9. Recorder guidance, checklist, teleprompter overlap.
10. Security backlog.

---

## 11. What this session proved

The first real run through the product found, in one sitting: a billing defect
that charged 3× for one video, a trust screen that contradicted itself four
lines apart, a recorder that dead-ended by design, a storage write path open
since `0006`, five questions that change nothing, three that are never asked, and
a documentation set describing a system that had been switched on three days
earlier.

None of it was visible from reading the code. All of it was visible in twenty
minutes of using it.
