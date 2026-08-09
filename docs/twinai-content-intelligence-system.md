# TwinAI — the complete content intelligence system

**Status: canonical.** This file supersedes the layer specifications and the
build order that were in `docs/twinai-intelligence-architecture.md`. That file
is now a pointer. `docs/twinai-session-build-plan-2026-08-09.md` remains the
record of what the first real production run found, and is not superseded.

Everything here is written so a session that has never seen this product can
build from it. Where a claim is about the repository as it stands, it names the
file. Where it is about the target, it says so.

---

## 0. How to read this

| Mark | Meaning |
|---|---|
| ✅ | Exists in the repo and is wired to something that reads it |
| 🟨 | Exists in the repo and **nothing reads it** — a wiring job, not a build job |
| 🔴 | Does not exist |
| ⚖️ | A decision recorded here so it is not re-litigated from memory |

The single most valuable fact in this document is how much of it is 🟨. Reading
this specification as a green field would rebuild finished work.

---

## 1. The problem, in one page

TwinAI's script generator produces **voice-accurate, content-empty** scripts.

The creator answers nine questions. `scripts/ci/brief_consumers.json` is the
registry of who reads each one, and it says:

| Answer | Read by |
|---|---|
| `audience` | ✅ `generate-blueprint` |
| `offer` | ✅ `generate-blueprint` |
| `forbiddenClaims` | ✅ `generate-blueprint` |
| `promotes` | ✅ `generate-blueprint` |
| `goal` | 🟨 nothing |
| `workKind` | 🟨 nothing |
| `workKindOther` | 🟨 nothing |
| `productEvidence` | 🟨 nothing |
| `alsoWantsToMake` | 🟨 nothing |

Four of nine are read. Three of the nine are never even displayed — they sit
below the fold on a five-screen review page, and in the first real production
run **every question below the fold came back unanswered**.

So the generator holds the creator's **voice** and almost nothing else. Given
only a voice and a structure to fill, a language model can only produce the
creator's own opinions in the creator's own phrasing. That is why:

- the containers feel empty
- a tech creator can get a doctor's script
- the script hands back what the creator already thinks

**The fix is not prompt tuning.** It is giving every layer a job, giving it
data, and forbidding it from doing another layer's job.

⚖️ **The root cause is structural, not individual.** Every PR that added a
question was correct, tested and shipped green. Nothing failed. The answer was
stored and simply never read. That is why the fix must be a *guard*, not a
resolution — see §27.

---

## 2. What already exists — read this before building anything

Three of the objects in this architecture are already built and have no writer.

| Layer in this document | In the repo today |
|---|---|
| **Script Containers** | 🟨 `creative_transfer_plans` — table (`supabase/migrations/0095_creative_transfer_lineage.sql`), contract (`packages/shared/src/creativeTransferRows.ts`), and a semantic validator that **already refuses to let an `unknown` evidence kind support a transfer**. Nothing writes to it. |
| **Product DNA seed** | 🟨 `PRODUCT_EVIDENCE_FORM` — fully specified at `packages/shared/src/preScriptBrief.ts:131`, mapping each work-kind to the evidence form it needs (`saas → link`, `ecommerce → images`). **No screen imports it.** Only its own test does. |
| **Provenance on every field** | ✅ `packages/shared/src/referenceEvidence.ts` already classifies `observed / measured / interpreted / unknown`, and `apps/web/src/components/CreativeTransfer.tsx` already renders it |
| **Ownership constraint for affiliate** | ✅ `promotes: 'affiliate'` **already writes** *"Do NOT write 'my product', 'we built', or any claim of ownership"* into the prompt |
| **Forbidden claims** | ✅ `forbiddenClaims` already reaches `generate-blueprint` |
| **The guard that makes this stick** | ✅ `scripts/ci/check_brief_consumers.mjs` fails the build when a key is wired without updating the registry |
| **Reference hard stop** | ✅ `mode: 'pattern'` refuses before spend on every path (shipped) |

⚖️ **Extend the existing taxonomy, do not build a second one.** §13's four truth
kinds map onto `referenceEvidence.ts`'s existing four kinds. Two vocabularies for
the same distinction will drift, and then no one will know which is authoritative.

---

## 3. The four sources, and the rule

```
CREATOR DNA      Who am I and how do I create?
USER INTENT      Who am I trying to reach, and what do I want now?
PRODUCT DNA      What do I sell/show/recommend, and what is TRUE about it?
REFERENCE DNA    What creative mechanics make this reference work?
                              ↓
                  CREATIVE DECISION PLAN
                              ↓
          CONCEPT → SCRIPT → SCENES → EDIT
```

**The rule, and it is the whole architecture:** each source has a different job,
and **no source may do another source's job**. Twin must never throw everything
into one giant prompt and hope the model develops managerial skills.

Today Creator DNA fills every container, because it is the only layer holding
data. That is precisely the defect.

---

## 4. Creator DNA — full field specification

Extracted from Instagram, TikTok and YouTube. It should increasingly use actual
**video transcripts, thumbnails and performance** rather than relying mainly on
captions.

### Identity
`niche` · `subNiche` · `existingAudienceSignals` · `audiencePain` · `dreamOutcome`

### Voice
`tone` · `pacing` · `vocabulary` · `sentencePatterns` · `hookStyle` ·
`hookPatterns` · `exampleHooks` · `recurringCTAs`

### Creative worldview
`pov` · `recurringBeliefs` · `enemy` (the conventional wisdom they challenge) ·
`dos` · `donts`

### Packaging
`existingFormats` · `titleStyle` · `thumbnailStyle` · `brandColors`

### Performance — later, not first
`formatsThatOutperform` · `hooksThatOutperform` · `topicsThatOutperform` ·
`typicalVideoLength` · `formatFatigue` · `repeatedTopics`

### ⚖️ Every field carries an envelope, without exception

```
value
source          where it came from
confidence
kind            observed | measured | interpreted | unknown
lastUpdated
userConfirmed   boolean
```

Reuse `referenceEvidence.ts`'s `EvidenceKind` for `kind`. A field without an
envelope is a guess wearing the same clothes as a fact, and downstream nothing
can tell them apart — which is how "warm beige background with a neat bookshelf"
was generated for someone filming in a bedroom at night.

---

## 5. User Intent — the five questions

Twin asks **only what social-media analysis cannot safely establish.** Everything
else is scanned, not asked. Five questions, one text field in total.

