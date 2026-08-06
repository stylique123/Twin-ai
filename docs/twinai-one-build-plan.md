# TwinAI — one build plan

**Who this is for:** the next sessions. Read PART 0 and PART 1 before touching
anything. Every item in PART 4 says what *building* it means and what is
*different for the creator* once it is built. An item that cannot answer the
second question does not get built.

**Status of the codebase this describes:** `main`, August 2026. Every claim
below was checked against the files, not against another document. Where a
thing is unverified it says so.

---

## PART 0 — THE GOAL, IN ONE PAGE

### What the creator experiences when this is done

A creator pastes their handle. We read their existing posts and build their
DNA — voice, formats, colours, logo, platforms.

**While that scan runs, we ask them the things no scan can tell us:** what they
want the videos to do, who they're for, what they actually do for a living, and
whether there's anything they're not allowed to claim. If what they do implies a
product, we ask for the product itself — a link or images, not a description.

Then they confirm. We ask the last two: what their videos promote, and anything
else they want to make.

From that point every answer is *load-bearing*:

- The **script** is written for a SaaS founder or a doctor or a hobbyist —
  because it was told which one, and told what they may not say.
- The **product beat** names their actual product and shows its actual image,
  because we captured it. If they sell nothing, there is no product beat — the
  video is three ideas or three mistakes instead, and it is still worth posting.
- The **teleprompter** shows the lines to say and hides the ones that are
  directions, routed on the script's own structure.
- The **shot list** knows whether they can film objects and whether they can
  record their screen, so it never asks for a shot they cannot get.
- The **editor** cuts to their colours and their logo, with caption contrast
  checked against the colours they actually chose.
- Afterwards the **outcome log** records what the post did, and the gallery
  ranks by what can actually be checked — not by what looks good.

**One sentence:** everything we ask, something reads.

### The failure this plan exists to end

We are good at building things and bad at connecting them. The repository
contains, right now, working and tested modules that nothing calls:

- `creativeTransferRows.ts` — complete, tested, **zero consumers outside its
  own test file.**
- `workKind`, `promotes`, `productEvidence`, `alsoWantsToMake` — asked of every
  creator, written to the database, **read by nothing in
  `supabase/functions/`.**
- The screen-clip capture — records, uploads, stores, **and is dropped at
  render** because the renderer takes one video input.

Each of these was a good PR. None of them changed what a creator gets. **A fact
with no reader is not a feature; it is a debt with a nice test suite.**

---

## PART 1 — THE FIVE CHAINS

Everything in this plan is one of five chains. A chain is complete when a thing
a creator does changes a thing a creator sees. **Judge every PR by which chain
it completes, not by what it adds.**

### Chain 1 — ANSWER → SCRIPT
`Onboarding question` → `brand_voices.pre_script_brief` → `generate-blueprint`
prompt → the script and its CTA.

**Complete for:** `goal`, `audience`, `offer`, `forbiddenClaims`.
**Broken for:** `workKind`, `promotes`, `productEvidence`, `alsoWantsToMake`.

### Chain 2 — ANSWER → SHOT LIST
`Capability question` → capability flags → the container rule → what the plan
screen tells them to shoot.

**Complete for:** nothing end-to-end. `capabilities.ts` and
`containerResolution.ts` both exist and are correct; the questions that feed
them are partly asked and the container rule does not yet branch on `promotes`.

### Chain 3 — BRAND → RENDER
`Brand kit` → `brandSnapshot` pinned into the boot manifest → captions and
overlays → the finished video.

**Complete.** This is the one chain that works end to end, and it is the model
for the others: the snapshot is *pinned*, so a brand edited mid-render cannot
retro-alter a running edit, and `captionColours.ts` enforces a contrast minimum
against the colours actually chosen. **Copy this shape.**

### Chain 4 — FOOTAGE → EDIT
`Recording` (+ screen clips) → `EditPlan` → `ffmpegGraph` → the render.

**Broken by design, not by bug.** `ffmpegGraph.ts` references only `0:v` and
`0:a`. `EditPlan.identity.sourceAssetId` is singular. A second source cannot
composite until both change. Everything about screen recording upstream of this
works and dead-ends here.

