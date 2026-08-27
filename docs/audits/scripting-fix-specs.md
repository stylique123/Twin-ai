# TwinAI Scripting — End-to-End Fix Specs

_Source: uploaded PDF, committed verbatim (text-extracted). One spec per issue found in the Deep Audit + Voice/Creativity audits — these are the numbered "FIX N" items referenced by the build-loop routine._

---

TwinAI Scripting — End-to-End Fix Specs
One spec per issue found in the two audits. Each spec: root cause → data model →
prompt/code changes → UI → checks & tests → metric that proves it worked. Written
to match the repo’s own engineering rules: every writer ships with its reader in the
same PR, decidable checks beat prompt rules, all counters land somewhere durable,
repairs happen after the rescue point (never cost the creator their script), three-state
discipline everywhere.
FIX 1 — Placeholder beats → Micro-Interview Beats
(Issue: “Only you can supply this. What would you actually say here?” shipped as the
spoken line in 3 of 6 scenes.)
Root cause. The writer’s substance: needs_user state is correct (it refuses to fabricate
personal history), but there is no product path for it. The UI renders the refusal verbatim as
script text. The rule “write the beat around what you DO know” collapses when the whole
video is personal.
Design principle. A needs_user beat is not a failed line — it is a captured question.
Convert it into a one-tap interview whose answer (a) completes this script live and (b)
becomes permanent creator_knowledge with source: 'asked' (already a supported
source, already in SPOKEN_SOURCES).
Data model.
Extend the blueprint schema per beat: when substance === 'needs_user', require two
new fields from the writer:
ask — the single, specific question whose answer would complete this line (“What
was the moment you almost deleted your first post?”). Bounded ≤160 chars. Never
generic (“tell me about yourself” is malformed).
line_scaffold — the line written with one {answer} slot, so the completed line
needs no second model call in the common case (“It starts small. {answer}. And that
panic is the whole trap.”).
Migration 01XX_beat_asks: no new table. The ask lives inside the persisted blueprint
JSON (the row already survives); the answer writes to creator_knowledge via the

existing asked-question path (0128’s unique index on (owner, question) gives never-ask-
twice for free — key the ask by a normalized hash of the question text).
Three states per ask, stored in the blueprint: unanswered (default) / answered (carries
the knowledge row id) / skipped. A skip is stored as firmly as an answer (the 0128 rule).
Skipped 㱺 the beat renders the scaffold with the slot removed and the beat demoted to
general phrasing, or the beat is dropped if it carries the enumeration count (see Fix 10
for why CTA/payoff beats can never reach this state).
Prompt changes (SYSTEM in generate-blueprint/index.ts).
Replace the current needs_user instruction with: “needs_user = only the creator can
supply this. You MUST then emit ask (the one question that unlocks the line) and
line_scaffold (the full spoken line with exactly one {answer} slot). The ask names a
specific moment, number, or object — never a category. A beat whose ask could be sent
to any creator in this niche is malformed.”
Add to FINAL CHECK: “Count needs_user beats. More than 2 in one script means the
premise outruns this creator’s supplied material — re-anchor the premise on what IS
supplied before finishing.” (This is an input-shaping instruction — the kind that
measured effective — not a quality exhortation.)
Server (edge).
Post-parse validation (after the rescue point, repair-not-reject): a needs_user beat
missing ask/line_scaffold gets a deterministic downgrade to general with the
personal clause stripped — never a placeholder string into line.
New endpoint answer-beat-ask (or extend review): takes (generation_id, beat_index,
answer ≤240 chars — refuse-not-truncate, same rule as G26). Writes: (1) the completed
line into the stored blueprint (line_scaffold slot-fill, no model call), (2) a
creator_knowledge row {basis:'stated', source:'asked', source_ref:
generation_id}, (3) hook_choice-style provenance is not needed — the answer is
creator-typed by construction.
Optional polish call (feature-flagged, fail-open to the raw slot-fill): one bounded rewrite
of the completed line for cadence, shown as a diff the creator can reject — and the
accept/reject writes a script_edits pair, seeding the empty preference table
(G24/G36’s missing supply).
UI (Result.tsx / script cards).
A needs_user beat renders as a distinct question card: the ask as the headline, a one-
line input, “Answer” / “Skip for now” . On answer: the card animates into the completed

