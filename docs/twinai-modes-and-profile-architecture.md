# TwinAI — creation modes, the persistent profile, and the Product Library

**Source of truth for how the parts connect.** One persistent intelligence layer.
Three creation modes. Product DNA is a reusable ASSET, not a mode.

> Twin already understands your content identity, knowledge, audience, products
> and goals, then helps you decide what video to make and builds it properly.

Externally: **From a reference, an idea, or a product — to a video made for you.**

---

## 0. What already exists (verify before building)

Writing this down was mostly an exercise in discovering how much is already
here, unnamed or unused.

### 0a. Idea Mode is already a live code path
`V2Create.proceed()` tests `/^https?:\/\//i`; anything that is not a URL is sent
as `reference_note`. A creator who types *"why founders waste money on AI tools"*
**already runs a build today** — no UI, no angles step, no acknowledgement that
the reference read was skipped. Idea Mode needs a face and a brain, not a branch.

### 0b. The transfer-intent question exists in the wrong shape
`fidelity: close | balanced | loose` is a **scalar** standing in for a
**categorical** question. Read the three rules in `generate-blueprint`:

- `close` — *"the same number and order of retention beats"*
- `balanced` — *"you may merge or reorder minor beats"*
- `loose` — reference as light inspiration only

Two consequences, both evidenced:

1. **The Hormozi run was `balanced`** — the setting that explicitly PERMITS
   dropping beats. The five-item count was not lost at random; the default gave
   permission to lose it. At `close` it would likely have survived.
2. **All three rules assume the topic is the creator's** (`close` says "swap in
   THIS creator's voice, **topic** and examples"). So *"keep their topic, make it
   sound like me"* **cannot be expressed at any setting.** The knob runs from
   "their structure" to "my structure" and never covers subject.

The intent question **replaces** `fidelity`. It is not an addition.

### 0c. `creative_transfer_plans` is the Adaptation Plan's missing table
The table, contract and semantic validator all exist and **nothing writes a
row** — verified repeatedly. §14's Adaptation Plan is that writer. This is not
new schema; it is a finished component that has never been connected.

### 0d. The Product Library cannot sit on `promotes`
`promotes` stores ONE value per creator (`own_product` / `affiliate` /
`sponsor` / `nothing_to_sell`) and is the strongest-wired brief key — it drives
the CTA rule today. **One value cannot hold a library.** The Product Library
therefore requires the entity model (§28 step 5) as a hard prerequisite, and it
retires the "one subtype per creator" shape for good.

### 0e. The creator's own opinion is never collected
POV comes from `vp.pov` — stances the SCAN inferred from old posts — and when
absent the prompt says *"Infer 1-2 stances this creator would plausibly hold."*
So Twin writes from **what you used to think**, or **what someone in your niche
probably thinks.** Worse: `V2Create` sends `reference_url` OR `reference_note`,
never both — so pasting a reference removes the only field where you could say
what you think about it.

**"Describe your version" is not a convenience field. It is the only place the
creator's current opinion can enter the system.**

---

## 1. The persistent intelligence

| Layer | Answers | Source |
|---|---|---|
| **Creator / Brand DNA** | How do I communicate? | handle scan |
| **Creator / Brand Knowledge** | What do I know, believe, and already cover? | handle scan |
| **Audience + level** | Who am I for, how sophisticated? | onboarding |
| **Goal (default)** | What is content for? | onboarding |
| **Identity** | What role does this account play? | onboarding |
| **Content Universe** | What appears in my content? | onboarding + scan |
| **Default CTA** | Where do I send people? | onboarding, free text |
| **Product Library** | What is TRUE about each offer? | separate, optional, many |

**DNA is style. Knowledge is substance.** Keeping them apart is what allows
*"you made this argument two weeks ago — here is a different angle."* Impossible
if they are one blob.

**Knowledge items carry provenance.** *Opinion · evidence: creator transcript ·
confidence: high.* Provenance is what separates a real opinion from a plausible
one, and it is the difference between grounded substance and confident invention.

**No handle is a supported state.** Bootstrap from the questions, mark the
profile thin, strengthen as they post. Requiring a scan excludes new creators —
the people most likely to need this.

**A brand account is the same model**, read as *content identity DNA*.

**Video-specific overrides beat profile defaults.** Profile goal = grow;
this video = answer an objection. The video wins. Audience controls terminology
and complexity; goal controls angle, product prominence, payoff and CTA.

---

## 2. The Product Library

A persistent, many-item asset — **not** a mode, and not a field on the creator.