### Q1 — What do you want your content to achieve?
*Choose up to 2.*
Grow audience · Build authority · Educate · Generate leads · Drive sales · Entertain

→ becomes `currentIntent`.

### Q2 — Who are you creating for?
Consumers · Founders/Entrepreneurs · Businesses/Teams · Professionals · Creators ·
Students · Enthusiasts · Other

*Then:* Beginner · Familiar · Expert · Mixed

→ establishes **intended** audience. ⚖️ This exists as a separate question
because *historical audience ≠ desired audience*, and the scan can only see the
historical one. Assuming they are the same is how a creator trying to move
upmarket keeps getting their old audience's content.

### Q3 — What best describes what you do? **(THE ROUTING QUESTION)**
*Multi-select:* Creator/Influencer · Founder/Business Owner · Coach/Consultant ·
Agency/Freelancer · Ecommerce/Brand · Professional · Brand/Content Team · Other

*Conditional second level:*

| If | Then ask |
|---|---|
| Founder | SaaS/App · Physical Product · Ecommerce · Service · Marketplace · Other |
| Creator | Education · Reviews · Commentary · Lifestyle · Entertainment · Products · Other |
| Ecommerce | Physical · Digital · Both |
| Coach/Agency | Service · Consulting · Training · Community |

→ establishes the real-world identity behind the social profile. **This is the
answer that selects the Product DNA subtype**, which is why its placement is
non-negotiable (§6).

### Q4 — What do your videos promote or feature?
*Multi-select:* My ideas/expertise · My physical products · My app/software ·
My services · Affiliate products · Sponsors · Products I review · Nothing commercial

*Conditional:*

| If | Then ask |
|---|---|
| Physical product | Usually have it while filming · Sometimes · No |
| Software | Talk about it · Show it · Both |
| Affiliate/reviewer | Products I use · Best for my audience · Trending products · I choose each time |

**The only free-text answer in the whole flow:**
> *What should viewers do after watching?* → e.g. `Try Twin free`

→ the creator's default CTA. Overridable per video.

⚖️ The Q4 conditionals are not preference questions — they are **production
facts**, and they drive the Director Plan (§20). "Do you usually have it while
filming?" is what makes *"hold the bottle beside your face"* a legal instruction.

### Q5 — What kind of videos should Twin help you make?
Talking to camera · Walking/talking · Educational · Reviews/Comparisons ·
Product-led · App/Software · Founder/Business · Storytelling · Commentary/Reaction ·
POV/Skits · Podcast/Interview · **Recommend for me**

*Then — prioritise:* What I already make · What best fits my goals · New formats
I could try · A mix

---

## 6. ⚖️ WHERE each thing is asked — the decision

The current flow asks everything on one review screen after the scan, five phone
screens long. In the real production run **every question below the fold came
back unanswered.** Placement is not cosmetic — it is the reason the answers are
empty.

### Step 1 — Handle
Paste handle → Creator DNA scan starts. **Unchanged.**

### Step 2 — DURING the scan, one question per step ← *the first question is asked here*

The scan takes ~5 minutes and currently shows a progress bar. Ask here. Two
reasons, and the second matters more: the wait disappears, **and the questions
actually get answered.**

| Scan step | Question |
|---|---|
| Fetching your posts | **Q1** — what should your content achieve |
| Reading captions & hooks | **Q2** — who you're creating for, + level |
| Synthesising your voice | **Q3** — what you do, + conditional |

⚖️ **Q3 must land before Step 5 exists**, because Q3 chooses the subtype. A
Product DNA offer made before Q3 is answered has no path to route down.

### Step 3 — Confirm the voice
The existing review screen, **chunked**: identity → voice → worldview. Not one
scroll. Each chunk confirmable on its own.

### Step 4 — After the voice is confirmed
**Q4** (+ conditional + the CTA text field), then **Q5** (+ prioritisation).

⚖️ Q4/Q5 sit after confirmation rather than in the scan because they are about
what Twin will *do next*, and asking them before the creator has seen that Twin
understood them is asking for trust that hasn't been earned yet.

### Step 5 — Product DNA, **offered, not forced**
Only if Q4 says there is something to sell or feature.

> *Paste a link or upload your product. Twin will do the rest.*

Skippable. Always reachable later from the Product Library. **Never a blocking
gate** — a creator who wants to make a video today must be able to.

---

## 7. Product DNA — a library, not a questionnaire

This is the layer that does not exist at all today, and it is why the scripts
are empty. Twin may understand how someone speaks, but until it understands
**what they sell and what is true about it**, it will write a beautifully
on-brand script about the wrong thing.

### Four ways in — all four, because one is never enough

| Way | Input |
|---|---|
| **Website** | Paste a product or website URL. Twin analyses it. |
| **Product page** | Paste a Shopify / Amazon / ecommerce product URL. |
| **Upload** | Product image · screenshot · PDF · product sheet. |
| **Manual** | Type it in. |

⚖️ 🟨 `PRODUCT_EVIDENCE_FORM` already encodes which form each work-kind needs
(`saas → link`, `ecommerce → images`). **Start there.** It is the seed of this
whole section and it is already written and tested.

⚖️ **Start with ONE subtype end-to-end: SaaS.** It needs a URL and no image
pipeline, so it proves the whole chain — capture → store → route → reach the
prompt → change the script — at the lowest infrastructure cost. Breadth before
depth here produces four half-built subtypes and no working script.

---

## 8. ⚖️ Subtype routing — per ENTITY, never per creator

> **CORRECTED.** An earlier version of this section routed Q3 + Q4 to *exactly
> one* subtype for the whole creator. That was wrong, and it was the biggest
> structural flaw in the plan. A creator can be a founder with their own SaaS,
> an affiliate for other tools, a sponsor partner, and sell consulting — all at
> once. Humans insist on having multiple revenue streams.
>
> A single global subtype means an affiliate creator who later launches their
> own product causes an identity crisis in the schema. **The routing is right;
> the scope was wrong.**

**Q3 establishes primary identity. Q4 establishes one or more commercial
relationships. Product DNA is a LIBRARY of entities, and the subtype is chosen
per entity.**

```
Product Library

├── Twin AI          type: SAAS      relationship: OWN_PRODUCT
├── Claude           type: SAAS      relationship: AFFILIATE
├── Consulting       type: SERVICE   relationship: OWN_SERVICE
└── Sponsored Tool X type: SAAS      relationship: SPONSOR
```