### Chain 5 — POST → LEARNING
`Published post` → outcome log → gallery rank → what we suggest next time.

**Half complete.** The log and the rank are built and displayed. Nothing yet
feeds them back into the next script.

---

## PART 2 — WHAT IS ALREADY TRUE (do not rebuild)

Verified in the files. Rebuilding any of this is the most expensive mistake
available.

| thing | where | state |
|---|---|---|
| Voice, tone, formats, platforms from the scan | `generate-blueprint` | working |
| `goal` / `audience` / `offer` in the script prompt | `generate-blueprint:605-674` | working |
| `forbiddenClaims` as a hard COMPLIANCE block | `generate-blueprint:751` | working, and **the pattern to copy** |
| Brand colours + logo into the render | `brandSnapshot.ts`, pinned in the boot manifest | working |
| Caption contrast against chosen colours | `captionColours.ts` | working |
| Teleprompter routing | `scene_type` / `purpose` / `show_in_teleprompter` | working |
| The brief's questions, storage, sanitisers | `preScriptBrief.ts` | working |
| What a product answer *is* (pixels + section map) | `productEvidence.ts` | working, unread |
| Container slot detection | `containerResolution.ts` | working, partly consumed |
| Capability flag three-state logic | `capabilities.ts` | working, unfed |
| Screen clip capture + storage | `clip-asset`, `ScreenClipRecorder.tsx` | working, dead-ends at render |
| Craft checks, outcome log, gallery rank | `craftFacts.ts`, `outcomeLog.ts`, `galleryRank.ts` | working, displayed |

### Two design rules already proven here — obey them everywhere

**1. Unanswered is not "no".** A capability flag is `true`, `false`, or
**unset**, and unset is never false. `generate-blueprint:751` carries this into
the prompt correctly: an unanswered `forbiddenClaims` emits **no text at all**,
rather than a line reading "restrictions: none". A sentence asserting the
negative is this system telling the model something nobody said.

**2. Pin what you read.** `brandSnapshot` is captured into the boot manifest so
a mid-render edit cannot change a running job. Any new fact the render depends
on gets pinned the same way.

---

## PART 3 — THE THREE THINGS THAT ARE GENUINELY NOT BUILT

Distinguish these from the wiring in PART 4. These need decisions, not just
work.

### 3a. The second video source
Screen clips are captured and thrown away at render. Fixing it means
`EditPlan.identity` takes a list of sources and `ffmpegGraph` builds a graph
with `1:v` in it — overlay or split-screen placement, plus the Director
deciding *when* to cut to the clip. **This is the largest single piece of
unbuilt work and it is not a wiring job.**

### 3b. Research — what to put in the container for someone with nothing to sell
A tech creator who wants followers has no product beat. §2.3's rule says the
container fills with three ideas or three mistakes rather than a forced product
— that stops the bad outcome, but it does not yet produce a *good* one.

The good outcome is: go and find what is live in their niche this week, verify
it exists and is recent, and hand it to them as the substance of the video.
**Nothing does this.** It needs a research layer with verification, because an
unverified "trending" claim is a confidently wrong recommendation, and those
cost the creator their credibility.

**This is the difference between a script they can post and a video worth
watching.** Treat it as its own track, and do not let it be absorbed into the
wiring work — it will be, because the wiring is easier.

### 3c. The editor is off
`start-editor-v2` refuses unless `EDITOR_V2_START_ENABLED` is `true`. It is off
in production. Turning it on needs the prerequisites verified against the
deployed environment, not against the file that describes it, and needs one
real recording from one real phone.

---

## PART 3.5 — EVERY SCENARIO, END TO END

The system already has the vocabulary for this. **7 work kinds × 7 goals**, and
they are enums in `preScriptBrief.ts`, not free text — because a decision cannot
be made from a sentence nobody parses.

```
BRIEF_WORK_KINDS = creator · professional · ecommerce · brand · saas · local_service · other
BRIEF_GOALS      = followers · authority · educate · leads · sell · entertain · personal_brand
```