```
Twin AI              OWN_PRODUCT
Consulting           OWN_SERVICE
Claude               AFFILIATE
Sponsored serum      SPONSORED
Samsung phone        REVIEW_SUBJECT
```

Each entity carries: name · brand · type · relationship · category · audience ·
problem · use cases · features · benefits · differentiators · price/offer ·
**approved claims** · **forbidden claims** · evidence · CTA · images ·
`personal_use` · can-it-appear-physically · provenance on load-bearing claims.

```
relationship: OWN_PRODUCT | OWN_SERVICE | AFFILIATE | SPONSORED
            | REVIEW_SUBJECT | THIRD_PARTY
type:         SAAS | PHYSICAL | SERVICE | DIGITAL
personal_use: CONFIRMED | NOT_CONFIRMED        (default NOT_CONFIRMED)
lifecycle:    PERSISTENT | TEMPORARY           (one job, not saved)
```

**Three ways an entity is created**, and none of them blocks anything:

1. **At onboarding**, only if Q4 makes it obviously relevant. Optional, skippable.
2. **From the Library**, any time.
3. **Inside Product/UGC Mode, on the spot** — paste a URL, product page, app
   link, screenshot or image; Twin drafts a lightweight entity, asks only the
   two things it cannot infer, then offers *"Save to your library?"*

**The lifecycle flag is what makes UGC work.** A UGC creator may work with
twenty brands. Onboarding must never ask about twenty products; a job creates a
TEMPORARY entity that vanishes unless saved. Without this flag the library
silently fills with one-off client products and becomes unusable.

**Two questions must be asked at add-time, not inferred:**
- *Your relationship to this product?* — controls every ownership word.
- *Have you personally used it?* — `personal_use`, and it gates the entire
  first-person register.

**Relationship decides what may be said.** This is the `approvedClaims` gap
(§5a.5) with a proper home:

| Relationship | May say | May never say |
|---|---|---|
| OWN_PRODUCT / OWN_SERVICE | "we built…" | outcomes without evidence |
| AFFILIATE | "you can check it out" | "I've used this for months" unless CONFIRMED |
| SPONSORED | discuss the product | personal results without evidence |
| REVIEW_SUBJECT | evaluate from researched fact + real creator evidence | ownership language |
| Client UGC, unused | explain, demonstrate, problem→solution | testimonial framing of any kind |

**Unconfirmed use in a UGC script is fiction wearing authenticity's clothes.**
That is the whole reason `personal_use` exists.

---

## 3. Three modes

```
              PERSISTENT INTELLIGENCE + PRODUCT LIBRARY
                              │
        ┌─────────────────────┼─────────────────────┐
    REFERENCE                IDEA              PRODUCT / UGC
   "I saw this."        "I have a thought."   "I have a product."
        │                     │                     │
  Reference DNA         format intel          Product DNA
        │                     │                     │
  ADAPTATION PLAN         ANGLE PLAN        PRODUCT CREATIVE PLAN
        └─────────────────────┼─────────────────────┘
                              ▼
                   VIDEO-SPECIFIC GOAL
                   SCRIPT STRUCTURE
                   CONTENT CONTAINERS
                   KNOWLEDGE RESOLUTION
                              ▼
                      COMPLETE SCRIPT
```

> **ONE PLAN ROW, NOT THREE SCHEMAS.** The three plans differ in *payload*, not
> in *kind*. Store one plan with a `mode` discriminator so the converge step
> reads a single shape. Three plan tables means three schemas that drift, and
> every §5a–§5d defect fixed three times. `creative_transfer_plans` already
> exists with a validator and no writer — extend it; do not add siblings.

### Mode 1 — Remix a Reference
Paste → analyse → **one question**:

> **What do you want Twin to take from this?**
> - Let Twin decide *(recommended)*
> - Keep the topic, make it mine
> - Keep the format, change the topic
> - Use this format for a product → *pick from Library, or add one here*

Then **Describe your version** (optional, but see §0e — it is the only opinion
channel, and it must be available even when a URL was pasted).

**"Let Twin decide" is stored as a DECISION** — `auto` plus what it resolved to.
Never a null. A default that writes nothing is indistinguishable from an
unanswered question, which is this project's defining bug wearing a friendly label.

Reference DNA extracts: topic · angle · hook mechanism · format · **item count**
· structure · sequence · escalation · re-hook · payoff · CTA mechanism ·
containers · pacing where measurable.

Then per dimension: **TRANSFER · ADAPT · REPLACE · REJECT · NOT_OBSERVED.**

**Show the plan before the script** — what is kept, what changes, the new
concept. That screen is how the creator finds out Twin understood the reference
*before* spending a remix on discovering it did not.

