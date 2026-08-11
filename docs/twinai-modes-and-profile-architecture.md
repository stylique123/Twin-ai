# TwinAI — creation modes and the persistent profile

One persistent profile layer. Three ways to start. The same intelligence stack
underneath all of them.

This document is the mental model the codebase has been missing. Everything in
`twinai-content-intelligence-system.md` is a component; this is how the
components connect, and — more usefully — **which of them already exist and are
not being used.**

---

## 0. The sentence

> Twin helps creators and businesses decide what short-form video to make,
> adapts proven formats to their identity and audience, and turns the idea into
> a ready-to-record script.

Externally: **From idea or reference to a video made for you.**

The old positioning — "remix any video" — describes one entry point out of
three, and "AI scripts in your voice" describes something a person can get from
a general assistant in one prompt. Neither is what the system is.

---

## 1. What is already built and unnamed

**Verify these before designing around them. They change the size of the work.**

### 1a. Idea Mode already exists as a code path

`V2Create.proceed()` tests `/^https?:\/\//i` on the input:

```ts
state: { reference_url: looksUrl ? t : '', reference_note: looksUrl ? '' : t, … }
```

A creator who types *"why founders waste money on AI tools"* already runs a
build today. It reaches `generate-blueprint` as `reference_note`, skips the
reference read, and produces a script.

So Idea Mode is **not a new mode**. It is an existing path with no UI, no angles
step, no format selection, and no acknowledgement that it happened. Building
Idea Mode means giving an existing seam a name, a screen, and intelligence —
not adding a branch.

### 1b. The transfer-intent question already exists, in the wrong shape

`fidelity: 'close' | 'balanced' | 'loose'` sits in Advanced Settings and rides
into `generate-blueprint` as a hard prompt rule.

It is a **scalar** standing in for a **categorical** question. "Close" cannot
distinguish *keep the topic* from *keep the format* — those are opposite
instructions at identical fidelity. That ambiguity is not cosmetic: it is why a
five-item enumerated reference produced a script that kept the tone and dropped
the count (§5d of the session build plan). Nothing ever said **the format is the
thing I am taking.**

The intent question is therefore not an addition. It is the correct replacement
for a field that has been answering the wrong question since it shipped.

### 1c. Product Mode is the UI for the entity model already specced

§28 step 5 and the derive-from-Q3 work already define `relationship` ×`type` on
independent axes. Product Mode is that model's front door, not new architecture.

### 1d. Gallery-as-entry-point is already in the plan

§5b task B already requires the Gallery to say *before a remix is spent* whether
a reference's containers can be filled for this creator. "Adapt this" opening
Reference Mode pre-filled is that requirement with a button on it.

---

## 2. The persistent profile

Built once, at onboarding. Never re-asked.

| Layer | Answers | Source |
|---|---|---|
| **Creator DNA** | How does this person communicate? | handle scan |
| **Creator Knowledge** | What do they already know, believe, and cover? | handle scan |
| **Audience / Goal / Identity** | Who for, what for, what are they? | onboarding questions |
| **Content Universe** | What appears in their content? | onboarding + scan |
| **Product Library** | What is factually true about each offer? | optional, per product |

**Creator DNA is style. Creator Knowledge is substance.** Keeping them separate
is what lets Twin say *"you made this argument two weeks ago, here is a
different angle"* — which is worth more than writing well, and is impossible if
the two are one blob.

**No handle is a supported state.** A new creator, a new business, a fresh brand
account: bootstrap from the questions alone, mark the profile thin, and let DNA
strengthen as they post. Requiring a scan excludes the people most likely to
need the product.

**A brand account is the same model.** Read "Creator DNA" as *content identity
DNA* and a team account fits without a parallel schema.

---

## 3. Three modes

```
                    CREATOR PROFILE
        DNA · Knowledge · Audience/Goal · Products
                          │
        ┌─────────────────┼─────────────────┐
    REFERENCE           IDEA             PRODUCT
   Reference DNA    format intel      Product DNA
        └─────────────────┼─────────────────┘
                          ▼
                 CREATIVE DECISION
                          ▼
                       SCRIPT
```

Downstream of the starting fact, **all three are identical**: decide → transfer
→ compose → script → shot list.

> **The failure mode to avoid, stated plainly.** If these become three prompt
> paths, every defect in §5a–§5d exists three times and each fix must be made
> three times. Three *entry screens* over one composer is cheap. Three
> *composers* is how a product becomes unmaintainable. Build the entry, not the
> engine.

