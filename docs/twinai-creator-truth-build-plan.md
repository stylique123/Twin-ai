# Creator truth — one build plan, end to end

**What this fixes:** we collect facts about a creator and most of them never
reach the script, the teleprompter or the editor. This plan makes one chain out
of them.

> **Reconciled against `main` at `c449b22`.** A parallel session landed the
> *asking* and *storing* half of Layers 1–3 while this was being written
> (`8349dd5`, `8027671`, `3debaab`). This document has been rewritten around
> that, not over it. What it now specifies is almost entirely the **reading**
> half — the side that is still missing, and the side the whole plan exists for.
> Verified in this repo, not assumed:
>
> | fact | asked | stored | read |
> |---|---|---|---|
> | `goal` | ✅ | ✅ `brand_voices.pre_script_brief` | ✅ blueprint brief |
> | `audience` | ✅ | ✅ | ✅ blueprint brief |
> | `offer` | ✅ | ✅ | ✅ blueprint brief |
> | `forbiddenClaims` | ✅ | ✅ | ✅ `generate-blueprint:751`, as a hard block |
> | `workKind` | ✅ | ✅ | ❌ **nothing reads it** |
> | `promotes` | ✅ (`on_confirm`) | ✅ | ❌ **nothing reads it** |
> | `productEvidence` | ✅ | ✅ | ❌ **nothing reads it** |
> | `alsoWantsToMake` | ✅ | ✅ | ❌ **nothing reads it** |
>
> `grep -rn "workKind\|promotes\|productEvidence" supabase/functions/` returns
> one line, and it is the `forbiddenClaims` line. Four questions are now asked
> of every creator whose answers change nothing about the video they get. That
> is a worse state than not asking, and it is the only thing left to fix.

---

## PART 1 — WHAT ALREADY WORKS (do not rebuild)

### The brand's VISUAL identity reaches the render. Verified.

`brandSnapshot.ts` carries `primaryHex`, `secondaryHex`, `highlightHex`,
`logoPath`, `logoSha256`, `colorsSource`, `captionPresetId` — and it is PINNED
into the boot manifest, so a brand edited mid-render cannot retro-alter a
running edit. `captionColours.ts` enforces `MIN_CONTRAST_RATIO_MILLI` against
the chosen colours.

**Colours and logo already flow: onboarding → brand_kit → snapshot → captions.**
This half of "brand DNA in the editor" is done and guarded.

### The voice reaches the script. Verified.

`generate-blueprint/index.ts:670-674` interpolates `Audience`, `Goal`, and
`Product or offer the CTA should point at`. Plus tone, pacing, hook style,
signature words, recurring CTAs, do/don't, enemy, POV — all from the scan.

### The teleprompter routes on the script's own structure.

`scene_type` / `purpose` / `show_in_teleprompter`, decided 2026-08-04. It needs
no new question, and adding a content-type enum would be the retired archetype
trap. **Do not add one.**

---

## PART 2 — WHAT IS COLLECTED AND THROWN AWAY

This is now the whole problem. Every question in this section is **already
asked and already stored.** None of them needs a migration, a new screen, or a
decision. Each needs a reader.

### 2a. `workKind` — asked, then dropped

`BRIEF_QUESTIONS` asks *"What do you do?"* at `during_scan` and
`sanitizeBriefForWrite` persists it. Its only live job is deciding whether the
claims and product-evidence questions show — `asksForbiddenClaims`,
`asksProductEvidence`. **The script generator never learns whether it is writing
for a doctor, a SaaS founder or a hobbyist.**

Fix: interpolate it into the blueprint brief beside `Audience` and `Goal`. Two
lines, and the cheapest real improvement available in the repo.

### 2b. `promotes` — asked at `on_confirm`, read by nothing

**Own product · someone else's (affiliate) · nothing to sell.** The distinction
`workKind` cannot make: an affiliate and someone with nothing to sell both pick
"creator", and they need opposite scripts. §2.3 says so:

| promotes | container fills with |
|---|---|
| own product | confirmed catalogue only, never inferred |
| affiliate | researched products, existence + recency verified |
| nothing to sell | three ideas or three mistakes — **never a forced product** |

*"Forcing a commercial container onto someone with nothing to sell is how a tool
starts producing videos its user cannot post."*