Every entity carries **two independent axes**, and conflating them is the bug
this structure exists to prevent:

| Axis | Values | Decides |
|---|---|---|
| `type` | `SAAS` · `PHYSICAL` · `SERVICE` · `DIGITAL` | **which schema** (§9–§11) |
| `relationship` | `OWN_PRODUCT` · `OWN_SERVICE` · `AFFILIATE` · `SPONSOR` · `REVIEW_ONLY` | **what may be claimed** (§12) |

An affiliated SaaS uses the SaaS schema *and* the third-party ownership rules.
Those are different questions and were previously answered by one field.

**What is still true, and still the failure to avoid:** never run a
physical-product schema, a SaaS schema and a service schema over the *same
entity* and merge the results. One entity, one `type`.

**Per-video selection.** Each video then asks: *which product context is
relevant here?* A creator with 23 entities does not put 23 products in one
script — the Script Container Plan (§18a) requests what it needs, and the
library is ranked against the reference (§14).

**No commercial entities at all** — Q4 says ideas/expertise or nothing
commercial — means no Product DNA. Nothing breaks. See §24.

**Shared spine across every entity, whatever its type:**

```
identity · positioning · benefits · proof · restrictions · commercial · visual
```

**`restrictions` is the one field that must never be optional**, in any type.

---

## 9. Physical Product DNA

*Example: someone sells an acupressure mat. They paste the Shopify page and
upload a photo.*

**Identity** — `productName` · `category` · `brand` · `productType` · `variants` · `price`

**Positioning** — `whatItDoes` · `targetCustomer` · `mainProblem` · `desiredOutcome` · `differentiators`

**Benefits** — `primaryBenefits` · `secondaryBenefits` · `features` · `usageScenarios`

**Visual understanding** (from product images) — `appearance` · `sizeAndForm` ·
`packaging` · `howItAppearsToBeUsed` · `visibleDetails`

**Proof** — `reviews` · `testimonials` · `ratings` · `evidence` · `certifications`

**Restrictions** — `approvedClaims` · `forbiddenClaims` · `unverifiedClaims` · `complianceNotes`

**Commercial** — `price` · `discount` · `bundle` · `offer` · `guarantee` · `cta` · `productUrl`

⚖️ **Every visual field is `interpreted`, never `observed`.** An image can
establish *"the package contains text saying 30 capsules."* It cannot establish
*"the capsules reduce inflammation."* Without this label, a model that sees a
blue rectangle will conclude it realigns the human spine through quantum
resonance, and nothing downstream will be able to tell that apart from a fact.

---

## 10. SaaS Product DNA

*Input: homepage · product page · pricing page · demo · screenshots.*

```
Product name    Twin AI
Category        AI video creation
Audience        Creators
Core job        Adapt references into creator-specific videos
```

**Problem** — what exists before using it.
**Transformation** — what changes after.
**Features** — e.g. Creator DNA · reference adaptation · script generation ·
recording · automatic editing · publishing.
**Use cases** — talking-head · founder content · reviews · educational.
**Differentiators** — what is actually distinct.
**Proof** — testimonials · numbers · examples · customer results.
**Pricing** — plans and offer.
**Approved claims** — what Twin can safely say.
**Forbidden / unverified claims** — what scripts must never invent.
**Visual/product state** — screens · UI · dashboard · what can be shown.

Now a script can talk about the actual software instead of declaring *"this AI
tool changes everything"* — a phrase which should probably be taxed.

---

## 11. Service (Offer) DNA

For agencies, consultants, doctors, lawyers, coaches. Product DNA becomes
**Offer DNA** — same architecture, different subtype.

`service` · `whoItsFor` · `problemSolved` · `process` · `deliverables` ·
`differentiator` · `pricingIfPublic` · `proof` · `testimonials` ·
`geographicRestrictions` · `approvedClaims` · `forbiddenClaims` · `bookingCTA`

⚖️ `geographicRestrictions` and `complianceNotes` are load-bearing here in a way
they are not for SaaS. A regulated professional generating a claim they are not
licensed to make in their jurisdiction is the highest-consequence failure in
this entire system.

---

## 12. Affiliate Product DNA — structurally different

The creator does **not own** the product. Twin must know that.

```
relationship:  AFFILIATE
ownership:     THIRD PARTY
```

This prevents *"we built…"* and *"our product…"*.

### ⚖️ Commercial relationship is NOT personal experience

> **CORRECTED.** An earlier version said the affiliate flag is *"why it can say
> 'I've been using…'"*. It is not. **Being an affiliate does not prove the
> creator has ever used the product.** Treating a commercial arrangement as
> evidence of personal experience manufactures a testimonial out of a payment
> agreement — the exact class of fabrication this taxonomy exists to stop.

Two independent fields, never collapsed:

```
relationship:  AFFILIATE | SPONSOR | REVIEW_ONLY | OWN_PRODUCT | OWN_SERVICE
personal_use:  CONFIRMED | NOT_CONFIRMED
```

| `personal_use` | The script may write |
|---|---|
| `CONFIRMED` | *"I've been using…"* — a creator-experience claim |
| `NOT_CONFIRMED` | *"This tool offers…"* — a product-fact claim only |

`NOT_CONFIRMED` is the default, and it is not a gap to be filled by inference.
Only the creator can move it, by saying so.

**Sponsorship carries its own obligation:**

```
relationship: SPONSOR
relationship_disclosure_required: true
```

Disclosure is a property of the entity, not a per-video decision the writer may
weigh against pacing.

Stores: `product` · `brand` · `productUrl` · `affiliateUrl` · `features` ·
`price` · `audience` · `verifiedClaims` · `creatorsActualOpinion` · `pros` ·
`cons` · `relationshipDisclosure`

⚖️ ✅ **This extends a rule that already works.** `promotes: 'affiliate'`
already writes the ownership prohibition into the prompt today. Affiliate DNA
gives that rule facts to work with; it does not invent the rule.

---

## 13. ⚖️ Four truth kinds, never merged

```
PRODUCT FACT        from the page / sheet / manual entry
CREATOR EXPERIENCE  what the creator actually claims to have done
MARKETING CLAIM     what the vendor asserts
AI INFERENCE        what a model read off an image
```