spoken line in place. Teleprompter mode refuses to start while any unanswered
needs_user beat exists in a speaking scene, with a jump-to-card affordance (“2 lines
need you before you can film”).
Never render ask text as WHAT TO SAY. The string “Only you can supply this” must not
exist in the UI vocabulary at all.
Checks & tests.
Contract test: schema rejects needs_user without ask+scaffold; scaffold must contain
exactly one {answer}; ask ≤160; ban list for generic asks (“tell me about” , “describe
your” , “share your story”).
Mutation checks (house style): delete the knowledge write and watch the guard fail
(reader-with-no-writer, the G35 lesson); delete the slot-fill and watch the teleprompter
gate fail; answer twice and assert one knowledge row (0128 index).
check_row_type_drift.mjs gains the new blueprint fields.
Metric. Durable, per G27/G29 registry: beat_asks {emitted, answered, skipped} stored
on generations.selection (column exists). Success = ≥50% of asks answered within the
session, and repeat generations for the same creator show declining ask counts (the twin is
filling in).
FIX 2 — Empty store at onboarding → Story Interview + Twin
Strength Meter
Root cause. Captions produce 0 experiences (measured, n=374). Most new creators are
caption-only, so their first script is structurally guaranteed to starve — the quality ceiling is
set at onboarding, before the writer runs.
Story interview.
Three fixed questions at the end of onboarding (after the DNA scan kicks off, while the
creator is waiting — the scan takes minutes, the wait is dead time today):
1. “What’s one mistake in {niche} you made yourself, and what it cost you?” →
experience
2. “What result are you proudest of? Give the real number if you have one.” →
experience (+carriesFigure)
3. “What does almost everyone in {niche} believe that you think is wrong?” → opinion

(this is the existing Teach-Your-Twin Q1 — reuse its writer verbatim)
Each answer → creator_knowledge {basis:'stated', source:'asked'} through the
existing asked path. No new writer. Refuse >240 chars per answer with “shorter is better
— one real moment beats a paragraph.”
All three skippable individually. A skip stores as skipped (never re-asked at onboarding;
the in-flow Teach-Your-Twin cadence may re-offer different questions later, never these
verbatim — 0128 covers it).
Placement rule honored: one question per screen, above the fold, during an existing wait
— the measured lesson (below-fold Qs got zero answers; a dedicated screen becomes
the 0-row Product Library).
Twin Strength Meter.
Pure read, no new writes: strength = f(substance_count, experience_count,
figure_count, spoken_share) from the columns the selector already reads (kind,
source, carriesFigure). Render on Dashboard + top of Studio: “Your twin knows 4 real
stories and 2 numbers. Answer 1 question to strengthen it →” linking into the asked
flow.
Three-state display: a voice scanned before source existed (pre-0122) shows
“unmeasured” , never “weak” (unrecorded ≠ caption — the G14 rule).
Honesty constraint: the meter never claims quality it can’t compute (no “87% ready”
theater). Counts, plainly.
Tests. Mutation: remove the knowledge write from one interview question → guard fails.
Assert the three questions register in the asked-questions unique index. Meter renders
unmeasured for a null-source store.
Metric. % of new voices with ≥1 experience before first generation (target: 80%+,
today ~0% for caption-only creators). And downstream: needs_user beats per first
script should fall.
FIX 3 — Hook rules unchecked → Hook Contract Check (all 5
hooks)
Root cause. The prompt demands ≤~12 words; the live recommended hook is ~28. Code
comment admits hooks[1..4] are never checked at all. Rules without decidable checks drift
— the repo’s own doctrine.

