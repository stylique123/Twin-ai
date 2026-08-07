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

**Working.** CORRECTED 2026-08-06: an earlier revision of this document said
`ffmpegGraph.ts` referenced only `0:v`/`0:a` and that a second source could not
composite. **That was wrong, and it was wrong the way this document warns
about** — a grep of the top of the file, where the per-segment chain does read
`0:v`, and no one opened the rest. Line 813 onward declares a real `-i` per
composed clip and resolves the input mapping once, precisely so that "the second
clip" and "input 2" cannot drift. `editorCompile.ts`'s `placeClips` chooses the
placement, and a clip-count mismatch is REFUSED rather than truncated — the
comment says why: truncating "would render the take where the creator asked for
their screen and report success."

What remains open here is placement *policy* — which moment cuts to the clip is
a rule today rather than an explicit Director selection — and proof in a real
production render.

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
| Screen clip capture + storage | `clip-asset`, `ScreenClipRecorder.tsx` | working |
| Screen clips composited into the render | `ffmpegGraph.ts:813+`, `placeClips` | working — multi-input, count mismatch refused |
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

### 3a. ~~The second video source~~ — BUILT. Placement policy is what is open.
**Corrected.** Multi-input composition exists and is guarded. What is genuinely
open is narrower and worth stating accurately: the Director does not yet
*select* the moment to cut to a clip — placement is policy in the compiler — and
no production render has proven it on real footage. That is a smaller and
better-defined problem than "the renderer cannot take a second input", which is
what this section used to claim.

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

**C-a · The gallery is already two thirds of the evidence base.**

The gallery is a contributed feed of references — `gallery_items`, ~6,600 rows
in production. `galleryRank.ts` already computes the "why it's here" column:
seven signals, each `match` / `mismatch` / **`not_checked`**, reported as
"3 of 7 signals" rather than "43% match", because arithmetic about what was
examined is honest and a percentage is a claim. Apify already runs for the DNA
scan, so refreshing a gallery row reuses an existing path rather than adding a
dependency.

What blocks it is that the facts underneath the ranking are prose:

```sql
reach text,
likes text,
```

"2.3M", "2300000", "over 2 million" are all valid today. **Numbers that arrived
as prose cannot be compared**, so "your teardown format outperformed by 1.4×" is
unstatable. There is also no record of WHEN a row was checked, which makes
"live in your niche this week" unprovable — and an unprovable recency claim is
the confidently-wrong recommendation this plan exists to prevent.

Four steps, the first three small:

1. **Numeric metrics with provenance** — `views_count`, `likes_count`,
   `metrics_fetched_at`, `metrics_source`. Never coerce prose into a number;
   leave it NULL. Six thousand rows of prose is exactly where null-is-not-zero
   earns its keep.
2. **Existence and freshness** — confirm the URL still resolves and carries a
   date. A row that fails becomes `unavailable`, neither deleted nor silently
   kept.
3. **`source`: `contributed` vs `scraped`**, shown on the card. A human
   recommendation and a scrape are different claims and must not rank as one.
4. **The falsifiable prediction** — what result would confirm or reject this
   idea, graded later by the outcome log. **This is the step that makes it a
   recommendation rather than a ranked list**, and it is the real design work.

**Cost is what decides feature-or-bill.** ~6,600 rows refreshed daily is ~6,600
Apify calls daily. Refresh what is SHOWN — on read, when a row is about to
surface and its `metrics_fetched_at` is stale — plus a small daily budget for
the top slice. A row no creator's niche matches is never refreshed and costs
nothing.

**Ranking cannot be precomputed.** The gallery is global; a recommendation is
per-creator. `rankSignals` already takes this creator's capabilities and niche,
so it is a read-time computation per viewer. That is already how it is written.

**C-b · A description beside the product evidence, never instead of it.**

`productEvidence.ts` accepts a link or images and deliberately refuses a
sentence, because a description of a product IS the guess the container rule
exists to refuse. That is right for the primary answer and wrong as a total
ban: "this is for solo founders, not teams" is context no product page carries.

Add it as an ANNOTATION, tagged as the creator's claim, ranked below captured
evidence, and never promoted into a fact the model may state as product truth.

### TRACK D — The render, and the editor