These map **exactly** onto the existing `observed / measured / interpreted /
unknown` taxonomy in `referenceEvidence.ts`. Extend that; do not build a second
vocabulary for the same distinction.

The script writer must be able to see which kind each fact is, because the
sentence it is allowed to write differs:

| Kind | Permitted |
|---|---|
| Product fact | State it |
| Creator experience | State it in first person, only if confirmed |
| Marketing claim | Attribute it — *"they say…"* |
| AI inference | **Never stated as fact.** Direction only, or discard |

---

## 14. The Product Library

```
MY PRODUCTS              Twin AI (SaaS) · Creator Academy (digital)
PRODUCTS I FEATURE       Claude · Higgsfield · Descript   (affiliate/sponsor)
PREVIOUS PRODUCTS        things discussed before
```

Each product carries a status:

| Status | Meaning |
|---|---|
| **Ready** | Product DNA sufficiently complete |
| **Needs review** | Twin inferred important information — a human should confirm |
| **Missing information** | **Cannot safely script claims yet** |

⚖️ "Missing information" must be a *hard* state, not a warning. A product in
that state may be *mentioned* but must not have claims generated about it. This
is the same principle as the reference hard stop already shipped: if there is no
substance, do not manufacture some.

### When there are MANY products

A tech creator might have their own SaaS, 14 affiliate products and 8 previously
reviewed ones. Given a reference — *"5 things every creator needs"* — Twin
queries the library and ranks candidates by:

```
audience relevance · goal relevance · creator relationship · freshness
previous coverage · product confidence · commercial priority · reference fit
```

Then proposes: *"These five products best fit this reference."* The creator can
**use these** or **swap**. Then script.

⚖️ This is considerably better than letting the model hallucinate five trendy
tools from whatever neurons happen to be awake.

---

## 15. Reference DNA

What creative mechanics make this reference work. Today
`packages/shared/src/referenceEvidence.ts` reads **transcripts and derived
structure only — never pixels**, and honestly emits nine visual facts as
`unknown` rather than guessing them. That honesty is why the visual layer is
step 9 and not step 2: the gap is already labelled.

Reference DNA contributes: hook mechanism · container shape · sequencing ·
escalation · payoff structure · CTA mechanism · pacing **when genuinely
observed**.

⚖️ `words_per_min` **looks** measured and is not — it is the model's estimate,
and it is correctly normalised as `interpreted`, with a genuinely measured WPM
emitted alongside it from the transcript. Preserve that distinction.

---

## 16. Research

Fills factual containers that no other layer can: current products, statistics,
trends, comparisons, third-party examples.

⚖️ Research may **never** make claims about the creator's own product. That is
Product DNA's job, and a research result that contradicts Product DNA must
surface as a conflict rather than silently winning.

---

## 16a. ⚖️ Per-video intent — the onboarding goal is a DEFAULT, not a verdict

Q1 captures the creator's standing objective. **Individual videos differ.**
Someone whose default is *build authority* will make one video to *launch a
feature*, and forcing that through a profile-level goal makes the whole intent
layer feel wrong at exactly the moment it matters.

```
Profile Intent      default goals, from Q1
        +
Video Intent        THIS video's goal
```

When a reference is chosen, offer a one-tap override, **pre-filled with their
default**: Authority · Reach · Leads · Sales · Education.

⚖️ One tap, never a re-run of onboarding. A per-video question that costs more
than a tap will be skipped, and a skipped override silently reasserts the
default — which is worse than not offering one, because now the screen implies
the creator chose it.

---

## 16b. ⚖️ Reference Compatibility Gate — before the plan, not inside it

Between Reference DNA and the Creative Decision Plan there is one more stage,
and it asks a single question:

> **Can this reference actually be adapted for this person?**

Every reference dimension gets one of four verdicts:

```
TRANSFER      take it as is
ADAPT         take the mechanism, change the execution
REJECT        do not carry this across
NOT OBSERVED  we never measured it, so we have no opinion
```

*A luxury perfume brand referencing an aggressive comedy creator:*

```
3-part reveal structure ....... TRANSFER
mid-video re-hook ............. TRANSFER
fast pacing ................... ADAPT
loud performance .............. REJECT
creator's jokes ............... REJECT
product claims ................ REJECT
camera rhythm ................. NOT OBSERVED
```

⚖️ **This must be a separate stage with its own output.** Folded into the
writing prompt, the model rationalises every reference into compatibility —
because a writer asked to write will always find a way. A gate that runs first,
and can return REJECT on most dimensions, is what makes "this reference is
wrong for you" a possible answer.

The verdicts become an input to the Creative Decision Plan. They are not
re-derived by it.

---

## 17. The Creative Decision Plan

Before scripting, Twin **freezes** every decision. This becomes the single
source of truth for the video.

```
VIDEO OBJECTIVE      Generate trials
AUDIENCE             Creators making short-form content
CREATOR IDENTITY     Founder + creator
FORMAT               Talking-head listicle
TOPIC                3 creator workflows AI is replacing

REFERENCE CONTRIBUTION   Confession hook · three-item structure ·
                         escalation · strongest point last
CREATOR DNA CONTRIBUTION Direct language · contrarian POV · short sentences
PRODUCT DNA CONTRIBUTION Twin's actual capabilities · supported workflow ·
                         approved positioning
RESEARCH REQUIRED        Current creator workflows · competitive context
CTA                      Try Twin free

DO NOT USE           Reference products · reference identity ·
                     exact wording · unsupported product claims
```

⚖️ The `DO NOT USE` block is not decoration. It is the list of things the
reference contributed that must **not** transfer, and it is what stops the
script becoming a re-shoot of someone else's video.

### ⚖️ Every decision carries source, reason and confidence

The CDP is a **contract, not a generated paragraph.** Each line is inspectable:

```
Decision:    3-item list
Source:      REFERENCE_DNA
Reason:      the reference's core narrative mechanism
Confidence:  0.96

Decision:    calm delivery
Source:      CREATOR_DNA
Reason:      creator voice conflicts with the reference's aggressive delivery
Confidence:  0.88
```

Without `source`, nobody downstream can tell a transferred mechanic from an
invented one — and the trust screen becomes decoration.

**The full field list**, because a plan missing a field silently delegates that
decision to whoever writes next:

```
video objective · audience · audience level · topic · angle · format · target length
creator DNA selections · product DNA selections · reference transfer decisions
research requirements · container definitions · CTA · forbidden claims
required evidence · commercial relationship · personal-use status
visual energy · director strategy · pattern-interrupt strategy
supported production mode · unsupported requirements · DO NOT USE
```