Decidable contract (post-parse, after rescue point, repair-not-reject):
Word count: words(hook) ≤ 14 hard ceiling (12 target, 14 tolerance — hook 0 in the
wild proves 12 sharp rejects too much legitimate output; measure before tightening).
Banned openers on every hook (the list already in the prompt: “Hey guys” , “In this video” ,
“Today I” , “So basically” , “Let me tell you”) — extend with announcement-of-value forms:
“you need to hear this” , “listen to this” , “I’m about to” .
Filler strip: “literally” , “actually” , “basically” removed when the hook exceeds count and
removal alone brings it under (deterministic, no model call).
Enumeration count present in hook[0] when enumeration.is_enumerated (exists today
— keep, extend to all five hooks or drop non-conforming ones, current behavior
audited).
Repair ladder (bounded, never fails the generation):
1. Deterministic: filler strip + leading-clause drop when the hook is two fused sentences
and the second carries the payload (detect: sentence split; if sentence 2 alone passes
all checks and contains the highest-information tokens — numbers, niche nouns from
DNA — keep sentence 2). The screenshot hook resolves under exactly this rule: “Your
fear of judgement is cementing you into a life you hate.”
2. If still failing: one bounded model call (“compress to ≤12 words, keep the strongest
concrete word, no new claims”) — schema-constrained, 8s timeout, fail-open to the
original hook flagged over_length in beat_audit.
Order rule: hooks that fail after repair are demoted, not deleted, unless <3 survive (five
options exist so the creator can choose; a dropped hook is a lost preference datapoint
per G19/G37).
Tests. Fixture battery: the live 28-word hook must compress to the 11-word cut
deterministically. Mutation: remove the repair and the fixture fails. Each of the 5 hooks
independently checked (kills the “four are never checked” admission — assert via a test that
iterates all indices).
Metric. hook_over_length {raw, repaired, model_repaired, shipped_over} in
beat_audit (0131 column). Also instrument which hook index creators pick post-fix —
shorter hooks should shift hook_choice provenance-clean picks (0134) if the doctrine is
right; this is the honest A/B the 12-word rule has never had.
FIX 4 — Scene monotony → Visual Delta Check

Root cause. Four scenes: identical location string. No rule and no check demands scene-
to-scene visual change, while the retention doctrine requires it.
Prompt (input-shaping, one line in the user prompt’s beat_plan section): “location and
framing must CHANGE at the Re-hook beat, and no location string may repeat more than 2
consecutive speaking beats. Changing framing (chest-up → tight face) counts as change;
repeating both location and framing does not.”
Decidable check (post-parse): normalize location strings (lowercase, strip punctuation);
flag runs of ≥3 consecutive speaking beats with identical (location, framing) pairs. Repair:
none automatic (inventing locations violates the never-assume-inventory rule). Instead the
flag renders in the UI as a one-tap variety suggestion drawn from a safe, achievable set
(“move to the window” , “sit → stand” , “punch in to tight face”) — creator applies or ignores.
Flag lands in beat_audit.
Why not auto-repair: location is the field with the “assumed inventory” failure mode (“your
walnut chair”) — a model repair reintroduces the exact defect the field’s rules exist to
prevent. Deterministic suggestions from a vetted list are safe; generated ones are not.
Tests. The screenshot script (4× “center of the room facing a window”) is the fixture and
must flag. A chest-up→overlay→insert sequence with one location must NOT flag scenes
whose framing differs.
Metric. visual_monotony_flags per generation in beat_audit; creator apply-rate on
suggestions.
FIX 5 — Framing/action contradictions → Cross-Field
Coherence Check
Root cause. Scene 2: framing “Overlay” + action “hold hands up in surrender.” Fields
individually valid, mutually incoherent; nothing checks pairs.
Decidable rules (post-parse, deterministic repair):
framing ∈ {overlay, full-screen insert} 㱺 action_posing must be empty or start
with an off-camera cue. Repair: move the stance text into a new vo_delivery note
(“deliver with energy, hands free”) or drop it; never leave on-camera direction on an off-
camera beat.
shot_type = cover_frame 㱺 spoken_text = '' (schema already implies; enforce).
Silent shot 㱺 line empty and beat carries no enumeration ordinal (ties into the existing
“no silent beat mid-enumeration” rule — make it a check, not only a prompt sentence).