### Mode 2 — Start from an Idea
Subject in. Optional "anything to include". Optional goal override.

**Do not write immediately.** Produce **3–5 ANGLES that are different videos,
not different hooks**, ranked against DNA, Knowledge, audience, goal, Content
Universe and *what has already been covered*. Recommend one **with a reason**.
Then pick a format internally from Twin's format intelligence and write.

The angles step IS the value. "Here is your script" is what a general assistant
gives. Structure still comes from reference intelligence, used invisibly.

### Mode 3 — Create Product Content
**Not "Promote a Product"** — that name excludes reviews, education, client UGC,
sponsored work, affiliate content and comparisons. Product is mandatory here and
it is the starting point.

Pick from Library (preselect if only one) or add on the spot. Then:
*what should this video achieve?* — sell · introduce · explain · review ·
compare · answer an objection · build trust · generate leads · UGC recommendation.

Then *how do you want to start?* — **recommend a format** (Twin generates 3–5
concepts from Product DNA), **use a reference** (Reference DNA × Product DNA), or
**I have an idea**. The mode branches into the same two engines rather than
duplicating them.

**UGC is a STYLE of product content, not a fourth universe**: creator-led,
conversational, problem-first, believable, first-person **only when justified**.

### When Product DNA activates
- **Reference Mode** — optional; on explicit choice, on clear mention, or Twin
  *asks* when the reference needs a product.
- **Idea Mode** — optional; Twin may ask *"related to Twin AI — include it?"*
  with **no / mention naturally / make it central**.
- **Product Mode** — mandatory; it is the entry point.

**Product DNA must never force itself into a script.** The Creative Decision
layer scores relevance; low relevance leaves it inactive. A system that always
sells is not trusted to write anything else.

---

## 4. Knowledge resolution is mandatory

Before the final script, **every substantive container must resolve to a source**:

```
Item 1 → Creator Knowledge     Item 3 → Product DNA
Item 2 → Research              Item 4 → User instruction
```

Unresolved → research, use product fact, use Knowledge, reframe the angle, or
ask **one** targeted question. **Never ship `[Specific Product]` as finished
work.** This is the §5d container requirement, and it is what stops fabricated
experience, invented numbers and generic filler.

Priority differs per mode — this is what actually makes the modes different:

- **Reference:** reference structure → Knowledge → user instruction → Product (if active) → research
- **Idea:** user idea → Knowledge → goal/audience → format intel → research → Product (if active)
- **Product:** Product DNA → objective → DNA → audience → Knowledge → reference/idea → research

---

## 5. The Create screen, and who sees what first

> **What are you starting with?**
> **A video you like** — turn a Reel, TikTok or Short into a version built for you
> **An idea** — give Twin a thought and we'll find the strongest angle
> **A product** — UGC, reviews, explainers and product-led video for anything you
> sell, promote or review

Order by identity: a creator with no products sees Idea and Reference first;
an ecommerce brand or UGC creator sees Product Content first; a founder sees all
three. Same three cards, different emphasis.

---

## 6. The moat, as an engineering test

**If one prompt to a general assistant reproduces the session, the feature is not
defensible.** What survives is what PERSISTS between sessions and what the system
DECIDES without being asked. Writing a script is not the product; knowing which
script to make next is.

```
what you make → how it performs → what the audience responds to
     → what Twin recommends next → better content → more data
```

---

## 7. Sequencing, and the honest risk

`edit_projects` is 0 and **no take has ever saved.** The loop above cannot start
until video 1 exists. Modes widen the front door of a house whose back door has
never opened.

1. **Get one take saved.** Above everything.
2. **Transfer intent, replacing `fidelity`** — small, and it is the missing input
   that makes the count contract enforceable. Ship the question and its reader
   together. Include "describe your version" (§0e).
3. **Mechanism extraction + count contract** (§5d).
4. **The Adaptation Plan writes `creative_transfer_plans`** — connect the table
   that has been sitting finished and unused.
5. **Entity model + Product Library** (§28 step 5), with `lifecycle` and
   `personal_use`. Prerequisite for everything product-shaped.
6. **Idea Mode UI** over the path that already runs, with the angles step.
7. **Product/UGC Mode**, including add-on-the-spot.
8. **The three-card screen, last.** A card that opens a mode with nothing behind
   it is worse than no card.

Scope stays **creator-led short-form**. Twin may LEARN structure from anything;
it must not ask for cinematic production, multi-actor shoots or heavy b-roll.
§5a's renovation timelapse and §5c's "be inside footage that does not exist" are
both this boundary being crossed by a system that had no boundary to cross.

Modes make the product legible. They do not make it true.