**`promotes` has no pinned values yet.** `preScriptBrief.ts` says so in its own
comment. Pinning them is a decision this plan owns — see **A0** below, and do it
before A3.

### The nine journeys

Each row is a real person. Read it left to right: it is what the system should
do for them, and the last column is what is missing today.

---

**1 · SaaS founder — "sell" / "leads"**
`saas` · leads with a **link** · claims question **not asked** (their constraints
are competitive, not regulatory) · `promotes = own product`

We capture their product page: pixels and section map, top-to-bottom, because
the page is already ordered by someone who thought about what matters first.
The script names real features from the capture and invents none. `[SHOW: …]`
becomes a screen recording of the dashboard — the only truthful way to show a
logged-in product. CTA points at the trial or the demo.

*Missing:* the capture reaches nothing (A4), and the screen recording is
dropped at render (D1).

---

**2 · Ecommerce / physical product — "sell"**
`ecommerce` · leads with **images**, deliberately — a product *page* is
marketing copy, the product is an object, and it is the object that has to be
filmed · claims question **asked** · `promotes = own product`

The shot list says *hold up this*, with the captured still beside it. Needs
`can_film_objects` — if they cannot film the object, the whole plan has to
change shape, and today §7a's production-mode match is built and receiving
nothing.

*Missing:* A4, and B1 for the capability.

---

**3 · Affiliate — "sell" / "followers"**
`creator` today · `promotes = affiliate` · the distinction `workKind` **cannot**
make

They cannot vouch for someone else's product the way they can for their own, and
the script must know that. The container fills with researched products whose
existence and recency are verified — never inferred.

*Missing:* A3 for the branch, **and Track C for the verification.** Without
Track C an affiliate gets a container with nothing trustworthy to put in it.

---

**4 · Tech creator, nothing to sell — "followers"**
`creator` · product question **not asked** (correctly — asking about a thing that
does not exist teaches people to click past the questions that matter) ·
`promotes = nothing to sell`

No product beat. The container fills with three ideas or three mistakes, drawn
from what is live in their niche this week and verified.

*Missing:* **this is the Track C case.** Today they get a well-shaped empty
video. This is the journey that decides whether Twin is worth using for the
largest group of people who will try it.

---

**5 · Doctor, lawyer, accountant — "authority" / "educate"**
`professional` · leads with a **link** · claims question **asked** ·
`promotes = own product` (their practice)

Their "never say cure" binds the model rather than advising it. This is the one
journey where a wrong word is a regulatory problem, not a bad video.

*Working:* the COMPLIANCE block already does this correctly, and emits nothing
when unanswered.
*Missing:* `workKind` never reaching the script (A2), so the script still
doesn't know it is writing for a doctor.

---

**6 · Brand / agency account — "authority" / "personal_brand"**
`brand` · leads with a **link** · claims question **asked**

Multiple products, an existing style guide, and usually someone who must approve
before it posts.

*Missing:* A4, and **B2 — approval only counts if the lock ships with the
question.** A brand that answered "yes, needs approval" and can still publish
unreviewed is worse off than one never asked.

---

**7 · Local service — plumber, salon, gym — "leads"**
`local_service` · leads with a **link**

Their product is a place and a person. The CTA is "book", not "buy", and the
proof is the work itself — which means filming objects and locations.

*Missing:* B1 and B3. The CTA today falls back to "Follow for more", which is
close to useless for someone who needs the phone to ring.

---

**8 · Personal brand / coach — "personal_brand" / "authority"**
`creator` or `professional` · `promotes` varies and **must be asked** — this is
the journey where guessing is most tempting and most wrong

Sometimes a course exists, sometimes nothing does. The same person is journey 4
one month and journey 1 the next.

*Missing:* A3. Without `promotes` read, we guess, and we guess wrong half the
time.

---

**9 · "Other" — the escape hatch**
`other` · leads with **either** form · free text in `workKindOther`

*Missing:* A2 must send `workKindOther`, not just `workKind`. Otherwise the
creator types the one sentence explaining what they actually do and we discard
it at the last hop — the most insulting version of this bug.

---

### What the matrix proves

