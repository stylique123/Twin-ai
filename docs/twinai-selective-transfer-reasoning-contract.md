# TwinAI Selective Transfer Reasoning Contract

**Status:** required product and engineering contract  
**Repository evidence audited:** `stylique123/Twin-ai`, Phase 7 backup-6, exact SHA `23c55d28d3a04bd604bbe5bfe708c4fc2624c530`  
**Purpose:** define how TwinAI decides which traits from reference creators transfer, which are adapted, and which are rejected before it writes or edits anything  
**Relationship to the editor:** this contract sits between extraction and script generation. Its immutable output is later pinned into the one-click editor input manifest. It does not create another editor, Director call, or renderer.

---

## 1. Executive finding

TwinAI's primary problem is no longer a lack of extracted information. It is the absence of a durable selective-transfer decision.

Today, TwinAI has:

- self-reported creator DNA;
- a richer synthesized voice profile;
- brand-kit data;
- full reference transcripts with words, segments, and coarse narrative structure;
- platform, goal, offer, audience, tone, pacing, hook, and editing-style fields;
- a blueprint generator that attempts to adapt one reference into the creator's voice.

But the current system flattens brand facts and reference traits into one large prompt and asks the same model call to both decide what matters and write the final blueprint. The intermediate reasoning is not:

- typed;
- persisted;
- source-attributed;
- confidence-scored;
- reviewable;
- independently validated;
- reusable by the editor;
- safe for multiple references.

Therefore the user's hypothesis is correct: the missing layer is not “extract more.” It is:

> Given this business, audience, goal, product, platform, brand, and set of reference creators, decide explicitly which traits transfer, which must be adapted, and which must be ignored.

That decision must become a canonical input, not hidden prompt reasoning.

---

## 2. What “DNA” actually contains today

TwinAI currently has two materially different objects that are both treated as creator or brand DNA.

### 2.1 Self-reported Creator DNA

The shared `CreatorDNA` contract contains:

```ts
interface CreatorDNA {
  niche: string
  audience: string
  product: string
  goal: string
  voice: string
  platforms: string[]
  editing_style: string
  voice_samples?: string[]
}
```

This is a useful onboarding profile, but it is not a complete creative operating system.

### 2.2 Synthesized Voice Profile

The runtime DNA synthesis produces a richer profile containing:

- summary;
- niche and sub-niche;
- audience and audience pain;
- dream outcome;
- offer;
- tone and pacing;
- hook style and hook patterns;
- editing style;
- formats;
- title and thumbnail style;
- points of view;
- enemy or rejected conventional wisdom;
- vocabulary;
- recurring CTAs;
- dos and don'ts;
- sample hooks;
- synthesized brand colors.

Brand-kit records separately contain visual identity such as colors, logo, and caption preferences.

### 2.3 Current contract defect

The runtime JSON is richer than the shared `VoiceProfile` TypeScript interface. Runtime generation and shared contracts disagree about fields including `editing_style`, `goal`, and brand colors.

This must be fixed before selective transfer becomes authoritative:

1. define one versioned `BrandTruthSnapshot`;
2. project all live profile, DNA, and brand-kit data into it once;
3. validate it against a strict schema;
4. hash and persist it;
5. never reread mutable live DNA during the same generation or edit.

Free-text profile fields may inform bounded choices. They may not directly become renderer commands, factual claims, or unbounded provider instructions.

---

## 3. How reference videos are represented today

Reference processing stores more than a transcript:

- full transcript text;
- word timings;
- segments;
- duration;
- language;
- platform;
- source URL;
- a coarse `ReferenceStructure`.

The current reference structure contains:

```ts
interface ReferenceStructure {
  format_label: string
  hook_window_sec: number
  why_it_works: string[]
  beats: Array<{
    at_sec: number
    beat: string
    goal: string
  }>
  cta: string
  words_per_min: number
}
```

This is enough to reason about hook window, narrative beats, CTA, and approximate pacing. It is not yet a complete representation of visual/editing style.

Missing or insufficiently explicit evidence includes:

- shot-by-shot visual semantics;
- camera distance and movement;
- subject framing;
- caption layout, cadence, and emphasis;
- transition types and locations;
- B-roll function;
- zoom frequency and intensity;
- music energy and beat alignment;
- silence and visual-waste treatment;
- confidence and provenance per inferred trait;
- distinction between observed evidence and model inference.

