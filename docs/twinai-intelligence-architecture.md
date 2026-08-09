# TwinAI — the four-source intelligence architecture

The target architecture for Creator DNA, User Intent, Product DNA and Reference
DNA, and the build order to reach it.

**What this document adds beyond the specification it was written from:** every
layer is mapped onto what ALREADY EXISTS in this repository. Three of the
objects below are already built and have no writer. Two questions are already
asked and read by nothing. Knowing which is which is the difference between a
rewrite and a wiring job — and most of this is a wiring job.

---

## 1. The four sources, and the rule

```
CREATOR DNA      how I communicate
USER INTENT      what I am trying to accomplish now
PRODUCT DNA      what I sell/feature, and what is TRUE about it
REFERENCE DNA    what creative mechanism we are adapting
        ↓
CREATIVE DECISION PLAN
        ↓
SCRIPT CONTAINERS → SCRIPT → DIRECTOR PLAN → SCENES → EDIT
```

**The rule that makes this work:** no layer may make a decision belonging to
another. Voice does not choose topic. Reference does not choose claims. Product
does not choose tone. Today all four are collapsed into one prompt, which is why
the generator produces the creator's own opinions restated in their own phrasing.

---

## 2. What already exists — read this before building anything

| Target object | Current state |
|---|---|
| **Creator DNA** | ✅ **Built and good.** `brand_voices.profile` — niche, sub_niche, tone, pacing, hook_style, hook_patterns, sample_hooks, vocabulary, recurring_ctas, dos, donts, enemy, pov, formats. Verified accurate on a real creator. |
| **Script Containers** | ⚠️ **`creative_transfer_plans` EXISTS** — table, contract, semantic validator, migration — **and nothing writes to it.** `creativeTransferPlan.ts` already refuses to let an `unknown` evidence kind support a transfer. This is the container object, already specified. |
| **Reference DNA** | ⚠️ **Half-built.** `referenceEvidence.ts` has a four-kind taxonomy (observed/measured/interpreted/unknown) and already names the nine things never looked at. It reads TRANSCRIPTS ONLY — never pixels. |
| **Product DNA** | ⚠️ **`PRODUCT_EVIDENCE_FORM` is fully specified in shared code and no screen imports it.** `productEvidence` is a stored brief key with zero readers and zero askers. This is the seed. |
| **User Intent** | 🔴 `goal` is asked and read by nothing. `workKind` is asked and read by nothing. `audience` IS read. |
| **Director Plan** | 🔴 Does not exist as an object. Scene direction is free text the model invents per scene. |
| **Capabilities** | ✅ **Built and wired.** `can_record_screen` / `can_film_objects`, three-state, read by `DeclaredClips.tsx`. |

**Conclusion: the container layer and the product layer are already designed and
unwired. This is mostly a wiring job, not a green field.**

---

## 3. WHERE each thing is asked — the decision

The current flow asks everything on one review screen after the scan, five
phone-screens long. In the real session every question below the fold came back
unanswered. Placement is therefore not cosmetic.

### Step 1 — Handle (unchanged)
Paste handle → Creator DNA scan runs.

### Step 2 — DURING the scan, one question per step
The scan takes ~5 minutes and currently shows a progress bar. Ask here. Two
reasons: the wait disappears, and **the questions actually get answered**.

| Scan step | Question |
|---|---|
| Fetching your posts | **Q1 — What do you want your content to achieve?** (max 2: Grow audience · Build authority · Educate · Generate leads · Drive sales · Entertain) |
| Reading captions & hooks | **Q2 — Who are you creating for?** (Consumers · Founders · Businesses · Professionals · Creators · Students · Enthusiasts · Other) then (Beginner · Familiar · Expert · Mixed) |
| Synthesising your voice | **Q3 — What best describes what you do?** + its conditional |

**Q3 is the routing question.** Its answer decides which Product DNA subtype is
offered later, so it must be answered before Step 4 exists.

### Step 3 — Confirm the voice (existing review screen, CHUNKED)
Show what the scan found. Chunk it: identity → voice → worldview. Not one scroll.

### Step 4 — After the voice is confirmed
| Question |
|---|
| **Q4 — What do your videos promote or feature?** + conditional + the ONE text answer: *What should viewers do after watching?* → the default CTA |
| **Q5 — What kind of videos should Twin help you make?** + prioritisation |

### Step 5 — Product DNA, offered NOT forced
Only if Q4 says there is something to sell/feature. **This is a library, not a
questionnaire.** Four ways in: paste a website URL · paste a product page ·
upload an image/PDF/screenshot · manual entry.

> *Paste a link or upload your product. Twin will do the rest.*

Not twelve form fields.

---

## 4. Product DNA subtype routing — one path, never all three

Q3 + Q4 select **exactly one** subtype. The failure to avoid is running a
physical-product schema, a SaaS schema and a service schema over the same input
and merging the results.