---

## 17a. Concept candidates — generate, score, then write

The CDP does not hand straight to the writer.

```
Creative Decision Plan → 3–5 concept candidates → score → selected concept
```

From *"3 things I stopped buying after becoming a personal trainer"*:

```
A. 3 AI subscriptions I stopped paying for
B. 3 creator tools founders don't need
C. 3 things I stopped doing after building Twin
D. 3 tools I'd never recommend to a new founder
```

Scored on: audience relevance · goal relevance · DNA fit · **evidence
availability** · novelty · recreate feasibility · Product DNA relevance.

⚖️ *Evidence availability* is the one that does real work. A concept nothing
can substantiate scores badly **before** it is written, rather than being
discovered as an unfillable slot halfway through a script.

---

## 18. Script Containers, and who fills them

A reference does not give Twin a script. It gives a **structure with empty
semantic slots**.

*"3 products I regret buying"* →

```
FORMAT           Listicle
HOOK CONTAINER   [NUMBER] + [CATEGORY] + [NEGATIVE EXPERIENCE]
ITEM_1           common / relatable
ITEM_2           unexpected
REHOOK           "but the last one..."
ITEM_3           strongest / payoff
CTA              save / share mechanism
```

### ⚖️ The ownership matrix — this must exist in code, not prose

| Layer | Fills | Must NEVER fill |
|---|---|---|
| **Creator DNA** | voice, vocabulary, attitude, opinion style, sentence rhythm, emotional delivery — **and may PROPOSE and RANK topics** | facts, claims, **final** topic authority |
| **User Intent** | goal, audience, desired outcome, current direction — **and DECIDES the topic** | voice, structure |
| **Product DNA** | product facts, benefits, features, differentiators, offer, proof, approved claims, product examples | tone, structure |
| **Research** | current products, statistics, trends, comparisons, third-party examples | claims about the creator's product |
| **Reference DNA** | hook mechanism, container shape, sequencing, escalation, payoff, CTA mechanism, observed pacing | topic, claims, voice |

### ⚖️ "May suggest" is not "may decide"

> **CORRECTED.** An earlier version forbade Creator DNA from touching topic at
> all. Too strict, and it throws away the best topic signal in the system.

Creator DNA knows the niche, sub-niche, beliefs, the enemy, historically strong
formats and recurring themes. Those are exactly what good topic *generation*
needs. So:

> **Creator DNA may propose and rank topics. User Intent, the selected
> reference, and the Creative Decision Plan decide which one is made.**

Twin may offer *"Three SaaS pricing mistakes founders make"* because the DNA
shows repeated pricing opinions. It must **not** force pricing onto a creator
who asked for an onboarding video. The distinction is authority, not silence.

**This is the fix for "the script is stupid."** Today Creator DNA fills
everything because it is the only layer with data, so the script can only
restate the creator's own POV back to them.

🟨 `creative_transfer_plans` is the persisted form of this object. Table,
contract and semantic validator all exist. **It has no writer.** Giving it one
is step 6.

---

## 18a. ⚖️ The Script Container Plan is its own stored object

Two different questions, two different objects:

| Object | Answers |
|---|---|
| **Creative Decision Plan** | *What video are we making?* |
| **Script Container Plan** | *What information must exist to write it?* |

Each container carries a **source and a resolution status**:

```
ITEM_1   source: verified research           status: RESOLVED
ITEM_2   source: affiliate product library   status: RESOLVED
ITEM_3   source: research                    status: UNRESOLVED
```

> ### **Do not write until every required container is RESOLVED.**

⚖️ This is type-checking for creativity — a ridiculous phrase that happens to
be exactly right. An unresolved container handed to a writer does not come back
empty; it comes back **invented**, phrased with the same confidence as the
resolved ones. That is how a tech reviewer ends up promoting three products
that do not exist.

`UNRESOLVED` is a stop, not a warning.

### Research runs only when a container demands it

```
Container requires:   3 current AI tools
Product Library has:  1 relevant entity
                      ────────────────────
RESEARCH_REQUIRED  =  2 items
```

Research is a **tool invoked to resolve a named gap**, never a step that runs
because the pipeline reached it. Automatic research costs latency, money, and —
the expensive one — hallucination surface, since a model handed unrequested
search results will find a way to use them.

---

## 19. Script output — more than spoken words

Every scene carries its provenance internally. The creator need not see it; the
system must have it.

```
Scene 1   Purpose: Hook
          Spoken:  "I stopped paying for three creator tools after building Twin."
          Source:  Reference hook mechanism + creator experience
          Performance: Direct, slightly amused
          Product: None yet

Scene 3   Purpose: Product connection
          Source:  VERIFIED Product DNA
          Product action: Show Twin if appropriate

Scene 5   Purpose: CTA
          Source:  User-confirmed CTA
```

⚖️ A scene whose `Source` is `AI INFERENCE` may not contain a product claim.
Provenance per scene is what makes that checkable instead of hoped-for.

⚖️ **Context should be selected, not dumped.** The writer receives the Creative
Decision Plan + *relevant* Creator DNA + *relevant* Product DNA + research
results + reference containers — not the entire raw database. A founder opinion
video does not need seventeen thumbnail-colour attributes in the writing prompt.

---

## 20. The Director Plan

Twin infers filming direction from **three** inputs and asks **no extra
questions**:

```
CREATOR DNA  +  REFERENCE MECHANICS  +  SCENE PURPOSE   →   DIRECTOR PLAN
```

### What Twin decides automatically, per scene

background style · creator position · sit/stand/walk · camera height · camera
distance · phone orientation · phone angle · framing · whether to look into the
lens · movement · gesture intensity · energy · pattern interrupt · whether the
next scene keeps the same setup

### What each input controls

**Creator DNA** — energy · formal vs casual · pacing · whether they suit
direct-to-camera · whether movement fits them · how dramatic direction should be
· visual simplicity · brand feel.

**Reference** — *only when genuinely observed:* sit vs stand structure ·
approximate framing changes · position changes · movement pattern · scene
progression · visual reset timing.

> ⚖️ If it was not actually observed, **do not pretend it came from the
> reference.** Twin may still recommend from scene purpose — but it must not
> attribute an invention to evidence. This is the same rule as the `unknown`
> evidence kind, applied to direction.