Extraction should be extended only where a downstream decision needs evidence. It should not become an unlimited “analyze everything” project.

---

## 4. What “replicate” means

The word `replicate` must not remain a single overloaded product instruction.

TwinAI supports four different transfer layers:

| Layer | Examples | Default policy |
|---|---|---|
| Presentation mechanics | cuts, captions, zoom rhythm, transitions, B-roll cadence | may transfer or adapt |
| Storytelling mechanics | hook formula, tension, reveal, re-hook, payoff, CTA mechanism | may transfer or adapt |
| Content strategy | topic family, series format, audience promise, posting cadence | adapt only when explicitly requested |
| Business truth | product, claims, offer, pricing, funnel, target customer | never copy from references |

The intended default output is:

> Use applicable storytelling and presentation mechanics from the references to communicate the user's own product, audience promise, and brand truth.

It is not:

> Make the user impersonate the reference creator or copy that creator's product, factual claims, identity, voice, likeness, jokes, or exact expression.

For a perfume brand referencing MrBeast, TwinAI should use selected mechanics such as an immediate stakes-driven hook, escalation, visual proof, or payoff timing only when they fit the perfume goal. It must not turn the brand into MrBeast, invent giveaways, copy claims, or inherit his audience and business model.

The UI should replace “How close to the reference?” with explicit scope:

- What should Twin learn from this reference?
- Story structure
- Hook mechanics
- Pacing
- Visual style
- Caption style
- CTA mechanics

The default should be `Auto-select safely`, backed by the contract below. Advanced users may override dimensions, but not brand truth or safety rules.

---

## 5. Authority hierarchy

Every transfer decision follows this priority order:

1. **Verified business truth:** product, offer, approved claims, price, audience, legal restrictions.
2. **User intent:** campaign goal, platform, desired outcome, selected content mode.
3. **Pinned brand truth:** voice, tone, vocabulary, visual identity, dos, don'ts.
4. **Source recording reality:** what was actually spoken, shown, and captured.
5. **Reference evidence:** observed creative mechanics that may inspire the output.
6. **Model inference:** allowed only when labeled, confidence-bounded, and non-factual.

A lower level can never overwrite a higher one.

References are evidence, not authority. No reference may change the user's product, claims, offer, audience, or brand rules.

---

## 6. Canonical `CreativeTransferPlanV1`

Create one immutable transfer plan before blueprint or script generation.

```ts
type TransferAction = 'transfer' | 'adapt' | 'reject' | 'brand_default'

type TransferDimension =
  | 'hook_mechanic'
  | 'story_structure'
  | 'pacing'
  | 're_hook'
  | 'payoff'
  | 'cta_mechanic'
  | 'visual_language'
  | 'shot_rhythm'
  | 'b_roll_function'
  | 'caption_style'
  | 'zoom_style'
  | 'transition_style'
  | 'music_energy'
  | 'topic_strategy'
  | 'series_strategy'

interface CreativeTransferDecisionV1 {
  dimension: TransferDimension
  action: TransferAction
  primaryReferenceId: UUID | null
  secondaryReferenceId: UUID | null
  evidenceIds: string[]
  observedTraits: string[]
  adaptedInstruction: string
  confidence: number // 0..1
  rationaleCode:
    | 'brand_fit'
    | 'goal_fit'
    | 'platform_fit'
    | 'audience_fit'
    | 'conflict'
    | 'insufficient_evidence'
    | 'unsafe_or_unlicensed'
    | 'user_override'
  constraints: string[]
}

interface CreativeTransferPlanV1 {
  schemaVersion: 1
  generationId: UUID
  brandTruthSnapshotId: UUID
  brandTruthSha256: Hex64
  campaignIntentId: UUID
  campaignIntentSha256: Hex64
  referenceSet: Array<{
    referenceId: UUID
    analysisId: UUID
    analysisSha256: Hex64
    requestedDimensions: TransferDimension[]
  }>
  decisions: CreativeTransferDecisionV1[]
  conflicts: Array<{
    dimension: TransferDimension
    referenceIds: UUID[]
    resolution: 'selected_primary' | 'brand_default' | 'rejected_all'
    reasonCode: string
  }>
  prohibitedTransfers: Array<
    | 'product'
    | 'offer'
    | 'factual_claims'
    | 'pricing'
    | 'audience_identity'
    | 'creator_identity'
    | 'voice_or_likeness'
    | 'copyrighted_expression'
  >
  modelIdentity: string
  promptVersion: string
  createdAt: ISODate
  planSha256: Hex64
}
```

