# Product Knowledge — a library and an intelligence layer

> Product Knowledge tells Twin what it knows about the things a creator owns,
> sells, promotes, reviews or is sponsored by — and the Creative Decision Plan
> decides which of it is relevant to *this* video.

This is the owner's specification, recorded so it survives the conversation it
arrived in, plus the sequencing and the constraints it has to respect.

---

## 0. The mental model this belongs to

```
Creator DNA          how this person communicates
Creator Knowledge    what we actually know about this person
Product Knowledge    what they own, sell, promote, review or are sponsored by
User Intent          what this content should accomplish now
Reference DNA        what creative mechanics can transfer
Research             what current external facts are required
        ↓
Creative Decision Plan → Script Containers → Script → Director → Edit Plan
```

Product Knowledge answers: **what commercial things can this creator truthfully
talk about, and what do we actually know about each one?**

---

## 1. The uniqueness constraint stays, and it is not a product-model claim

`product_entities_one_owned_per_voice` is a **correctness guard**, not a
statement that a creator may only ever sell one thing. Its own migration says
so: `Onboarding` re-runs its confirm step on remount, so without it a creator
navigating back and forward mints a duplicate owned entity on every pass — the
same class of defect as the V2Building replay that charged three times for one
video.

It is **partial** (`where relationship in ('OWN_PRODUCT','OWN_SERVICE')`), so
affiliates, sponsors and review-only entities are already unlimited and are
written with `voice_id = null` precisely so they can never collide with it.

**Keep this invariant. Do not mix it with pricing.**

## 2. Correctness ≠ commercial entitlement

Two different failures that must never share a message:

| | trigger | message |
|---|---|---|
| **Correctness** | duplicate mint, replay | *This product has already been added.* |
| **Commercial** | plan cap reached | *You've reached your Product Library limit.* |

The add path is:

```
identify relationship → check correctness → check entitlement → allow | upgrade
```

Entitlements are configuration, never hard-coded in Product Knowledge logic:

```
product_library_limit
product_refresh_frequency
product_research_enabled
product_sources_per_entity
```

Pricing numbers are the pricing team's; the architecture only has to not
prevent them changing.

---

## 3. `CommercialEntity`, not "product"

The thing can be a service, a course, a community. Two **separate** dimensions:

- **type** — what the thing is: `SAAS`, `PHYSICAL_PRODUCT`, `DIGITAL_PRODUCT`,
  `SERVICE`, `COURSE`, `COMMUNITY`, `MARKETPLACE`, `APP`, `OTHER`
- **relationship** — what the creator may say about their tie to it:
  `OWN_PRODUCT`, `OWN_SERVICE`, `AFFILIATE`, `SPONSOR`, `REVIEW_ONLY`

## 4. Relationship truth is separate from product truth

The load-bearing rule. Knowing *WHOOP is a wearable fitness tracker* proves
nothing about whether this creator owns one.

```
relationship       = AFFILIATE
ownership          = UNKNOWN
personal_use       = UNKNOWN
personal_purchase  = UNKNOWN
personal_experience = UNKNOWN
```

With `personal_use = CONFIRMED`, Twin may write *"I've been using WHOOP…"*.
Without it, Twin may write *"WHOOP offers…"* and may not fabricate experience.
This is the same traceability-vs-entitlement split the creator-state system
already enforces, applied to things instead of to opinions.

## 5. Evidence, per claim

Feature, benefit and claim have **different evidence requirements**:

```
Feature:  Automatic captions
Benefit:  Less manual caption editing
Claim:    "Produces videos 4× faster"
```

Every claim carries provenance, and they do not have equal authority:

```json
{ "claim": "Includes automatic captions",
  "source": "official_product_page", "confidence": 1.0, "verified": true }
{ "claim": "Helps creators produce videos faster",
  "source": "marketing_copy", "confidence": 0.7, "verified": false }
```

Authority order for the creator's own entity:

```
USER CONFIRMED  →  AUTHORITATIVE SOURCE  →  VERIFIED RESEARCH  →  INFERENCE
```

Research does not overwrite the creator's own pricing or features. Research
answers *"which competing tools are trending"*, not *"what does your product
cost"*.

## 6. Restrictions are a union, not one global field

```
approved_claims  forbidden_claims  unverified_claims
restricted_phrasing  required_disclosures
```

A script receives the union of creator-level and entity-level restrictions:
*never promise guaranteed results* (creator) + *do not say "clinically proven"*
(product) + *do not imply ownership* (affiliate) + *disclosure required*
(sponsor).

## 7. Images inform recordability, never claims

A product image may establish that a thing is handheld, wearable, or
demonstrable on camera — so the Director can say *"hold the bottle beside your
face"*. It may **not** establish *"this fragrance lasts twelve hours"*.
**Visual observation is not product evidence.**

## 8. Freshness

Every field carries `last_verified_at`. Pricing and offers age faster than name
and category. `Refresh product` re-crawls and **shows what changed** — price
changed, feature removed, CTA changed — rather than silently rewriting
user-confirmed truth.

## 9. Product truth ≠ performance learning

*Twin adapts references* is product truth. *Founder-story videos about Twin
outperform feature videos* is a content observation. **Never mix them.**

---

## 10. Where it enters generation

- **Gallery** — reference recommendations weigh *relevant Product Knowledge*
  ("8 entities match this 3-item list format"), not just niche.
- **Reference transfer** — the reference supplies mechanics only. *"3 skincare
  products I regret buying"* transfers as *3-item negative list, confession
  framing, strongest last*. Whether the creator can support *"I regret buying"*
  is a Product/creator-state question, not a reference one.
- **Creative Decision Plan** — names the product context, the secondary
  context, the facts allowed and the claims forbidden. This is where Product
  Knowledge becomes part of the video's creative contract.
- **Script Containers** — Product Knowledge fills *specific slots* and is never
  dumped into the whole writer prompt.
- **Creator-state enforcement** — *"My WHOOP tracks recovery"* with
  `personal_ownership = UNKNOWN` is not grounded; the safe rewrite is *"WHOOP
  tracks recovery"*. Product Knowledge is **safety infrastructure**, not
  marketing context.
- **Director** — `available_during_filming` and `display_preference` are
  production constraints. If a product cannot be on camera, no scene may
  require it.

---

## 11. Sequencing

Each phase must ship a **reader with every field** — the standing rule. A phase
that adds columns nobody reads is how `lastObservedAt` sat unread for months.

| Phase | What | Why first |
|---|---|---|
| **1** | Archive vs delete; entitlement seam separate from correctness | Corrects a hard delete already shipped; both have immediate readers |
| **2** | `CommercialEntity` type widening + per-entity restrictions union reaching the prompt | The prompt already reads restrictions — widening has a reader on day one |
| **3** | Ingestion: paste a link → extract → confirm | The add path is the bottleneck on the table ever filling |
| **4** | Claim-level provenance + authority ordering | Depends on 3 producing claims to grade |
| **5** | Container-level retrieval + Creative Decision Plan wiring | Depends on there being knowledge worth selecting |
| **6** | Freshness, refresh diffs, gallery matching, Director constraints | Depends on 2–5 |

### Phase 1 is a correction

`deleteProductEntity` (#354) is a hard delete, argued on the grounds that a
`retired` flag would have no reader and a retired row the generator did not
filter would keep granting withdrawn permissions. That argument was right about
the danger and wrong about the conclusion: the spec supplies the missing reader
— **archived entities are excluded from new recommendations while historical
scripts keep their provenance.** With a reader, archive beats delete.