**Scene purpose** — and this is what gives every visual decision a reason:

| Purpose | Direction |
|---|---|
| Hook | Closer framing, strong eye contact, minimal distraction |
| Explanation | Medium framing, relaxed delivery |
| Re-hook | Angle or position change |
| Proof | Steady delivery, product visible if relevant |
| Payoff | Tighter framing, slower emphasis |
| CTA | Direct eye contact, clean frame |

### ⚖️ Background: achievable direction, never assumed inventory

Twin must **not** invent *"sit on the green leather chair beside the
bookshelf"* — unless the reference genuinely contains it and there is a reason
to adapt it. The existing system produced *"warm beige background with a neat
bookshelf and a yellow accent lamp"* for someone filming in a bedroom at night.

Instead, offer achievable direction plus its purpose:

- clean neutral wall · desk/workspace visible · minimal background · bright
  indoor · outdoor street · professional office feel · casual home feel ·
  product-friendly plain background

> *"Use a clean workspace background, because this is an authority explainer."*
> *"Use a casual home background, because the reference relies on relatability
> rather than expertise."*

Useful even when Twin has no idea what furniture the creator owns.

### ⚖️ Camera guidance in plain language, not cinematography

Not *"50mm equivalent, shallow depth of field, key light at 45°."*

> Put your phone at eye level.
> Keep it about an arm's length away.
> Frame from chest to just above your head.
> Look into the lens, not at yourself on screen.

> Move the phone slightly farther away.
> Turn your body about 20° instead of facing straight on.
> Keep your eyes on the lens for the final sentence.

Simple enough to act on.

### Lighting and depth — the same rule applied

> Face the brightest natural light available.
> Keep the background slightly out of focus, if your phone supports it.

⚖️ Both are phrased as **achievable direction conditioned on what the creator
has**, not as assumed inventory. *"Face the brightest natural light"* works in
any room at any hour; *"use a key light at 45°"* assumes equipment nobody asked
about. *"If your phone supports it"* is doing real work — portrait mode is not
universal, and an instruction the creator cannot follow reads as the product not
knowing them.

⚖️ **Preflight measures the room; the Director advises about it.** Do not
conflate them. `preflightSignals.ts` reports only what a browser can honestly
observe — orientation, whether a live audio track exists, its peak — and
explicitly refuses lighting, because lighting needs a subject region it cannot
segment. So a Director lighting *instruction* is legitimate; a Director claim
that the light **is** good is not, and must never be rendered as a green tick.

### Pattern interrupts — simple, creator-performed, no B-roll

tight → wider · seated → standing · straight-on → slight side angle · centre →
left/right of frame · still → small walk · calm → faster emphasis · pause before
reveal · hold product · change gesture · move closer · return to original setup

```
Pattern interrupt:  Scene 3
Why:                Mid-video attention reset before the strongest point
Do:                 Stand up and move one step to the side
Phone:              Same height, slightly farther away
Framing:            Medium shot
Editor:             Hard cut into this setup
```

### ⚖️ Group scenes into SETUPS — do not make the creator move seven times

```
Setup A   Scenes 1–3   Sit · straight-on · eye level · chest-up · clean background
Setup B   Scenes 4–5   Same place · stand · slight side angle · wider framing
Setup C   Scene 6      Return to original setup · tighter crop · direct CTA
```

Interrupt only when there is a reason to. This is what keeps recording fast, and
recording speed is the difference between a finished video and an abandoned one.

### Product DNA also controls filming instructions

| Product DNA says | Director may generate |
|---|---|
| Physical · available while filming: **yes** · image uploaded | *"Hold the product while delivering line 2"* |
| Physical · available while filming: **no** | **Never** generate a hold/show instruction |
| SaaS · can be shown: **no** | Talking-only script |
| SaaS · can be shown: **yes** | Product-display scenes |

⚖️ Because Twin knows it is a bottle, *"hold the bottle beside your face"* makes
sense — and *"demonstrate the software bottle"* becomes impossible. So Product
DNA affects **both words and production**.

---

## 21. The teleprompter

```
Scene 2 of 6        Setup A · stay where you are

Say                 "Most founders are paying for software they barely use."
Delivery            Direct and slightly sceptical
Camera              Eye level, chest-up, straight-on
Action              Small hand gesture on "barely use"
Pattern interrupt   None — keep this scene visually steady
```

On a setup change:

```
Setup change        Stand up. Move one step right.
                    Keep the same background.
                    Move phone slightly farther back.
                    Turn your body slightly toward camera.
                                                            Ready →
```

---

## 22. Downstream — and why the editor gets easier

```
SCRIPT → SCENE PLAN → RECORDING → ACTUAL FOOTAGE → EDIT PLAN → EDITOR → FINAL VIDEO
```

⚖️ The editor **does not** rediscover Product DNA or reinterpret the reference.
Those decisions were resolved upstream and frozen in the Creative Decision Plan.
Any layer that re-derives an upstream decision is a layer that can disagree with
it.

---

## 23. The Gallery becomes a reasoning surface

The Gallery scores on:

```
DNA match + goal match + audience match + format match
+ product compatibility + recreate feasibility
+ CONTAINER FILLABILITY + freshness
= Recommendation score
```

**Container fillability is the new one and the important one:** *can this
reference's empty slots actually be filled from what we hold about this
creator?* A reference whose containers cannot be filled is a reference that will
produce an empty script — which is exactly today's defect, detected before the
creator spends a remix on it.

```
97% Match — "3 products I stopped paying for"

✓ Matches your talking-head style
✓ Strong for your authority goal
✓ Relevant to your founder audience
✓ Your Product Library contains 8 suitable tools
✓ Can be recreated in one recording
✓ Structure matches your strongest-performing list format

Twin could make:  "3 AI tools I stopped paying for after building Twin"
Products ready: 3/3 · Research: ready · Est. recording: 35 sec      [Adapt this →]
```

The Gallery is then not recommending viral videos. It is reasoning about what
**the creator's version** would be, before they click.

---

## 24. When there is NO product — nothing breaks

A creator selecting *ideas/expertise* + *nothing commercial* simply has no
Product DNA. The plan becomes Creator DNA + User Intent + Reference DNA +
research.

*"3 products I regret buying"* → *"3 productivity habits I regret following."*

⚖️ Twin **adapts the container type** from products to ideas. It must never
force commerce where none exists.