### Required invariants

- Exactly one decision exists for every supported dimension.
- A dimension has at most one primary reference.
- A secondary reference may only supplement a non-conflicting sub-trait.
- References are never averaged or concatenated by default.
- Every `transfer` or `adapt` decision cites server-issued evidence IDs.
- `confidence` below the predefined threshold becomes `brand_default` or `reject`.
- Factual/business fields cannot appear in `adaptedInstruction`.
- The model cannot create reference IDs, evidence IDs, dimensions, or actions.
- The server semantically validates the returned plan before persistence.
- The plan is append-only and hash-pinned into all downstream generation and editing inputs.
- A changed brand, campaign goal, or reference set creates a new plan; it never mutates the old one.

---

## 7. The decision algorithm

The transfer planner performs one bounded decision pass.

### Step 1: Freeze truth

Project live business, brand, campaign, platform, and product data into immutable snapshots. Reject missing required business truth instead of inventing it.

### Step 2: Normalize evidence

Convert every reference analysis into the same bounded evidence vocabulary. Separate:

- observed facts;
- measured values;
- model interpretations;
- unknowns.

### Step 3: Filter prohibited transfer

Remove product facts, claims, offers, prices, audience identity, creator identity, exact jokes, exact phrasing, voice imitation, likeness, and unlicensed assets from the candidate pool.

### Step 4: Score per dimension

For each transfer dimension, score candidates against:

- brand fit;
- goal fit;
- audience fit;
- platform fit;
- evidence confidence;
- production feasibility;
- conflict with other selected dimensions.

Use predefined weights and thresholds. Never tune them after seeing a desired result without a version bump and new evaluation.

### Step 5: Select, adapt, or reject

Choose one primary source per dimension. A reference may lead one dimension and be rejected for another.

### Step 6: Resolve conflicts

If luxury visuals conflict with chaotic comedy pacing, the higher brand/goal fit wins. Do not blend both merely because both references were selected.

### Step 7: Persist the plan

Store the validated, immutable plan and its SHA before script writing.

### Step 8: Generate from the plan

The blueprint/script generator receives:

- one Brand Truth Snapshot;
- one Campaign Intent;
- one Creative Transfer Plan;
- only the evidence referenced by the plan.

It must not receive a flat dump of every live profile and every raw reference as an alternative authority.

---

## 8. Multi-reference perfume example

Input:

- business: luxury perfume brand;
- audience: style-conscious buyers;
- goal: product discovery and purchase intent;
- platform: Instagram Reels;
- reference A: luxury perfume reviewer;
- reference B: comedy-sketch creator;
- reference C: lifestyle-aesthetic creator.

Expected transfer plan:

| Dimension | Decision |
|---|---|
| Product facts and claims | brand truth only; all reference content rejected |
| Hook mechanic | adapt A's sensory/authority hook if supported |
| Story structure | use A's problem-to-scent-payoff structure |
| Humor | reject B when it conflicts with the luxury tone; otherwise adapt only one bounded comedic beat |
| Visual language | transfer C's lifestyle composition and lighting rhythm |
| Shot rhythm | adapt C as primary; A may be secondary for product close-ups |
| Captions | brand-default luxury preset, informed by measured readability rather than creator identity |
| CTA | adapt the mechanism to the perfume offer; never copy the reference's offer |
| Audience | perfume brand audience only |
| Business strategy | rejected unless separately and explicitly requested |

User-facing explanation:

> Twin used Creator A for the hook and product-story structure, Creator C for visual rhythm, and did not use Creator B because the comedy style conflicts with the selected luxury positioning.

This explanation is derived from the persisted plan, not generated afterward.

---

## 9. Relationship to the one-click editor

There are two distinct reasoning responsibilities. They must not be conflated.

### 9.1 Creative transfer planner

Runs before blueprint/script generation. It decides which reference mechanics shape the content.

