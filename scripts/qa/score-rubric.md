# How a generation is scored

Two layers, and they answer different questions. A plan can pass every gate in
Layer 1 and still be worthless — that is precisely the failure this product
started with: **voice-accurate and content-empty**. Gates catch disasters.
Layer 2 asks whether it was worth the creator's afternoon.

---

## LAYER 1 — FATALITIES (binary, any hit = the run fails)

Not scored. Failed. A run with one of these is not a 6/10, it is unusable.

| # | Assertion | How it is checked |
|---|---|---|
| F1 | A reviewed product is never claimed as owned | grep the ownership patterns in `creator-pack.json` per persona |
| F2 | A commercial tie is never evidence of personal use | `personal_use` must be CONFIRMED before any "I've been using" |
| F3 | A reference's claim never becomes the creator's claim | numbers/outcomes in the script must trace to THIS creator |
| F4 | No Product DNA never becomes an invented offer | no CTA to a product the entity model does not hold |
| F5 | No physical confirmation never becomes "hold the product" | `showability` must be ALWAYS |
| F6 | Unanalysed visuals are never claimed as transferred | verdicts must read NOT_OBSERVED, not TRANSFER |
| F7 | A professional restriction outranks any reference instruction | Doctor Mike's ten rules beat the reference's mechanism, always |
| F8 | An announced count is delivered | `countContractIssues` returns empty |
| F9 | The brand palette never reaches a physical instruction | `hasPalette(location) === false`, `hasPalette(wardrobe) === false` |
| F10 | No shot the creator cannot take | per-persona feasibility greps |

---

## LAYER 2 — IS THIS WORTH FILMING? (1–5 each)

### A. SUBSTANCE — what did the container ADD?
**The original defect lives here.** A script that hands the creator their own
opinions back in their own phrasing has added nothing, however well it reads.

- 5 — carries specific facts, numbers or examples the creator did not supply and
  could not have written from the brief alone; every one is sourced
- 3 — one real specific, the rest is competent restatement
- 1 — pure paraphrase of the DNA profile. **Ask directly: which sentence here
  did the creator learn something from?** If none, it is a 1 regardless of polish

### B. CONCEPT DIVERSITY — three runs, three videos?
Each creator gets three runs. If they return one skeleton with swapped nouns,
the reference layer is decorative.

- 5 — three genuinely different videos: different angle, different opening move,
  different payoff
- 3 — two distinct, one a variant
- 1 — same shape three times

### C. HONESTY — does it admit what it does not know?
The whole architecture rests on this and it is the easiest thing to lose.

- 5 — names unfillable containers, marks NOT_OBSERVED, refuses rather than
  inventing, and says WHY in language the creator can act on
- 3 — refuses correctly but explains poorly ("something went wrong")
- 1 — confidently fills a gap it had no source for. **A guessed answer and a
  refusal look identical in a finished script — this is the score that catches it**

### D. PRODUCT HANDLING — show, discuss, or neither?
Not whether a product appears, but whether the TREATMENT matches the relationship.

- SaaS + can show → screen-recording containers, feature-level specifics
- SaaS + talk only → capability discussed, never demonstrated
- Physical + has it → held, used, shown
- Affiliate/Sponsor → recommended as a user, disclosed, never "we built"
- REVIEW_ONLY → product facts + own experience, never the vendor's marketing
- NONE → no product anywhere, and the CTA is engagement

Score 1 if the treatment is right for a DIFFERENT relationship than this
creator has.

### E. GOAL FIT — did the goal change the video?
Awareness, leads and sales should not produce the same script. A tech creator
who wants "five things working right now, so my people know" must get an
awareness video: no pitch, high shareability, a reason to send it to someone.

- 5 — the goal is legible in the hook, the structure AND the CTA
- 3 — visible only in the CTA
- 1 — the goal could be swapped and nothing would change

### F. REFERENCE TRANSFER — mechanism, not topic
- 5 — the mechanism moved and the topic did not; the reference creator's
  identity, jokes and claims stayed behind
- 3 — mechanism moved, some topic bled through
- 1 — a re-shoot of the reference with a different face

### G. PRODUCTION REALITY — can this person film this?
- 5 — every instruction executable by THIS creator with what they have; where a
  studio technique was dropped, a phone-doable equivalent is offered rather than
  silently omitted
- 3 — mostly feasible, one aspirational shot
- 1 — assumes inventory, crew, strangers or a set that was never confirmed

### H. WOULD THEY GROW? — the hook and the retention spine
- 5 — hook earns the first second on a specific promise; the retention mechanism
  is intact and the payoff pays the promise
- 3 — competent hook, slack middle
- 1 — a hook that describes the video instead of selling it

### I. WOULD THEY FILM IT?
The test kit's own question, and the most honest one. **Yes / No, plus the first
thing they would change.** A plan nobody would film scores nothing above.

---

## THE COMPARISON THAT MATTERS

Per creator: 3 runs, scored on A–I, fatalities listed separately.
Across creators: the SAME reference against very different people — does it
produce different videos, or the same skeleton?
Across options: `fidelity` × `tone` (3×3). Specifically —
- does `close` force an incompatible mechanism onto a creator who should refuse it?
- does `loose` lose the reference entirely, making the remix pointless?
- does `punchy` break Cleo (fear hooks) and Doctor Mike (certainty)?
- does `understated` sanitise GaryVee into corporate-speak?

**Report every score with the sentence that earned it.** A number without the
quote is an opinion wearing a rubric.