framing off-camera 㱺 wardrobe empty (nothing to wear on a screen recording).
Prompt: one added sentence in the WHERE-TO-BE-IS-FOUR-FIELDS block naming the
overlay㱺no-stance rule, since the model writing coherent output beats repairing it.
Tests. Scene 2 from the screenshot is the fixture: after repair, its action field must be
empty/VO-cue. Mutation: disable the repair, fixture fails.
Metric. coherence_repairs count in beat_audit. Should trend to ~0 as the prompt line
takes effect (if it doesn’t, that’s the familiar inert-instruction result and the check carries it
alone — fine).
FIX 6 — Scene cards rendering a bare digit
Root cause (verify first, then fix accordingly). Two candidate causes; pull the stored
blueprint JSON for this generation and check which:
(a) Writer emitted the enumeration ordinal as the beat’s body/section text → then it’s a
schema/prompt defect: add to the enumeration contract “the ordinal lives in the spoken
line ONLY; no field may contain a bare number as its whole value” , plus a post-parse
check (/^\d+$/ on any text field 㱺 strip, flag).
(b) Blueprint is fine and the card component renders the wrong field for silent shots
(shows section/index where it should show the shot description) → frontend fix in the
scene-card component: silent shots render location + on-screen text prominently;
never render a numeric section as body. Test either way: snapshot test that no
rendered card body matches /^\d+$/; fixture = this generation’s real JSON (pull real
failing inputs before changing anything — house rule F).
FIX 7 — Line length vs beat timing → Timing Math Check
Root cause. “Write to target_sec” exists as prose (“~15 words for 6s”); nothing computes
it. Scene 2: ~31 words in an 8s beat (~2.6 wps needed vs ~2.4 natural).
Decidable check: expected_sec = words(line) / 2.4 (calibrate the divisor later from real
recordings — the transcriber returns word timings; a one-off script over existing takes gives
the creator-specific rate). Flag beats where |expected - target| > max(2s, 30%). Repair:
prefer adjusting target_sec to the line (deterministic, harmless — the beat plan is a plan,
not a contract with the renderer yet) and flag; only suggest trimming the line in-UI when
total runtime overshoots the format (e.g., >60s for a TikTok reference). Never auto-cut

spoken words — a trimmed clause can invert meaning (the G26 truncation rule).
Teleprompter payoff: once per-beat seconds are trustworthy, the teleprompter scroll rate
and the “20-minute production sprint” estimate both become real instead of decorative —
same numbers, two readers. Tests: scene 2 fixture flags; a 15-word/6s beat doesn’t.
Metric: timing_flags + total planned runtime vs format norm in beat_audit.
FIX 8 — Repetition (in-script + against hook options)
Two distinct defects, two fixes:
8a. Hook-conditioned duplication (Scene 4 ≈ hook option 2 — decidable). Root cause:
the writer emits 5 hooks and a body simultaneously; nothing forbids a body beat from
restating a non-selected hook, so whichever hook the creator picks can collide with a body
line. Fix: post-parse containment check between every hook_options[i] (i≥1) and every
script line (word-containment ≥0.6 after stopword strip — containment, not Jaccard: the
G16 length-mismatch lesson). On hit: flag the body line in beat_audit and, in the UI, if the
creator picks the colliding hook, surface “this line repeats your hook — tap to vary it” with a
single bounded rewrite call. Prompt addition (one line): “No script line may restate ANY of
the five hooks. The hooks are openers the creator chooses between; the body must survive
any choice.” (Kept even though prompt rules measured inert for semantic repetition — this is
lexical repetition of known strings, which instructions can plausibly hold; the check carries it
regardless.)
8b. Semantic repetition (the 67% defect — judged, routed, not prompted). Everything
cheap already failed (4 detectors measured). The only evidenced route: the judge finds
these reliably; the only repair trigger that won its blind test is 2+ substantive soft beats
(3–0); the payoff branch measured 1–6 and must not be built (G20’s explicit instruction).
Fix: one judge call per generation after the rescue point, async where possible (script
renders immediately; repetition flags arrive as annotations seconds later — never block the
script on a quality pass). Judge output: repeated-pair list with beat indices → stored in
beat_audit → UI marks the later beat “covers the same ground as beat N” with an optional
single span-repair (three candidates, creator picks or keeps original — the G18 shape,
offered not imposed). Auto-repair fires ONLY on the 2+ substantive trigger; all other flags
are advisory. Cost gate: judge call behind a flag with a per-day budget counter (durable,
registered) so the unit economics are a decision, not a surprise. Metric: flagged-pair rate
over time; creator accept-rate on span repairs (this finally accumulates the preference data
G18/G20 lacked — every accept/reject writes a script_edits pair).