### 9.2 Editor Director

Runs after recording/upload and analysis. It decides how to safely edit the actual captured source within the already-pinned creative intent.

The Editor Director may consume a bounded projection of the transfer plan for:

- pacing profile;
- caption preset;
- zoom restraint;
- transition policy;
- music mood/energy;
- hook treatment.

It may not:

- revisit business truth;
- choose a different reference;
- copy a reference's topic or claims;
- reinterpret “replicate”;
- make a second creative-transfer decision;
- trigger a second generative call to fill missing intent.

The one-click editor Boot Manifest must pin:

- script snapshot SHA;
- Brand Truth Snapshot SHA;
- Campaign Intent SHA;
- Creative Transfer Plan SHA;
- Capture Manifest SHA;
- analysis bundle versions;
- feature manifest SHA.

This keeps scripting, teleprompter recording, editing, result, library, review, and publishing inside one coherent lineage.

---

## 10. What is wrong in the current implementation

### 10.1 Blueprint generation combines deciding and writing

One provider call currently receives a flattened creator-DNA block and one reference block, then writes concept, packaging, hooks, script, shot list, captions, edit checklist, and publish plan.

The transfer choice is implicit prompt reasoning and disappears after the response.

### 10.2 Thin data is encouraged to become confident inference

The DNA synthesis prompt favors specific plausible inference over blanks. That may help onboarding UX, but it is unsafe when inferred audience, offer, enemy, or style is later treated as truth.

Required correction:

- persist provenance per field;
- mark `observed`, `user_asserted`, `derived`, or `inferred`;
- attach confidence;
- never allow inferred business facts or claims to become authoritative.

### 10.3 Multi-reference selection is not modeled

The current creation screen accepts one reference URL or one idea plus general fidelity/tone knobs. It has no reference set, per-dimension assignment, or conflict resolution contract.

### 10.4 The current Editor Director is not this reasoning layer

The current Phase 7 Editor Director is principally a removal selector for the recorded source. Its envelope currently has empty summaries and does not receive the complete bounded brand/creative-transfer context.

That infrastructure is useful, but it cannot be represented as proof that selective creative transfer exists.

---

## 11. Implementation order

This work must not derail the current Phase 7 safety/editing foundation. Implement it as a single canonical upstream contract with clear integration points.

### Batch A: contract and truth normalization

1. Define `BrandTruthSnapshotV1`.
2. Reconcile shared/runtime DNA field drift.
3. Add provenance and confidence to synthesized fields.
4. Define `CampaignIntentV1`.
5. Define reference evidence IDs and normalized evidence taxonomy.
6. Define `CreativeTransferPlanV1` and semantic validator.
7. Add migrations, RLS, append-only guards, and owner/service-role access tests.

### Batch B: planner

1. Build one bounded planner call.
2. Return only enums, reference IDs, evidence IDs, actions, confidence, and bounded instructions.
3. Add deterministic server-side conflict and prohibited-transfer validation.
4. Persist one immutable plan.
5. Add cancellation, idempotency, fencing, timeout, stable errors, and no-blind-retry behavior.

### Batch C: blueprint integration

1. Make the blueprint generator require a validated transfer plan.
2. Remove raw flat reference blending as an authority.
3. Load only cited evidence.
4. Pin all input SHAs into blueprint provenance.
5. Prove duplicate generation converges on one plan and one blueprint.

### Batch D: editor integration

1. Project only presentation-relevant transfer decisions into the editor Boot Manifest.
2. Complete the Editor Director envelope with real bounded summaries.
3. Make Decision v2 cite the pinned creative-intent SHA.
4. Make the compiler independently reject decisions outside the transfer plan or feature manifest.
5. Keep the renderer mechanical.

### Batch E: product UX

1. Replace overloaded “replicate” with dimension-aware language.
2. Support multiple references as a reference set.
3. Default to safe automatic assignment.
4. Show a concise “what Twin learned from each reference” summary.
5. Allow bounded user overrides that create a new immutable plan version.

---

## 12. Acceptance scenarios

The feature does not pass until all of these are tested on one exact head.