---

## 24a. ⚖️ The canonical flow

Twin is not "DNA → script". It is **understand → qualify → decide → fill →
write → direct → execute → learn.** The middle stages are what stop a reviewer
confidently promoting three imaginary products.

```
SOCIAL HANDLE
      ↓
DNA EXTRACTION  ←── 5 ADAPTIVE QUESTIONS (Q1–Q3 during the scan)
      ↓
FINAL CREATOR PROFILE ──── PRODUCT LIBRARY (many entities, §8)
      ↓
PERSONALISED GALLERY (§23)
      ↓
REFERENCE SELECTED → REFERENCE ANALYSIS → REFERENCE DNA
      ↓
COMPATIBILITY / TRANSFER GATE (§16b)
      ↓
CREATIVE DECISION PLAN (§17)
      ↓
CONCEPT CANDIDATES → SELECTED CONCEPT (§17a)
      ↓
SCRIPT CONTAINER PLAN (§18a)
      ↓
PRODUCT / RESEARCH RESOLUTION   ← writing blocked until RESOLVED
      ↓
SCRIPT (§19)
      ↓
DIRECTOR PLAN (§20) → SCENE PLAN → TELEPROMPTER (§21)
      ↓
RECORDING → SCRIPT ↔ AUDIO ALIGNMENT
      ↓
REVIEW GATE (§22a)
      ↓
EDIT PLAN → RENDERER → FINISHED VIDEO
      ↓
PERFORMANCE → RECOMMENDATION LEARNING (§26b)
```

---

## 25. The data objects, and their one responsibility each

| Object | Answers |
|---|---|
| `CreatorDNA` | How do I communicate? |
| `UserIntentProfile` | What am I trying to accomplish now? |
| `ProductDNA[]` | What am I talking about, and what is actually true? |
| `ReferenceDNA` | What creative mechanism are we adapting? |
| `ResearchEvidence[]` | What external information fills missing factual containers? |
| `CreativeDecisionPlan` | What exactly are we making? |
| `ScriptContainerPlan` | What information goes where? |
| `Script` | What should the creator say and do? |
| `ScenePlan` | How should it be recorded? |
| `DirectorPlan` | How should it be filmed? |
| `EditPlan` | How should the footage be transformed? |
| `PerformanceResult` | What actually worked? → feeds Creator DNA learning |

**Their responsibilities must never blur.**

---

## 26. Two worked examples

### Ecommerce creator
Beauty creator · goal: sales + audience growth · audience: women interested in
skincare · own physical product: moisturizer · formats: talking + product-led.

Reference: *"The one thing nobody tells you about expensive foundation."*
Cosmetics, but not moisturizer. Twin still extracts:

```
HOOK       Hidden truth
STRUCTURE  Common belief → challenge → explanation → product solution → payoff
```

Product DNA says the moisturizer addresses X and Y →
*"The one thing nobody tells you about using more moisturizer…"* —
**provided the resulting claims are supported by `approvedClaims`.**

### SaaS founder
Founder · goal: leads + authority · audience: creators · product: Twin ·
format: talking-head.

Reference: *"3 things I stopped buying after becoming a personal trainer."*

```
CONTAINER  3 things
ANGLE      Personal experience
HOOK       Identity transformation
STRUCTURE  Thing 1 → Thing 2 → Thing 3 → Lesson
```

Creator DNA: direct, slightly contrarian, short sentences.
Product DNA: Twin solves scripting / editing / reference adaptation.

Concepts: *"3 tools I stopped paying for after building my own content system"* ·
*"3 things I stopped doing after building Twin"* · *"3 creator workflows I think
AI is about to kill."*

**Product DNA influenced the substance. Creator DNA influenced the voice.
Reference DNA influenced the structure.** That is the separation.

---

## 26a. ⚖️ Failure design — downgrade, never "try your best"

Every stage needs a defined failure, or the model supplies one: confident
nonsense. **A guessed answer and a refusal look identical in a script.**

| When | Twin does |
|---|---|
| Reference transcription fails | Refuse before spend. **Shipped** (§28 step 1) |
| Reference has no speech / too long | Refuse before spend, naming the measurement. **Shipped** |
| Reference is mostly visual | *"This reference relies mainly on visuals, which Twin hasn't analysed yet. I can adapt the spoken concept, or you can pick another."* |
| Product page cannot be read | Entity stays `Missing information`. Mentionable, **no claims generated** |
| Research cannot verify a claim | Container stays `UNRESOLVED`. Writing does not start |
| Product DNA conflicts with the request | Surface the conflict; the creator decides. Never silently prefer one |
| Container cannot be filled | Offer to change the concept — never invent the item |
| Recording missing | Keep the take, name the gap, allow retry without refilming |
| Render fails | Classified failure + a retry button **only where retry can work** ✅ built |

⚖️ The last one is the pattern for all of them: `failureExplain.ts` classifies
every failure code and offers retry only where the class says retry can
succeed. Telling someone to retry a failure that can never clear is the
specific cruelty this design prevents.

⚖️ And the offer must be **a real alternative**, not an apology. *"I can adapt
the spoken concept, or choose another reference"* leaves the creator with two
moves. *"Something went wrong"* leaves them with none.

---

## 26b. The performance loop — architected now, built later

The pipeline does not end at a finished video.

```
Final video → Published → Performance → Learning
```

Record per video: format · reference mechanics · topic · hook · goal ·
audience · product · concept type · length · the creative decisions · results.

⚖️ **Learning updates Gallery ranking, NOT raw Creator DNA** — at least not
first. One viral video must never rewrite the creator's identity into
*"contrarian hooks are best."* What the system may hold is:

```
Evidence: contrarian hooks outperformed baseline in 4 of the last 6
          comparable videos
```

That is already this repo's rule, enforced in code: `validateClaim` refuses a
correlation claim below n≥2, and the Dashboard prints *"across 3 videos — a
pattern, not a cause."* The performance loop extends a working guard rather
than inventing a new one.

---

## 27. ⚖️ THE STANDING RULE

> **Never add a question without a reader in the same PR.**

`scripts/ci/check_brief_consumers.mjs` fails the build when a key is wired
without updating `scripts/ci/brief_consumers.json`. That guard is **the
definition of done** for every wiring step below.