FIX 9 — Cliché leakage → Two-Tier Cliché Defense
Root cause. The ban list is prompt-only; “letting society dictate your happiness” is in the
banned family but not the banned list, so it shipped.
Tier 1 (decidable lint, post-parse): the existing literal ban list from the prompt becomes a
code-level check (exact + light stemming). Extend with the motivational-poster family:
“dictate your happiness”, “living someone else’s life”, “comfort zone”, “your best self”, “the
person you’re meant to be” , “society tells you” . Repair: flag only (auto-rewriting voice is how
you get a different cliché); UI shows “generic line — tap to ground it in your world” wired to
the same span-rewrite affordance as 8b, which pulls from the creator’s supplied substance.
Tier 2 (the real fix is supply, again): a cliché is what the writer reaches for when the store
has nothing specific. Every Tier-1 flag on a general-substance beat is also logged as
demand into the asked-question queue (“beat about escaping a job you hate had no
personal material — ask: ‘What was the exact moment you decided to build instead?’”). The
lint becomes a knowledge-gap detector — flags convert to future supply instead of only
shaming the writer. Tests: the live line flags; a concrete line with the word “society” in a
factual claim doesn’t (word-boundary + phrase-level matching, not substrings — the G8
normalization lesson). Metric: cliché flags per script, split by substance state; should fall as
store depth rises — if it doesn’t, the ban list needs the judge, not more entries.
FIX 10 — Unwritten ending → CTA/Payoff Beats Can Never Be
needs_user
Root cause. The final beat (the retention map’s “direct directive to share”) shipped as a
placeholder — the one beat that never needs personal history was allowed to starve.
Schema/prompt rule (decidable): beats whose section ∈ {CTA, Payoff} and the Hook beat
may not carry substance: needs_user — these are craft beats, writable from goal + offer +
format alone (all supplied). The prompt states it; the post-parse check enforces it with a
deterministic fallback ladder: goal-appropriate CTA template resolved from the existing
GOAL_DIRECTIVE machinery (sell 㱺 offer-anchored ask; followers 㱺 save/comment-bait per
the existing preference) — filled with the creator’s actual offer/platform strings, never a
bracket. HOOK cannot fail this way today (0 soft hooks across 96 measured scripts) —
assert it anyway; asserting the impossible is how G34-class regressions get caught. Test: a
blueprint with needs_user on the CTA must ship with the fallback CTA and a beat_audit
flag, never the ask-card in the final position. Metric: cta_fallbacks count — rising means
the writer regressed; the check caught it.