Two readers are missing, not one: the **brief** (an affiliate cannot vouch for
someone else's product the way they can for their own) and the **container
rule** (`containerResolution.ts`, which today treats every `[SHOW: …]` slot the
same regardless of whether anything exists to show).

### 2c. `productEvidence` — captured, then unused

`productEvidence.ts` already encodes the hard part: a product answer is captured
pixels and a section map, **not a sentence** — the pixels are real, the section
order is the page's own, and failure asks once rather than retrying silently.
That module is the reason "show the product" can ever be truthful.

Nothing downstream reads it. The blueprint still gets one free-text `offer`
string, so a script that says *"show the product"* still has nothing to point
at, and the model inventing product details remains §2.3's most expensive
failure — a confidently wrong recommendation costs the creator their
credibility.

**This is the layer where a stored fact and its consumer are furthest apart,
and therefore the highest-value work in the plan.**

---

## PART 3 — WHAT IS STILL NEVER COLLECTED

### 3a. The CTA is derived, never asked

`recurring_ctas` is SCRAPED from past posts. What they want *this* video to ask
for is never asked. The blueprint prompt is told to prefer a save or a
comment-bait question over "follow for more" — a generic default standing in for
a real one.

---

## PART 4 — THE BUILD, IN ORDER

Each layer names its consumer. **Nothing ships without one.**

### LAYER 1 — Make the answers we already have count
*No new questions. No migration. No new screen. Highest ratio in the plan.*

1. **Send `workKind` to the blueprint brief**, beside `Audience` and `Goal` at
   `generate-blueprint/index.ts:670`. Send `workKindOther` when the answer is
   `other`, or the free text a creator typed is discarded at the last step.
2. ~~Persist to the profile~~ — **done.** `sanitizeBriefForWrite` /
   `readStoredBrief` land it in `brand_voices.pre_script_brief`. Read from
   there; do not add a second home for the same fact.
3. ~~Send `forbiddenClaims` as a hard constraint~~ — **done**, and done well.
   `generate-blueprint:751` emits a COMPLIANCE block, placed last before the
   task, and **emits nothing when unanswered** rather than saying "restrictions:
   none". That is the three-state rule surviving into a prompt. Copy its shape
   for everything below: an unanswered question must produce no text, never a
   sentence asserting the negative.

*Consumer: `generate-blueprint`. Effect: scripts stop treating a regulated
professional and a hobbyist identically.*

### LAYER 2 — Read `promotes`, and branch on it

4. ~~Add `promotes` to `BRIEF_QUESTIONS`~~ — **done**, at `on_confirm`.
5. **Send it to the brief**, with an instruction per value, and **nothing at all
   when unanswered** — per Layer 1's rule. Note the stage: `promotes` is
   answered on confirm, so a blueprint generated before confirm legitimately
   will not have it. Handle absence; do not backfill a default.
6. **Route §2.3's container rule on it** — the table in 2b. `nothing to sell`
   must be able to produce a script with no product beat at all.

*Consumer: `generate-blueprint` + `containerResolution.ts`. Unblocks Phase 12
item 12.*

### LAYER 3 — Make the captured product reach the script
*What makes "show the product" real. Now mostly a wiring job, not a build.*

7. ~~A place to put the product~~ — **done.** `productEvidence.ts` defines what
   an answer is; the brief stores it. **Do not add a `brand_products` table
   until something is proven to need one** — a second store for a fact that
   already has one is exactly this document's failure mode.
8. ~~Ask for it~~ — **done**, gated by `asksProductEvidence(workKind)` with
   `PRODUCT_EVIDENCE_FORM` choosing which form leads.
9. **Feed the captured evidence into the brief** as the ONLY product facts the
   model may state — fenced like every other creator-supplied string, since it
   came off a web page. Everything not in it stays a container the creator
   fills, never a detail the model supplies.
10. **Name it at the `[SHOW: …]` slot** — the plan screen names the product to
    hold up, with its captured still, rather than a generic "show the product".

*Consumer: the brief, the container rule, the shot list. **This is what stops
the model inventing product details.***

### LAYER 4 — The capability questions

11. **Ask all three during the scan**, three-state, seeded-not-decided from the
    scan's observed formats.
12. `can_film_objects` → §7a production-mode match (**built, starved today**)
13. `can_record_screen` → §7a + the capture UI
14. `needs_approval` → **only if the approval lock ships in the same PR**

### LAYER 5 — The CTA, asked rather than defaulted

15. **"What should this video ask people to do?"** on the plan screen,
    pre-filled from `goal` + `promotes` + the captured product, editable.
16. Send it to the brief as the CTA beat's target.

*Consumer: the script's CTA beat, which currently falls back to "Follow for
more" — a line the adapter's own comment calls weak and deliberately plain.*

---

## PART 5 — THE COHERENCE RULE

The failure this plan exists to end: **a fact with no reader.**

Every PR in this plan must state, in its description:

> **Collected at:** … **Stored in:** … **Read by:** …

If the third line is empty, the PR does not merge. `analysis_components.json`
and `CAPABILITY_CONSUMERS_BUILT` already do this for two subsystems and both
worked — the second failed CI the moment a consumer landed, exactly as designed.

**Extend that registry to cover:** every key in `BRIEF_STORED_KEYS` —
`workKind`, `workKindOther`, `promotes`, `productEvidence`, `alsoWantsToMake` —
plus the capability flags and the CTA. One CI-checked file naming every creator
fact and who reads it.

The check that matters is the cheap one, and it would fail today:

> for each stored brief key, `grep -rn "<key>" supabase/functions/` must match.

That single assertion is the difference between the state this document
describes and the state it wants. Land it with Layer 1, not after Layer 5 —
otherwise the next fact to be asked and discarded gets added before the guard
that would have caught it.

**Also worth stating plainly:** the parallel session's work is why Layers 1–3
are now mostly wiring. The remaining risk is not duplicated effort, it is
*duplicated storage* — two writers for one fact, resolved by whichever ran
last. Every item above therefore reads from `brand_voices.pre_script_brief` via
`readStoredBrief` and writes via `sanitizeBriefForWrite`. **No second home for
any fact already in `BRIEF_STORED_KEYS`.**

---

## PART 6 — WHAT STAYS BLOCKED

- **Second video source in the editor** — clips are captured and dropped at
  render until `EditPlan` + `ffmpegGraph` take two inputs
- **The overlay window** — a Director decision, not effort
- **Research verification** — LAYER 3 gives affiliates a catalogue; verifying
  someone else's product still needs the research layer (Phase 12 item 14)
- **The editor itself** — one env var, three prerequisites needing one phone
