# Creator truth — one build plan, end to end

**What this fixes:** we collect facts about a creator and most of them never
reach the script, the teleprompter or the editor. This plan makes one chain out
of them.

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

### `workKind` — asked, then dropped

Verified: `workKind` appears in `onboardingDraft.ts`, `Onboarding.tsx`, and
tests. **It appears nowhere in `supabase/functions/`.**

Its only job is deciding whether the claims question shows — a conditional in
the same component. The script generator never learns whether it is writing for
a doctor, a SaaS founder or a hobbyist.

**Fix: two lines in the blueprint brief.** This is the cheapest real improvement
available, because the question is already answered and stored.

---

## PART 3 — WHAT IS NEVER COLLECTED

### 3a. `promotes` — the missing distinction

**Own product · someone else's (affiliate) · nothing to sell.**

An affiliate picks "creator" today. So does someone with nothing to sell. They
need opposite scripts, and §2.3 says so:

| promotes | container fills with |
|---|---|
| own product | confirmed catalogue only, never inferred |
| affiliate | researched products, existence + recency verified |
| nothing to sell | three ideas or three mistakes — **never a forced product** |

*"Forcing a commercial container onto someone with nothing to sell is how a tool
starts producing videos its user cannot post."*

### 3b. The product itself — links, images, facts

Nothing stores what a creator actually sells beyond one free-text `offer`
string. There is no catalogue, no product image, no price, no claim.

**Consequence:** a script that says *"show the product"* has nothing to point
at, and the model inventing product details is §2.3's most expensive failure —
a confidently wrong recommendation costs the creator their credibility.

### 3c. The CTA is derived, never asked

`recurring_ctas` is SCRAPED from past posts. What they want *this* video to ask
for is never asked. The blueprint prompt is told to prefer a save or a
comment-bait question over "follow for more" — a generic default standing in for
a real one.

---

## PART 4 — THE BUILD, IN ORDER

Each layer names its consumer. **Nothing ships without one.**

### LAYER 1 — Make the answers we already have count
*No new questions. No migration. Highest ratio in the plan.*

1. **Send `workKind` to the blueprint brief.** Already collected.
2. **Persist `workKind` and `forbiddenClaims` to `brand_voices.profile`** —
   confirm the draft actually reaches the profile, not just localStorage.
3. **Send `forbiddenClaims` to the brief as a hard constraint**, not advice. A
   doctor's "never the word cure" must bind the model, not suggest to it.

*Consumer: `generate-blueprint`. Effect: scripts stop treating a regulated
professional and a hobbyist identically.*

### LAYER 2 — Ask `promotes`, and branch on it

4. **Add `promotes` to `BRIEF_QUESTIONS`** at `during_scan`. 0109's CHECK
   already permits it — verify before writing a migration.
5. **Send it to the brief**, with an instruction per value: an affiliate cannot
   vouch for someone else's product the way they can for their own.
6. **Route §2.3's container rule on it** — the table in 3a.

*Consumer: `generate-blueprint` + the container rule. Unblocks Phase 12 item 12.*

### LAYER 3 — The product catalogue
*The biggest new thing, and what makes "show the product" real.*

7. **A `brand_products` table**: name, one-line description, link, image path,
   optional price, `source` ('creator_entered' | 'confirmed'). Owner-scoped RLS.
8. **Ask for it on confirm, for `promotes = own product` only.** One product is
   enough to start. Image upload optional.
9. **Feed the catalogue into the brief** as the ONLY product facts the model may
   state. Everything else stays a container the creator fills.
10. **Show it at the `[SHOW: …]` slot** — the plan screen names the product to
    hold up, with its image, rather than a generic "show the product".

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
    pre-filled from `goal` + `promotes` + the catalogue, editable.
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

**Extend that registry to cover:** `workKind`, `promotes`, the catalogue, the
capability flags, and the CTA. One CI-checked file naming every creator fact and
who reads it.

---

## PART 6 — WHAT STAYS BLOCKED

- **Second video source in the editor** — clips are captured and dropped at
  render until `EditPlan` + `ffmpegGraph` take two inputs
- **The overlay window** — a Director decision, not effort
- **Research verification** — LAYER 3 gives affiliates a catalogue; verifying
  someone else's product still needs the research layer (Phase 12 item 14)
- **The editor itself** — one env var, three prerequisites needing one phone