Read down the *Missing* column: **A2, A3, A4 and Track C appear in almost every
row.** Nine different people, four shared fixes. That is the argument for the
build order in PART 4 — Track A is not a small cleanup, it is the thing standing
between every one of these journeys and working.

And exactly one journey needs something nobody has designed yet: **number 4.**

---

## PART 4 — THE BUILD, IN ORDER

Every item states: **what building it means** and **what changes for the
creator.** If the second is blank the item is not ready.

### TRACK A — Wiring. No new questions, no migrations. Do this first.

Highest ratio in the plan, because every answer is already collected and stored.

---

**A0 · Pin the values of `promotes`**

*Building it means:* deciding the enum, in code, with the same care as
`BRIEF_WORK_KINDS`. `preScriptBrief.ts` currently says the values "are not
pinned yet" and conditions around that honestly. Proposed:
`own_product` · `affiliate` · `nothing_to_sell`. Three is enough; a fourth
should have to justify itself against a journey in PART 3.5.

*What changes for the creator:* nothing on its own — but A3, the container rule
and journeys 3, 4 and 8 all branch on it, and branching on an unpinned enum is
how two sessions end up with two different spellings of "affiliate".

---

**A1 · The guard, before anything else**

*Building it means:* a CI check that, for every key in `BRIEF_STORED_KEYS`,
greps `supabase/functions/` for a reference and fails if there is none. Model it
on `analysis_components.json` and `CAPABILITY_CONSUMERS_BUILT`, which already do
this for two subsystems and both worked.

*What changes for the creator:* nothing, today. **It fails on `main` right
now** — that is the point. Land it first or the next asked-and-discarded fact
gets added before the guard that would have caught it.

---

**A2 · `workKind` reaches the script**

*Building it means:* interpolate `workKind` **and `workKindOther`** into the
blueprint prompt beside `Audience` and `Goal`. Two lines. Sending only
`workKind` fails journey 9 — the creator types the sentence explaining what they
do and we discard it at the last hop.

*What changes for the creator:* a SaaS founder stops getting the same script as
a hobbyist, and a doctor stops getting the same script as either. This is the
smallest change in the plan with a visible effect, and it touches **seven of the
nine journeys.**

---

**A3 · `promotes` reaches the script and the container**

*Building it means:* send `promotes` to the prompt with an instruction per
value, and branch `containerResolution.ts` on it:

| promotes | the container fills with |
|---|---|
| own product | the confirmed product only — never an inferred one |
| affiliate | researched products, existence and recency verified (needs Track C) |
| nothing to sell | three ideas or three mistakes — **never a forced product** |

Two cautions. `promotes` is asked at `on_confirm`, so a blueprint generated
before confirm legitimately will not have it — handle the absence, never
backfill a default. And emit nothing when unanswered, per PART 2's rule.

*What changes for the creator:* someone with nothing to sell stops being handed
a video that sells something. Forcing a commercial container onto them is how a
tool starts producing videos its user cannot post.

---

**A4 · The captured product reaches the script and the shot list**

*Building it means:* feed the captured evidence into the prompt as **the only
product facts the model may state** — fenced like every other creator-supplied
string, because it came off a web page and is exactly as attacker-influenceable
as a scraped transcript. Then name the product at the `[SHOW: …]` slot with its
captured still.

*What changes for the creator:* "show the product" becomes "hold up *this*, here
is the frame we captured". And the model stops inventing product details, which
is the most expensive failure in the system.

---

**A5 · Give `creativeTransferRows` a consumer, or delete it**

*Building it means:* either render it on the reference/transfer screen, or
remove it. Both are acceptable. Leaving it is not.

*What changes for the creator:* they see why a reference's mechanism was carried
over — or nothing changes and the repo gets smaller. Either is honest.

---

### TRACK B — The remaining questions. Small migrations, real decisions.

---

**B1 · The capability questions, asked during the scan**

*Building it means:* ask all three, three-state, **seeded but not decided** by
the formats observed in the scan. Note the two gates run in opposite directions
and both are correct — check `capabilities.ts` before touching either:
`can_film_objects` is permissive on silence, `can_record_screen` requires an
explicit `true`. Do not "fix" the asymmetry.