FIX 11 — Sermon without witness → Witness Requirement
(honest version)
Root cause. Zero first-person evidence in the whole script — the correct output of an
empty store, but the persuasive engine of the format is missing. No prompt fixes absent
supply; the fix is detection + honest degradation + supply capture.
Detection (decidable): post-parse, count beats with substance ∈ {creator_knowledge}
and first-person markers, plus carriesFigure across spoken lines. witness_score =
{first_person_beats, figures_spoken} → beat_audit. Honest degradation: when
witness_score is zero AND the reference format is testimony-shaped (DIY-fail, storytime, “I
tried X” — detectable from the existing reference_read fields), the concept stage must
choose an observer frame instead of a hollow first-person sermon: “the pattern I keep
seeing in founders” is honest where “this happened to me” would fabricate. One prompt
rule in CONCEPT & ADAPTATION: “If WHAT THIS CREATOR ACTUALLY KNOWS contains no
first-person experience, do NOT write a testimony-shaped premise; adapt the mechanism
to an observer or teaching frame, and say so in your_scale.” This is input-shaping/premise-
selection (the lever that works), not a quality exhortation. Supply capture: the witness gap
emits the top-priority asked question for this creator (the Fix 1/2 machinery): testimony
formats are what they’ll keep remixing; one answered story unblocks the whole family.
Metric: witness_score distribution over time per creator; testimony-format generations with
score 0 should trend to zero as asks are answered.
FIX 12 — Stock-clip contradiction → Align Schema, Prompt,
Renderer
Root cause. The prompt says only talking_head and cover_frame exist and “never invent
a shot the creator has no way to supply” — the live script contains STOCK CLIP full-screen
inserts, and stock sourcing is roadmap, not built. Rule and output have drifted; a creator
discovers the gap after filming everything else.
Decision first (this is a product call, both branches specced):
Branch A — honor the contract today (ship immediately): post-parse check: any
shot/scene implying footage the pipeline can’t supply (stock, b-roll, external screen
recording beyond the creator’s own phone) is converted to the nearest supplyable form:
screen-recording beats stay (creator’s own phone CAN record its screen — that’s the
capability flag’s job, and it must actually gate this per the now-fixed per-video writer),
stock-clip beats become on-camera beats with on-screen text carrying the visual idea.

Flag in beat_audit. The script never promises what the edit can’t deliver.
Branch B — build the third shot type (the real fix, sized in the existing roadmap):
shot_type: 'broll_overlay' with source ∈ {creator_screen, creator_footage,
stock}; stock resolved at edit time via the ROADMAP’s Pexels/Pixabay keyword match
(free, in-house — already the stated principle). Renderer support lands in Phase 8 scope
(the overlay path is a compositing case the EditPlan schema must include from day one
— cheaper to include in the frozen schema now than to migrate later).
Sequence: A now, B inside Phase 8. A is a two-day check; B is the faceless-mode
unlock (persona P2) and earns its place in the render pipeline build.
Tests. Branch A: the screenshot’s scene 3 (stock cubicle) converts deterministically; scene
2 (own-phone screen recording) survives untouched, but only when can_record_screen
resolves true for this video. Metric: unsupplyable_shots {emitted, converted} — tells you
exactly how much demand exists for Branch B before you build it (the G11 lesson: measure
the refusal rate before shipping the stop).
FIX 13 — Shallow reference analysis → Tiered Deep Analysis,
Cached on the Gallery
Root cause. 9 of 13 reference dimensions (all visual) fall back to brand defaults; only the
transcript skeleton transfers. Full visual analysis per user-pasted link is a real cost; that’s
why it isn’t run.
Design: analyze once, amortize forever.
Tier 0 (today’s default, free): transcript-derived, honest labels unchanged.
Tier 1 (deep visual pass) runs on GALLERY references — curated items get the 9
visual dimensions analyzed ONCE (frame sampling → shot boundaries, framing classes,
caption style detection, cut cadence, music presence; the worker already has ffmpeg +
the media inspection scaffolding from editor-v2’s analysis stage). Result stored on
gallery_items — every user who remixes that item gets full-depth transfer at zero
marginal cost. This makes the gallery, not the paste-a-link flow, the product’s center of
gravity — which is also the CapCut-templates strategy the roadmap already names.
Tier 2 (paid deep-dive on a pasted link): the same pass, on demand, priced as a credit
action (“Deep-analyze this reference”). The honest-labels panel becomes the upsell
surface: each “NOT OBSERVED — brand default used” row gains “Analyze (1 credit)” .
The label system you already built is the merchandising.