```
Q3 = Founder → SaaS/App        ─┐
Q4 = My app/software           ─┴→  SAAS DNA

Q3 = Founder → Physical/Ecom   ─┐
Q4 = My physical products      ─┴→  PHYSICAL PRODUCT DNA

Q3 = Coach/Agency/Professional ─┐
Q4 = My services               ─┴→  SERVICE (OFFER) DNA

Q4 = Affiliate / Sponsors /    ──→  AFFILIATE DNA
     Products I review              (ownership = THIRD PARTY)

Q4 = My ideas/expertise or     ──→  NO PRODUCT DNA.
     Nothing commercial              Nothing breaks. See §8.
```

Each subtype stores different fields. Shared spine across all four:

```
identity · positioning · benefits · proof · restrictions · commercial · visual
```

**`restrictions` is the one that must never be optional.** Approved claims,
forbidden claims, unverified claims. `forbiddenClaims` is ALREADY wired into
`generate-blueprint` — this extends a working path rather than inventing one.

### Affiliate is structurally different
```
relationship: AFFILIATE
ownership:    THIRD PARTY
```
`promotes: 'affiliate'` **already writes exactly this constraint** into the
prompt — *"Do NOT write 'my product', 'we built', or any claim of ownership."*
Affiliate DNA extends a rule that already works.

### Four separate truth kinds, never merged
```
PRODUCT FACT        from the page / sheet / manual entry
CREATOR EXPERIENCE  what they actually claim to have done
MARKETING CLAIM     what the vendor asserts
AI INFERENCE        what a model read off an image
```
An image can establish *"the package says 30 capsules."* It cannot establish
*"the capsules reduce inflammation."* This maps onto the EXISTING
`observed / measured / interpreted / unknown` taxonomy in `referenceEvidence.ts`
— reuse it rather than inventing a second one.

---

## 5. Container ownership — the matrix that must exist in code

A reference does not give Twin a script. It gives a **structure with empty
semantic slots**.

```
FORMAT           Listicle
HOOK CONTAINER   [NUMBER] + [CATEGORY] + [NEGATIVE EXPERIENCE]
ITEM_1           common / relatable
ITEM_2           unexpected
REHOOK           "but the last one..."
ITEM_3           strongest / payoff
CTA              save/share mechanism
```

**Who may fill what — enforce this, don't merely document it:**

| Layer | Fills | Must NEVER fill |
|---|---|---|
| **Creator DNA** | voice, vocabulary, attitude, sentence rhythm, delivery | topic, facts, claims |
| **User Intent** | goal, audience, desired outcome | voice, structure |
| **Product DNA** | product facts, benefits, differentiators, offer, proof, approved claims | tone, structure |
| **Research** | current products, statistics, trends, comparisons | claims about the creator's product |
| **Reference DNA** | hook mechanism, container shape, sequencing, escalation, payoff, CTA mechanism | topic, claims, voice |

**This is the fix for "the script is stupid."** Today Creator DNA fills
everything, because it is the only layer with data — so the script can only
restate the creator's own POV.

---

## 6. The Creative Decision Plan

Freeze every decision BEFORE the writer runs. Single source of truth per video.

```
VIDEO OBJECTIVE          from User Intent
AUDIENCE                 from User Intent
CREATOR IDENTITY         from Q3
FORMAT                   from Q5 + Reference
TOPIC                    from Product DNA + Research
REFERENCE CONTRIBUTION   only what was genuinely OBSERVED
CREATOR DNA CONTRIBUTION voice only
PRODUCT DNA CONTRIBUTION facts + approved claims only
RESEARCH REQUIRED        named gaps
CTA                      user-confirmed, from Q4
DO NOT USE               reference products, reference identity,
                         exact wording, unsupported claims
```

The writer receives the **plan plus selected context** — not the raw database. A
founder opinion video does not need seventeen thumbnail-colour attributes in the
prompt.

---

## 7. The Director Plan

Currently every scene's direction is free text the model invents. It produced
*"Warm beige background lit softly, with a neat bookshelf and a small yellow
accent lamp"* for someone filming in a bedroom at night.

**Three inputs, no new questions:**

```
CREATOR DNA  +  REFERENCE MECHANICS  +  SCENE PURPOSE  →  DIRECTOR PLAN
```

**Per scene, decide:** background style · position (sit/stand/walk) · camera
height · distance · phone orientation · angle · framing · lens eye-contact ·
movement · gesture intensity · energy · pattern interrupt · whether the next
scene keeps the setup.

**Scene purpose drives framing:**

| Purpose | Direction |
|---|---|
| Hook | closest framing, strong eye contact, no distraction |
| Explanation | medium framing, relaxed |
| Re-hook | angle or position change |
| Proof | steady, product visible if relevant |
| Payoff | tighter, slower emphasis |
| CTA | direct eye contact, clean frame |

**Group scenes into SETUPS.** Do not make a creator reposition a phone seven
times. Setup A: scenes 1–3. Setup B: scenes 4–5. Setup C: scene 6.

**The rule for backgrounds — achievable direction, not assumed inventory:**