**D1 · Director-selected clip placement.** The inputs and the composition are
built; what is missing is the Director explicitly choosing the moment rather
than the compiler applying a rule.
*What changes:* the clip lands where it earns attention instead of where a
default put it.

**D2 · Picture-in-picture, and whether it should exist.** `COMPOSITION_FITS`
has exactly one value, `full_frame`, and the renderer refuses anything else
rather than approximating it. That is right as a first implementation: joining
windows requires exact agreement on raster, frame rate, pixel format and aspect,
and `full_frame` conforms both branches identically, while `full_frame` has no
layering so there is no z-order to get wrong.

But for a SaaS founder, losing their face for fifteen seconds costs the human
presence that makes the video work. **PiP is plausibly the better treatment
there**, and the honest framing is not "split screen was rejected" — it is that
one fit is implemented. Adding one needs the Director to decide when it applies,
and needs a real recording to judge against.

**D2b · A clip longer than its line is silently truncated.** `placeClips` sets
`sourceEndMs` to `min(clip.durationMs, window length)` and emits nothing. Every
other outcome in that function warns — `is_the_take`, `duplicate`, `no_window`,
`window_too_short`, `overlaps_earlier_clip`, `limit_reached` — six named
refusals, and the one case that silently changes what the viewer sees is quiet.
A 20-second walkthrough under a 12-second line loses its last 8 seconds, so
"and then you hit Save" can play over a screen that never reaches Save. **The
picture and the voice disagree and nothing says so.** Fix: warn on truncation
and surface it, so the creator can re-record or lengthen the line.

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

---

## PART 7 — THE CONNECTED-VALUE AUDIT, FOLDED IN

An independent audit dated 2026-08-06 scored the product by **connected value**
rather than code volume, and its findings are absorbed here rather than kept as
a separate document. Its central number:

> **The minimum subsystem score is 3.5, and it is recommendations — not the
> editor.** Editor engineering scores 7.8; editor *production readiness* scores
> 4.0. That gap does not close by adding editor features.

| area | score | why not 8 |
|---|---:|---|
| DNA extraction | 7.4 | thin-source inference too aggressive |
| DNA truth and authority | 5.2 | confirmed / inferred / profile / voice / snapshot are overlapping authorities |
| Scripting usefulness | 6.7 | no per-video intent, no product evidence, no deterministic claim checks |
| **Recommendations** | **3.5** | first model output + hard-coded defaults + curated gallery ≠ a decision engine |
| Editor engineering | 7.8 | strong contracts, pinned inputs, real multi-source composition |
| Editor production readiness | 4.0 | feature-gated, never completed a production run |
| End-to-end connected loop | 5.5 | intent → recommendation → script → outcome learning still open |

**The product feeling this explains:** a great deal is built, and the creator
still supplies the decisive idea. Twin elaborates it. The promise requires Twin
to *recommend* the next decision, explain why, write it from verified truth
only, and learn from the result.

### The readiness ladder

Each step is an end-to-end journey closed, never a feature added.

| milestone | readiness |
|---|---:|
| current production | 5.4 |
| #287 merged and corrected | 6.1 |
| one canonical output everywhere | 6.8–7.0 |
| approval and publishing bound to that output | 7.5–7.7 |
| truth, reference and capture gates complete | 7.9–8.1 |
| live security, operational and real-user proof | 8.2+ |

### The minimum definition of 8/10

One real creator completes all of this without database intervention: sign up
once · complete DNA once · add an idea · receive an honestly sourced script ·
edit and save it · record without losing the take · produce a real FFmpeg video
and cover · see **that same output** in Result, Dashboard, History and Calendar ·
send **that exact output** for approval · schedule the approved output · pass
**the same immutable file** to the publisher · record the outcome against the
same lineage · return later with no duplicated onboarding, stale state or
contradictory status.

Read it twice: *the same output* appears four times. **That repetition is the
whole remaining product.**

### New items this audit added to the build

Folded into the tracks above, listed here so none is lost:

- **Brand selection is global, not per generation.** `generate-blueprint` always
  loads `brand_voices.is_default = true` and the create screen has no selector.
  An agency running two clients must flip a global default — so two concurrent
  generations can cross-use the wrong client's voice, offer, palette, logo and
  constraints. **Not a quality bug; a client-mix incident.** Highest priority in
  Track A.