Blueprint integration: analyzed dimensions flow into the prompt as structured fields
(shot cadence, framing sequence, caption density) under the existing UNTRUSTED
fence; the observed/interpreted labeling extends naturally (observed_visual). Tests: a
gallery item with a cached analysis must produce a blueprint whose “what we took”
panel shows >4 observed; the pass is deterministic per video (same input → same
structure hash). Metric: observed-dimension count per generation; remix rate of
analyzed vs unanalyzed gallery items (does depth actually drive usage — the honest
question before Tier 2 pricing).
FIX 14 — Delivery cues inside spoken text → Emphasis Channel
Split
Root cause. “YOU HAVE TIME” — ALL-CAPS emphasis embedded in teleprompter text.
Emphasis is direction, not words; caps in the line also leak into burned captions later.
Fix: schema gains per-beat emphasis_words: string[] (words from the line to punch).
Post-parse normalization: any all-caps run in line (length ≥2 words, excluding acronyms
via a small allowlist) is lowercased in place and its words appended to emphasis_words.
Readers: teleprompter bolds them; the caption packet’s existing “which words to
emphasize” field consumes the same list (one writer, two readers — finally giving that
caption field a real upstream source instead of a per-generation guess). Prompt gets one
line (“never use capitalization for emphasis in spoken lines; name emphasis words in
emphasis_words”). Test: the live scene-4 line normalizes with ["you","have","time"]
extracted. Metric: caps-run repairs per script (should trend to 0).
FIX 15 — First-frame text unenforced → visual_hook
Completeness Check
Root cause. The doctrine says the first half-second’s on-screen text decides the scroll-
stop alongside the words; the schema has visual_hook, but nothing requires it to name
on-screen text, and the live script’s scene 1 has none.
Fix: decidable completeness check on visual_hook: must name (a) something that visibly
changes/moves in second one, and (b) either explicit on-screen text (≤4 words) or an
explicit “no text” decision. Repair: derive default first-frame text from
packaging.thumbnail.text_overlay (already required, already ≤4 big words — one writer,
second reader, zero new model calls). Test: empty-text visual_hook backfills from the
thumbnail overlay; an explicit “no text” survives (three states: specified / defaulted /

declined — house discipline). Metric: first_frame_text {specified, defaulted,
declined} in beat_audit.
Sequencing (dependency-ordered, matches the value ranking)
Wave Fixes Why this order
1 (this
sprint)
6
(verify+patch),
3, 5, 7, 14, 15,
10
Pure decidable checks + deterministic repairs on the existing
rescue-point pipeline. No migrations, no new UI surfaces
beyond flags. Kills every rule-violation visible in the live
screenshot.
2 1, 2
The supply system: micro-interview beats + onboarding story
interview + strength meter. One schema extension, reuses the
asked-knowledge path end to end. This is the 10x item.
3 4, 8a, 9, 12-A
Advisory-flag family with UI affordances (variety suggestions,
hook-collision rewrite, cliché grounding, unsupplyable-shot
conversion). Each flag also feeds the ask queue (9’s Tier 2).
4 8b, 11
Judge-based passes (repetition annotations, witness scoring) —
cost-gated, async, accumulating the preference data every
future ranking idea is starved of.
5 13, 12-B
The strategic builds: gallery deep-analysis cache, then the
broll/faceless shot type inside Phase 8’s frozen EditPlan
schema.
Standing rules across every fix (inherited from the repo’s own hard-won lessons):
every repair runs after the rescue point and can never cost the creator the script; every
counter is registered durable or explicitly counter_ephemeral with a promotion condition;
every new field ships with its reader in the same PR and a mutation test that fails when the
writer is deleted; every threshold is set before results are seen; and any claim that a fix
“worked” comes from the blind panel or real creator picks — never from the counter that the
fix itself moves.