The registry declares unwired keys explicitly (`readBy: []` + `unwiredReason`)
rather than forbidding them, because a guard that demanded a reader for every
key could not land until every key had one — so it would land *last*, after the
next asked-and-discarded question had already shipped. And it verifies **both
directions**: a key declared unwired must have no reader. The moment someone
wires one, the file is wrong and the build says so. An exemption that quietly
stays true after it stops being true is how the original bug got in.

⚖️ **Extend this registry to every DNA field**, not just the nine brief keys. A
`ProductDNA` field that nothing reads is the same bug at a larger scale, and it
will be built in a hurry because Product DNA is the exciting layer.

---

## 28. Build order

Each step is shippable and leaves the product working.

| # | Step | Why here |
|---|---|---|
| **1** | ✅ **Reference `mode: 'pattern'` → hard stop before spend, every path** | If there is no substance, do not sell a script. **Shipped.** |
| **2** | ✅ **Wire `workKind` + `workKindOther` into the prompt** | Ends "a doctor and a hobbyist get the same script." **Shipped (#294).** |
| **2a** | 🔴 **Surface WHY a take failed to save** | The recorder's five failure paths all collapsed into one silent `failed`, so a creator whose upload never landed saw no edit button and concluded there was no editor. Nothing downstream can run until takes arrive. |
| **3** | 🔴 **Wire `goal`; stop preferring three other authorities over the creator's answer** | Same shape, same file. `generate-blueprint` currently takes goal from the voice profile, then `profiles.dna`, then the literal string `'turn attention into trust'` — three authorities, none of them the creator's answer. |
| **4** | 🔴 **Move Q1–Q3 into the scan; chunk the review screen** | Without this the answers keep coming back empty, and steps 2–3 wire up fields nobody filled in. |
| **4a** | 🔴 **Wire `alsoWantsToMake` into the Gallery + the CDP** | The last dead onboarding answer with an obvious home. Format preference shapes what is recommended and what production shape the script takes. |
| **5** | 🔴 **Product DNA as a LIBRARY: entity model (`type` × `relationship`), URL ingestion, restrictions — SaaS entity end to end** | The substance layer. One entity type proves the whole chain. `productEvidence` moves onto the entity instead of floating as a disconnected onboarding field. |
| **6** | 🔴 **Write `creative_transfer_plans`, and the Compatibility Gate that feeds it** | Table, contract and validator already exist. Give the container object its writer, and put TRANSFER/ADAPT/REJECT/NOT-OBSERVED in front of it. |
| **7** | 🔴 **Creative Decision Plan as a frozen contract, + concept candidates, + Script Container Plan with resolution status** | Depends on 2, 3, 5. Writing blocks until every required container is RESOLVED. |
| **8** | 🔴 **Director Plan + Edit Plan as formal contracts — setups, pattern interrupts, visual-energy density** | Depends on 7. Both must be stored objects, not UI behaviour. |
| **9** | 🔴 **Visual reference analysis** | The nine NOT OBSERVED rows. Largest, and the only step needing new infrastructure. |
| **10** | 🔴 **Gallery scoring incl. container fillability** | Depends on 5 and 6. |
| **11** | 🔴 **Remaining Product DNA subtypes; Product Library surface** | Physical → Service → Affiliate, in that order. |

### ⚖️ Why Product DNA is step 5 and not step 1

It is the exciting layer and the one that fixes the felt problem. It is still
fifth, because **it routes on `workKind`, and `workKind` is read by nothing
until step 2.** Building the router before its input exists means building a
switch with no signal, and then debugging the switch.

Steps 2–4 are hours each. Step 5 is weeks.

### ⚖️ Why step 4 precedes step 5

Steps 2 and 3 wire answers that are currently often *blank*, because they are
asked below the fold. Wiring a field nobody filled in produces no visible
change, and an invisible change is one that gets reverted by someone who thinks
it did nothing.

---

## 29. Prompt for the next session

> I'm continuing work on TwinAI. Read `docs/twinai-content-intelligence-system.md`
> — it is canonical — and `docs/twinai-session-build-plan-2026-08-09.md` for what
> the first real production run found.
>
> **The problem in one sentence.** TwinAI's script generator produces
> voice-accurate, content-empty scripts, because the creator answers nine
> onboarding questions, only four are read by anything, and three are never even
> displayed. The generator has the creator's VOICE and almost nothing else, so it
> writes their own opinions back to them in their own phrasing.
>
> **Verify these before writing code — do not trust the document:**
> 1. `creative_transfer_plans` has a table, a contract and a semantic validator,
>    and no writer
> 2. `PRODUCT_EVIDENCE_FORM` exists at `packages/shared/src/preScriptBrief.ts` and
>    no screen imports it
> 3. `workKind`, `workKindOther`, `goal`, `productEvidence`, `alsoWantsToMake`
>    all have `readBy: []` in `scripts/ci/brief_consumers.json`
> 4. `referenceEvidence.ts` reads transcripts and derived structure only, never
>    pixels
> 5. `generate-blueprint` refuses `mode: 'pattern'` above `spend_credits` (step 1,
>    already shipped — confirm it survived)
>
> **Then work §28 in order, starting at step 2.**
>
> Step 2 is: read `workKind` and `workKindOther` from `pre_script_brief` in
> `supabase/functions/generate-blueprint/index.ts`, put them in the prompt beside
> Audience and Goal, and **delete their `unwiredReason` from
> `scripts/ci/brief_consumers.json` in the same PR.** `check_brief_consumers.mjs`
> verifies both directions and will fail the build if you do one without the
> other. That guard is the definition of done.
>
> Step 3 is the same shape in the same file: `goal` currently loses to the voice
> profile, then `profiles.dna`, then a hardcoded string. The creator's own answer
> must win.
>
> **Do not skip ahead to Product DNA.** It is step 5 because it routes on
> `workKind`, which is read by nothing until step 2 lands.
>
> **The standing rule: never add a question without a reader in the same PR.**
> That rule is the entire reason these documents exist.
>
> **Ask before changing `verify-prod-gate.yml`.** It asserts that
> `EDITOR_V2_START_ENABLED` is absent from production, which became false on
> 05 Aug. Rewriting a security assertion is the owner's call, not yours.
>
> **Current state.** Migrations `0118` and `0119` are applied to production. The
> editor is on at all four gates and `edit_projects` is 0 — no edit has ever
> completed in production. PRs #297, #301, #304, #305 are merged; #307 carries
> step 1.