- **DNA carries inferred business truth with no provenance.** The prompt asks
  the model to prefer a confident inference over a blank, and the result is
  stored flat beside observed signals. Every field needs `value` / `source` /
  `confidence` / `confirmedAt` / `evidenceRefs` / `authority`, split four ways:
  observed style · inferred hypothesis · creator-confirmed business truth ·
  unknown. **Never promote an inference into "the creator sells/promises".**
- **`blueprintComplete` validates only concept and packaging.** When both model
  attempts come back short the code ships the best parseable fragment, and the
  UI normalizes it into looking whole. Same class as "unavailable shown as
  empty": a missing thing rendering as a real one.
- **Onboarding's writes are not atomic** — voice profile, capabilities, brief and
  profile DNA are separate writes, so a mid-sequence failure leaves partial
  state. One idempotent transactional commit.
- **Tone and fidelity can contradict known truth.** The create page defaults tone
  to "balanced" and calls it *your default* without deriving it from the selected
  brand; `close` fidelity promises tight reference structure even when reference
  analysis fell back to a generic pattern. Prefill tone from the brand; disable
  or rename `close` when reference mode is `pattern`.
- **`alsoWantsToMake` is never asked**, and the onboarding free-text goal is
  never written to the actionable goal enum.
- **`CampaignIntentV1` is a contract nothing writes.** Static DNA cannot carry
  per-video intent: a founder wants awareness today and demo signups tomorrow.
  Slow-moving brand DNA **plus** a small per-video brief.
- **`RecommendationSetV1`** — 3–5 ranked candidates, each naming its evidence
  source, brand fit, capability fit, repetition risk, claim risk, why it ranks
  there, and **what result would confirm or reject it**.
- **Consent and deletion.** `purge_media` works and is trigger-driven, so every
  deletion route is covered — and no user-facing flow reaches it. Legal weight,
  currently inert.
- **Editor economics.** No unit cost across transcription, analysis, director,
  storage, render, egress; no budget refusal before spend.

### Persona scores — the same nine journeys, measured

| persona | now | what holds it back |
|---|---:|---|
| Creator, nothing to sell | 6.3 | no research, novelty planning or feedback learning |
| Ecommerce seller | 5.7 | no product evidence, launch context, verified benefit layer |
| SaaS founder | 5.8 | no per-video funnel goal, no product-page evidence |
| Local service | 4.8 | no location, service area, booking CTA or proof inventory |
| Professional / regulated | 5.4 | no deterministic compliance or evidence validation |
| Brand / in-house | 6.0 | no campaign brief, multi-brand selection or asset catalogue |
| Agency / multi-client | 5.1 | **global default voice is an unacceptable client-mix risk** |
| Affiliate | 5.0 | no product evidence, disclosure policy or verified basis |

---

## PART 8 — WHO OWNS WHAT, WITH TWO SESSIONS RUNNING

The boundary that holds: **one session owns everything from the creator's
answers to the finished script. The other owns everything from the finished
script to the published post.** They meet at the shot list.

### The script-inputs session

Gate 1 · `brand_voice_id` per generation, server-authorized and pinned ·
BrandTruthSnapshot **producer and consumer in the same hands** · atomic
onboarding commit · readers off `profiles.dna`

Gate 2 · the question-consumer CI guard · `workKind` + `workKindOther` into the
prompt · the `workKindOther` text box the contract requires and the UI never
provides · `productEvidence` into prompt and shot list · capability flags into
generation · `alsoWantsToMake` · the goal enum · `CampaignIntentV1`

Gate 3 · `RecommendationSetV1`, task-routed models, exploration/exploitation,
repetition detection

Gate 4 · persist CreativeTransferPlan and ScriptPlan · semantic completeness ·
**the forbidden-claim validator** · tone from the brand · `close` honest about
`pattern`

### The output-identity session

The supabase-js pin, alone, after merge · **teach the staging matrix about 0110
and 0111 first** — the gate protecting the next three items is blind to them,
so everything after it would merge on a green light that never looked · bind the
output at schedule time so a later re-edit refuses rather than substitutes ·
History's media batch · resolver failures as *unknown*, never *draft* ·
APPROVAL-1 · PUBLISH-1 · Gate 5's production proof · consent and deletion ·
editor economics · dependency triage · the accessibility pass

### The two that split