### Mode 1 — Remix a Reference

Paste a URL → Twin reads it → **one question**:

> **What do you want Twin to take from this?**
> - Let Twin decide *(recommended)*
> - Keep the topic, make it mine
> - Keep the format, change the topic
> - Use this format for my product

Plus optional free text: *"Make this about AI tools for founders."*

This single field removes the guessing that currently produces
tone-without-mechanism. It replaces `fidelity`.

**"Let Twin decide" must be STORED AS A DECISION, not a null.** Record `auto`
AND what it resolved to. A default that writes nothing is indistinguishable from
an unanswered question — which is this project's defining bug, and the reason
`brief_consumers.json` exists.

### Mode 2 — Start from an Idea

Type the subject. Twin returns **3–5 angles ranked against DNA, audience, goal
and what they have already covered**, recommends one with a reason, then writes.

The angles step is the point. "Here is your script" is what a general assistant
gives. "Here are your angles, this one fits you because…" is planning, and
planning is the value.

**Structure still comes from reference intelligence** — Twin selects a known
format internally. Idea Mode does not abandon Reference DNA; it uses it
invisibly.

### Mode 3 — Promote a Product

Pick a product (or add one from a URL/image). Then: what should this video do —
introduce · sell · explain · review · compare · answer an objection · build
trust · UGC-style recommendation. Then: recommend a format, use a reference, or
describe an idea.

**UGC is a FORMAT inside this mode, not a fourth universe.** In Twin it means
*creator-performed product content* — holding it, testing it, recommending it —
not cinematic product B-roll. That framing is honest about what the product can
actually produce.

**Product DNA must not force itself into every script.** The Creative Decision
layer scores product relevance; low relevance leaves it inactive. A system that
always sells is a system nobody trusts to write anything else.

**And it must never invent use.** `personal_use: CONFIRMED | NOT_CONFIRMED`
gates "I've used this for three months". Unconfirmed use in a UGC script is
fiction wearing authenticity's clothes.

---

## 4. What every script must answer

1. **Who is speaking?** — Creator DNA + Knowledge
2. **To whom, and why?** — audience + goal + current intent
3. **About what, and what is actually TRUE?** — Content Universe + Product DNA +
   research
4. **In what structure?** — Reference DNA, or Twin's format intelligence

A script is the result of those four answers. When one is missing, the model
fills it with something plausible — which is the mechanism behind every
content-empty script this project has produced.

---

## 5. The moat, stated as an engineering requirement

Not "we use a better model" — models converge. The moat is the **creator graph**:
identity, knowledge, history, audience memory, products, references, formats,
performance, and the relationships between them.

The test is concrete: **if one prompt to a general assistant reproduces the
session, the feature is not defensible.** What survives that test is what
persists between sessions and what the system decides without being asked.

Which makes the retention loop the actual product:

```
what you make → how it performs → what the audience responds to
     → what Twin recommends next → better content → more data
```

**This loop cannot start until one video exists.** See §7.

---

## 6. Scope discipline

Twin is **creator-led short-form**. It may LEARN structure from anything, and it
should not attempt: cinematic filmmaking, choreography, documentary, multi-actor
production, heavy b-roll workflows, long-form editing.

This is not modesty. §5a's unfilmable renovation timelapse and §5c's
"be inside footage that does not exist" are both this boundary being crossed by
a system that had no boundary to cross.

---

## 7. Sequencing — and the honest risk

**The risk:** `edit_projects` is 0 and **no take has ever saved**. The moat
argument is correct, and the loop in §5 needs video 1 to exist. Three modes
widen the front door of a house whose back door has never opened.

So:

1. **Get one take saved.** Unchanged, above everything.
2. **The intent field, inside Reference Mode only.** Small, replaces `fidelity`,
   and it is the missing input the count/mechanism contract needs (§5d). Ship
   the question and its reader together.
3. **Mechanism extraction + count contract** (§5d), now that intent says whether
   the format is being transferred.
4. **Idea Mode UI** over the `reference_note` path that already runs, with the
   angles step.
5. **Product Mode** over the entity model (§28 step 5).
6. **The three-card Create screen**, once all three have something behind them.
   A card that opens a mode with no intelligence behind it is worse than no card.
7. **Gallery as a fourth entry point** — pre-filled Reference Mode.

Modes are how the product becomes legible. They are not how it becomes true.
Nothing here changes the fact that every gate this project has is a claim about
code, and none is yet a claim about a video.