*What changes for the creator:* the shot list stops asking for shots they cannot
get, and §7a's production-mode match — built and starved today — starts
receiving input.

---

**B2 · `needs_approval`**

*Building it means:* the question **and** the approval lock, in the same PR.

*What changes for the creator:* nothing, unless the lock ships with it. A flag
that gates nothing is the failure this plan is about. **Do not ship half.**

---

**B3 · The CTA, asked instead of defaulted**

*Building it means:* "What should this video ask people to do?" on the plan
screen, pre-filled from `goal` + `promotes` + the captured product, editable,
sent to the prompt as the CTA beat's target.

*What changes for the creator:* the CTA stops falling back to "Follow for more"
— a line the adapter's own comment calls deliberately plain.

---

### TRACK C — Research. The unbuilt thing that decides whether Twin is worth using.

Do not start this by writing code. Start by answering, on paper:

1. Where does the material come from, and how is it verified as real and recent?
2. What does the creator see — a suggestion they accept, or a filled container?
3. What happens when verification fails? (Per `productEvidence.ts`'s own rule:
   **it asks once**. No silent retry, no silent fallback. A silent retry spends
   the creator's time on our problem; a silent fallback ships a video about
   something we never confirmed.)

*What changes for the creator:* the tech creator with nothing to sell gets a
video with substance instead of a well-shaped empty one. **This is the item
that decides whether Twin produces videos people want to make.**

---

### TRACK D — The render, and the editor

**D1 · A second video source.** `EditPlan.identity` takes a list;
`ffmpegGraph` builds `1:v` into the graph; the Director decides when to cut.
*What changes:* screen recordings stop being captured and discarded — the whole
screen-clip feature becomes real.

**D2 · The overlay window.** A Director decision, not effort.

**D3 · Turn the editor on.** Verify each prerequisite against the deployed
environment, not the file describing it. Then one real recording, from one real
phone, end to end.

---

### TRACK E — Learning

**E1 · Feed the outcome log back into the next script.** The log and the rank
exist and are displayed; nothing reads them when writing the next video.
*What changes:* the second video is informed by how the first one did.

---

## PART 5 — THE RULES FOR EVERY PR IN THIS PLAN

**1. State the chain.** Every PR description carries three lines:

> **Collected at:** … **Stored in:** … **Read by:** …

**If the third line is empty, the PR does not merge.** No exceptions, including
for PRs that are "obviously" going to get a consumer later. That is the exact
sentence that produced every item in TRACK A.

**2. One home per fact.** Everything in `BRIEF_STORED_KEYS` is read via
`readStoredBrief` and written via `sanitizeBriefForWrite`. Never add a second
store for a fact that has one — two writers for one fact resolve to whichever
ran last, and that bug is invisible until it is expensive.

**3. Unanswered emits nothing.** Never a sentence asserting the negative.
Copy `generate-blueprint:751`.

**4. Open the file before building.** Half the items in TRACK A exist because
someone inferred the state of a nearby thing instead of reading the thing in
front of them.

**5. Verify against the deployed thing**, not the file that describes it. This
applies especially to TRACK D3.

**6. Do not add a content-type enum.** The teleprompter routes on the script's
own structure, decided 2026-08-04. Adding an enum is the retired archetype trap.

---

## PART 6 — SUGGESTED SPLIT FOR TWO SESSIONS

**Session 1 — Track A, in order.** A0, A1, then A2, A3, A4, A5. All wiring, one
enum, no migrations, no new UI. Each item is small and each has a visible
effect. Ends with every stored brief key having a reader and the guard proving
it — and eight of the nine journeys in PART 3.5 materially better.

**Session 2 — Track C, on paper first.** Answer Track C's three questions before
writing code. This is the one genuinely open design problem, it owns journey 4
and half of journey 3, and it will be absorbed into the easier wiring work if it
shares a session with Track A.

**Then, whoever is free:** Track B, then D, then E. B2 only if the lock ships
with it.

**Do not split Track A across two sessions.** The whole point is one writer and
one reader per fact; two sessions in `generate-blueprint`'s prompt block at the
same time reproduces the problem this plan exists to fix.