**LEARNING-1** — the lineage belongs to whoever built it; the producer that
proposes a DNA change from outcomes belongs to whoever owns brand truth. **A
human approves before it takes effect.** An automatic loop that edits a
creator's brand voice without asking is how a product silently becomes wrong
about someone.

**Gate 6** — one session imports measurement and attributes through UTMs, codes
and CRM evidence; the other consumes outcomes into ranking. Bounded: a proven
pattern changes future ranking at adequate sample size, a single viral result
does not, core brand truth never mutates automatically, and every learned
preference stays inspectable and undoable.

### Decisions that belong to neither session

- **What a forbidden-claim validator rejects.** Recommendation: exact-match and
  stem fence first, across hooks, spoken lines, captions and CTA — provable and
  demonstrable. Semantic checking is a separate track and must not be claimed
  until it is verified.
- **What a render may cost before it is refused.** Recommendation: instrument
  first, gate second. A threshold invented before there is a cost distribution
  is a number nobody can defend.
- **Whether Templates is a product or dead schema.** Neither session should
  decide whether a feature exists.

---

## PART 9 — THE INSTRUCTION THAT OUTRANKS THE REST

> **Do not begin another broad feature phase before the connections close.**

Editor engineering is at 7.8 and its production readiness is at 4.0. Nothing in
that gap is a missing feature. It is one real recording, and the chain that
carries its output — unchanged, and provably the same file — through approval,
scheduling, publishing and back into what gets recommended next.

---

## PART 10 — THE SCRIPT NEEDS A DIRECTOR TOO

Everything in this part comes from reading the pipeline, not from theory. Three
findings decide the design.

### 10.1 — WHY THE FACTS FEEL SEPARATE: THEY ARE SEPARATE

`generate-blueprint` composes the creator's facts as **independent lines in one
prompt**:

```
- Audience: …
- Product or offer the CTA should point at: …   (+ whose it is)
- What they do: …                                (new)
- Goal: …
- Tone and voice: …
```

Each fact is true and each is stated alone. **Nothing composes them into a
position.** "A SaaS founder, talking to solo developers, who wants demo signups,
whose product is a debugging tool" is a specific video; five separate lines are
five constraints a model satisfies one at a time. That is exactly why the output
reads generically even when every input is right.

**And there is only ONE model call.** It produces concept, packaging, hooks,
script, shot list, captions, publish plan and sprint in a single shot. There is
no stage that *decides what this video is* before something writes it.

### 10.2 — SCENE LENGTH IS AN ACCIDENT, AND HERE IS THE EXACT MECHANISM

`recordingScriptAdapter` creates **one scene per `script[]` entry**, and each
scene's length is `estimateDurationSec(line, wpm)` — words divided by speaking
rate. So:

- The model decides how much text goes in an entry.
- The adapter turns every entry into exactly one take.
- Duration is derived from word count afterwards.

**Nothing reasons about how long a beat should be.** A six-word line and a
forty-word line each become one scene and one take, which is precisely the
"sometimes one line, sometimes twice as long" the creator feels. It is not the
model misbehaving; **no rule exists for it to follow.**

### 10.3 — THERE IS NO VISUAL HOOK, ANYWHERE