| Scenario | Required outcome |
|---|---|
| One compatible reference | applicable mechanics selected; brand truth preserved |
| Three complementary references | one primary reference per dimension; no flat blend |
| Three conflicting references | conflicts recorded and deterministically resolved |
| Reference has another product | product, claims, price, and CTA offer never transfer |
| Reference is outside the niche | mechanics may adapt; topic/audience defaults to brand |
| Reference evidence is weak | dimension becomes brand default or rejected |
| DNA field is inferred | inference is labeled and cannot become factual authority |
| User changes goal | new transfer plan and SHA; old generation remains immutable |
| User changes one reference | new plan; unchanged references keep identity/provenance |
| Duplicate click | one logical plan and generation |
| Provider timeout | stable failure, no partial plan, no blind paid retry |
| Provider fabricates an ID | semantic validation fails closed |
| Prompt injection in transcript | treated as untrusted content, never as instructions |
| Exact phrasing copied | similarity/copyright guard blocks or requires rewrite |
| Editor runs later | uses pinned transfer projection; does not reinterpret references |
| Brand changes after recording | current project remains bound to its pinned snapshot |
| No reference supplied | complete brand-default plan; no invented creator source |

---

## 13. Premortem and stop rules

| Likely failure | Prevention | Stop rule |
|---|---|---|
| All references blended into incoherent output | one primary reference per dimension | any unassigned flat blending blocks merge |
| Reference overwrites brand/product truth | immutable authority hierarchy + prohibited fields | any transferred claim/offer blocks rollout |
| Model invents why a trait was chosen | evidence IDs + confidence | uncited transfer decision is invalid |
| Planner and writer disagree | writer consumes only validated plan | raw reference bypass blocks merge |
| Editor silently reinterprets style | pin plan SHA; compiler revalidates | any second creative interpretation blocks phase |
| Contract drift across web/edge/worker | one shared versioned contract + parity test | mismatched schema/version blocks CI |
| More model calls creep in | one planner ledger and one editor Director ledger | unexpected paid call count blocks completion |
| “Close” becomes impersonation | dimension scope + identity/expression prohibitions | identity/likeness imitation blocks output |
| Thin DNA becomes false truth | provenance labels and business-fact restrictions | inferred business fact blocks plan |
| New layer becomes a second editor | transfer plan is input, not executable media plan | any rendering command in transfer plan is invalid |

---

## 14. Definition of done

Selective transfer is complete only when:

- the actual DNA and brand contracts are reconciled and versioned;
- every reference trait has evidence and provenance;
- one immutable transfer plan exists before script generation;
- each supported dimension is explicitly transferred, adapted, rejected, or defaulted;
- multi-reference conflicts are deterministically resolved;
- prohibited business/identity transfer is independently enforced;
- the blueprint writer cannot bypass the plan;
- the editor pins and obeys the plan without re-deciding it;
- same-head unit, integration, security, adversarial, and end-to-end tests pass;
- a real perfume/multi-creator fixture produces the expected selective assignment;
- a human evaluation shows the output fits the brand better than the current flat-prompt baseline;
- no second editor, plan, renderer, or hidden creative loop was introduced.

---

## 15. Worker handoff instruction

Use this verbatim after the currently audited Phase 7 foundation is safely anchored:

> Implement the Selective Transfer Reasoning Contract in `outputs/twinai-selective-transfer-reasoning-contract.md` as one upstream, immutable decision layer. Do not redesign it, flatten all references into a prompt, or merge transfer reasoning into the Editor Director. First audit and reconcile the actual DNA/runtime/shared schemas. Freeze Brand Truth, Campaign Intent, normalized reference evidence, and `CreativeTransferPlanV1` contracts with migrations and semantic validators. Then implement one bounded planner call, persist one append-only plan, and make blueprint generation consume only that plan plus cited evidence. Pin its SHA into the editor Boot Manifest so the later Director and compiler obey it without a second interpretation. Preserve the authority hierarchy, prohibited-transfer rules, one-primary-reference-per-dimension rule, idempotency, fencing, cancellation, no-blind-retry, and same-head evidence requirements. Before the first candidate push, run local contract, migration, security, adversarial, multi-reference, duplicate-click, and full regression checks. Push one stable candidate only. Report exact SHA, real versus simulated behavior, call counts, zero-delta boundaries, and every remaining gap. Stop if a business fact can be inferred as truth, a reference can bypass the plan, or any downstream stage needs another creative-transfer call.