> ✅ *"Use a clean, uncluttered background and shoot at eye level, because this
> is an authority explainer."*
> ❌ *"Sit on the walnut chair beside your lamp."*

Give the purpose, not the furniture. Only name specifics when the reference
genuinely contained them AND there is a reason to adapt them.

**Pattern interrupts** become first-class: tight→wide · seated→standing ·
straight-on→slight angle · centre→off-centre · still→small walk · pause before
reveal · hold product · return to original setup. No B-roll required.

**Product DNA controls filming too.** `available while filming: yes` → *"hold the
product on line 2."* `no` → never generate that instruction. This connects to the
EXISTING `can_film_objects` / `can_record_screen` capability gates.

---

## 8. When there is no product — nothing breaks

Creator picks *ideas/expertise* + *nothing commercial* → Product DNA is simply
absent. Creative Plan = Creator DNA + User Intent + Reference DNA + Research.

*"3 products I regret buying"* adapts to *"3 productivity habits I regret
following."* **The container type changes from products to ideas.** Commerce is
never forced where none exists. `promotes: 'nothing_to_sell'` already forbids a
purchase CTA — that rule exists and works.

## 9. When there are MANY products

Query the Product Library before scripting. Rank by audience relevance · goal
relevance · creator relationship · freshness · previous coverage · product
confidence · commercial priority · reference fit. Propose, let the user swap,
then script. **Never let the model hallucinate five trendy tools.**

## 10. The Gallery becomes a reasoning surface

Replace niche-keyword matching with:

```
DNA match + goal match + audience match + format match
+ product compatibility + recreate feasibility
+ CONTAINER FILLABILITY + freshness  =  recommendation score
```

**Container fillability is the novel one:** can this reference's slots actually
be filled from this creator's Product Library? A card that says *"Your Product
Library contains 8 suitable tools · Products ready 3/3 · Estimated recording
35s"* is reasoning about the user's version before they click.

---

## 11. Every DNA field carries provenance

```
value · source · confidence · observed|inferred · last_updated · user_confirmed
```

Not new discipline — `referenceEvidence.ts` already does exactly this, and
`CreativeTransfer.tsx` already renders it. **Extend that taxonomy to Creator DNA
and Product DNA rather than inventing a parallel one.**

---

## 12. Build order

Each step is shippable and leaves the product working.

| # | Step | Why first |
|---|---|---|
| **1** | **Reference `mode: 'pattern'` → hard stop before spend, every path** | If there is no substance, do not sell a script. Blocks nothing else and stops the bleeding. |
| **2** | **Wire `workKind` + `workKindOther` into the prompt** | Two lines. Ends "a doctor and a hobbyist get the same script." Highest lever per hour. |
| **3** | **Wire `goal`; stop preferring three other authorities over the creator's answer** | Same shape, same file. |
| **4** | **Move Q1–Q3 into the scan; chunk the review screen** | Without this the answers keep coming back empty. |
| **5** | **Product DNA: subtype routing + URL/upload ingestion + the restrictions block** | The substance layer. Start with ONE subtype end-to-end — SaaS, because it needs no image pipeline. |
| **6** | **Write `creative_transfer_plans`** | The table, contract and validator already exist. Give the container object its writer. |
| **7** | **Creative Decision Plan as a frozen object** | Depends on 2, 3, 5. |
| **8** | **Director Plan + setups + pattern interrupts** | Depends on 7. |
| **9** | **Visual reference analysis** | The nine NOT OBSERVED rows. Largest, and the only one needing new infrastructure. |
| **10** | **Gallery scoring incl. container fillability** | Depends on 5 and 6. |

---

## 13. Prompt for the next session

> Read `docs/twinai-intelligence-architecture.md` and
> `docs/twinai-session-build-plan-2026-08-09.md` first.
>
> Context: TwinAI's script generator produces voice-accurate, content-empty
> scripts. Root cause is documented in `scripts/ci/brief_consumers.json` — the
> creator answers nine questions, four are read, three are never even asked. The
> generator has the creator's VOICE and almost nothing else.
>
> Start at §12 step 1 and work down. Do not skip to Product DNA: steps 1–4 are
> hours of work each and remove the bleeding, and step 5 is meaningless while
> the answers that route to a subtype are still unread.
>
> **Before writing code, verify these claims rather than trusting this document:**
> - `creative_transfer_plans` has a contract, a validator and no writer
> - `PRODUCT_EVIDENCE_FORM` exists in shared and no screen imports it
> - `workKind`, `workKindOther`, `goal`, `productEvidence`, `alsoWantsToMake`
>   have `readBy: []` in `scripts/ci/brief_consumers.json`
> - `referenceEvidence.ts` reads transcripts only, never pixels
>
> `check_brief_consumers.mjs` fails the build the moment a key is wired without
> updating the registry — so wiring one means deleting its `unwiredReason` in the
> same PR. That guard is the definition of done for steps 2 and 3.
>
> **Do not add a question without a reader in the same PR.** That rule is the
> entire reason this document exists.