The schema has `hook_options` (spoken lines) and a thumbnail concept. It has no
pattern interrupt, no opening visual, no "what changes on screen in the first
second". `SceneType` is `talking_head | b_roll | screen_recording |
product_demo | cta` — five ways to be a shot, none of them a disruption.

**A hook that is only words competes with every other talking head.**

### 10.4 — THE EDITOR IS STRONG; THE DIRECTOR IS NARROW

Worth stating plainly because it decides where effort goes. The editor has real
depth: word-level speech, candidate cuts, boundaries, pinned brand snapshot,
caption contrast, safe areas, multi-input composition, validation, cancellation,
an idempotent ledger.

**The Director's job is small by comparison: `selections: number[]`.** It picks
which candidate cuts to take, plus pacing, music and a summary. It is a
*chooser over a list somebody else built*. It never asks whether the video's
shape is right, whether a beat earns its length, or whether the opening does
anything visually.

**So the instinct is correct: the editor does not need more machinery. The
thing giving it instructions needs to think.** And the same is true one stage
earlier — nothing plans the script either.

---

## PART 11 — WHAT TO BUILD

### 11.1 · The Composer — one position, not five constraints
*Before any writing happens.*

A cheap first pass whose only output is the **video's position**, composed from
all the facts together:

> *For a SaaS founder selling a debugging tool to solo developers who wants demo
> signups: the video is a live failure they will recognise, fixed on screen in
> under a minute. Proof is the screen. The CTA is a trial, not a follow.*

Then the writer is given the position, not the five lines. **Same facts, one
subject.** This is the smallest change that makes the facts work side by side,
and it needs no new question.

*Consumer: the script writer. Effect: the output stops being an average of
constraints.*

### 11.2 · The Script Director — decide the shape before writing the words

A planning stage that outputs a **beat plan** and nothing else:

| field | what it decides |
|---|---|
| `beats[]` | how many, and what each is FOR |
| `targetSec` per beat | **the length decision, made deliberately** |
| `sceneType` per beat | talking head, screen, product, b-roll |
| `visualHook` | what changes on screen in the first second |
| `rehookAt` | where attention is reset |
| `proof` per beat | what makes it believable — screen, object, number, story |

Then the writer writes **to that plan**, and `duration_sec` becomes a target the
words are written to fit rather than a number derived after the fact.

**This directly fixes 10.2.** A beat plan that says *"beat 3: 8 seconds, screen
recording, show the error"* cannot produce a forty-word talking-head line.

*Rule: the beat count is DECIDED, never defaulted. A 20-second product demo and
a 90-second teardown do not both get seven beats.*

### 11.3 · The visual hook, as a first-class field

Add to the beat plan and carry it to the shoot plan:

- **what the viewer sees in the first second** — motion, a prop entering, a
  screen mid-error, a cut mid-gesture
- **why it interrupts** — one line, so the creator can judge it

Do NOT add a "pattern interrupt type" enum. That is the retired archetype trap
in new clothing.

### 11.4 · The shoot plan a beginner can actually follow

`background` and `action_posing` **already exist** in the script schema and
already reach `setup` in the adapter. What is missing is not data — it is that
the guidance is generic and never says *why*.

Per beat, in plain words:

- **Where to stand** — "kitchen counter, window on your left" beats "clean,
  well-lit background"
- **What must NOT be in frame** — the single most useful instruction nobody gives
- **Phone position** — height, distance, portrait, propped on what
- **How to say it** — the one word to lean on, where to pause
- **What to hold or show**, and when

*Every line should be executable by someone who has never filmed anything, with
no equipment beyond a phone and whatever is already in the room.*

### 11.5 · Learning, bounded — better scripts over time

The lineage exists for the first time: output → post → outcome. The rule that
keeps it honest:

- A pattern changes future planning **only** at adequate sample size.
- A single viral post changes **nothing**.
- Core brand truth **never** mutates automatically.
- Every learned preference is **inspectable and undoable**.

*What learns:* which beat shapes held attention for THIS creator, which hooks
earned saves, which proof types converted. *What does not:* who they are, what
they sell, what they may not claim.

---

## PART 12 — TESTING IT WITH REAL BEGINNERS

**A model cannot judge whether a shoot plan is followable by a beginner.** It
knows what good instructions look like, which is exactly the wrong instrument —
the failure mode is instructions that *read* clear and stall someone holding a
phone.

**So this is not a task an agent can complete, and pretending otherwise would be
the most expensive false claim in this document.** What can be built is the
comparison, for a human to run:

1. **Two variants of the same video's plan**, from the same facts — the current
   output, and the beat-planned one. Same creator, same reference, side by side.
2. **A script for the session**, five questions, no leading language:
   - Which one would you pick up and film right now?
   - Point to the first line you do not understand.
   - Where would you stand? *(the plan should have answered this)*
   - What would you do first?
   - What is missing that you would have to guess?
3. **Record what they DID, not what they said.** "It's clear" and then not
   filming is the answer, and it is the opposite of the words.

**Two beginners is the right number to start.** The first tells you what is
broken; the second tells you whether it was them or the plan.

---

## PART 13 — HOW THE BEAT PLAN CONNECTS TO EVERY COMPONENT

A new planning layer that does not name its consumers is the failure this whole
document exists to end. So: **every component of Twin, and what it does with the
beat plan.** If a row cannot be filled, that part of the plan does not get
built.

### The producer

`generate-blueprint` gains two cheap calls before the writing call:

```
brief + DNA  →  Composer   →  position (one paragraph)
position     →  Director   →  beatPlan (the shape)
beatPlan     →  Writer     →  blueprint (the words)
```

**Stored on the generation, pinned like the brand snapshot**, so a re-read months
later shows the plan the video was actually written to — not a plan regenerated
from facts that have since changed.

### The consumers, one per component

| component | what it reads | what changes |
|---|---|---|
| **`recordingScriptAdapter`** | `beats[].targetSec`, `sceneType` | **The fix for scene length.** `duration_sec` becomes the beat's target instead of words ÷ wpm. One scene per BEAT, not per `script[]` entry — so the model can no longer decide take length by how much it typed. |
| **Teleprompter** | `beats[].targetSec`, `purpose` | Shows the beat's intent and its intended length, so a creator knows a beat is meant to be 6 seconds before they ramble for 30. `show_in_teleprompter` still routes on scene structure — **no content-type enum.** |
| **Scene cards / shoot plan** | `visualHook`, `background`, `action_posing`, `proof` | Where to stand, what must not be in frame, phone position, what to hold. `background` and `action_posing` already exist and already reach `setup` — they get *specific* rather than new. |
| **`containerResolution`** | `beats[].proof` when it is `screen` or `object` | A beat whose proof is a screen IS a declared slot. Today the slot comes from a `[SHOW: …]` marker in prose; from the beat plan it is structural, so a promised proof cannot go missing silently. |
| **`ScriptEditor`** | the beat plan alongside the words | Editing a line shows which beat it belongs to and what that beat is for. `applyDialogueEdit` already re-estimates `duration_sec`; with a target it can say **"this is now 14s against a 6s beat."** |
| **Capability flags** | `beats[].sceneType` | A beat planned as `screen_recording` for someone whose `can_record_screen` is not explicitly true must be re-planned, not silently dropped. |
| **Editor Director** | `beats[].purpose` and `targetSec` | The Director currently picks cuts from candidates with no idea what the video is doing. Given the beat plan it can cut *toward* an intended shape — the narrowness identified in 10.4, fixed by giving it intent rather than more machinery. |
| **`craftFacts` / CraftChecks** | `beats[].targetSec` vs measured | A new checkable fact: **did the finished video match its plan?** Craft checks already refuse to report what they cannot measure, so a beat with no measurement stays `not_checked`. |
| **`galleryRank`** | `beats[]` shape | An eighth signal becomes possible: does this reference's shape match what this creator can execute? Only if measurable — `not_checked` otherwise, per the existing rule. |
| **`outcomeLog`** | beat plan ↔ outcome | **This is what makes learning real.** Which beat shapes held attention for THIS creator. Bounded: adequate sample size, one viral post changes nothing, brand truth never mutates. |
| **`brandSnapshot`** | — | Unchanged, and deliberately. Brand visual identity is pinned separately and stays that way; the beat plan is about shape, not colour. |
| **Review / approval / publish** | — | Untouched. That chain is the other session's and the beat plan must not reach into it. |

### The rules this obeys

**Unanswered emits nothing.** A beat plan the Composer could not produce means
the writer gets today's prompt, not an invented plan. Degrading to the current
behaviour is correct; inventing a shape is not.

**Pinned, never re-derived.** Every consumer reads the stored plan. No stage
re-plans from live DNA — that is the "no downstream stage rereads live mutable
DNA" rule from the audit.

**One writer.** `generate-blueprint` produces it. Nothing else writes a beat
plan, ever.

**It must pass the consumer guard.** If the beat plan is stored and no component
reads it, CI fails — the same check that caught `goal` being read from three
authorities and none of them the creator's answer.

### Build order, so nothing is stranded

1. **Composer only.** Position into the existing prompt. No new storage, no new
   consumers, immediately better output. *Reversible in one line.*
2. **Beat plan produced and stored, read by ONE consumer** —
   `recordingScriptAdapter`, because scene length is the loudest defect.
3. **Then teleprompter and scene cards** — the creator-facing half.
4. **Then the editor Director** — it needs a plan to exist before it can cut
   toward one.
5. **Then craft checks and outcomes** — measurement last, because it measures
   the four above.

**Each step ships with its consumer.** Step 2 does not merge as "the plan is
stored, readers coming."
