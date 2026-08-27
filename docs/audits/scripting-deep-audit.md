# TwinAI Scripting System — Deep Audit

_Source: uploaded PDF, committed verbatim (text-extracted) so "fix #N" references in build routines resolve against a real document._

---

TwinAI Scripting System — Deep Audit
Scope: onboarding questions → creator DNA → product DNA → knowledge selection →
the writer (generate-blueprint) → the script surface the creator actually sees.
Includes a line-by-line audit of the real script in the screenshots, and simulated audits
from 7 creator personas.
PART 1 — Audit of the actual script in the screenshots
(“Voiceover Storytelling / DIY Fail Reaction”)
This one script demonstrates almost every systemic issue at once. Item by item:
1.1 Three of six speaking scenes are literal placeholders — the fatal one
Scenes 2, 3, and 6 all display, as the spoken line:
“Only you can supply this. What would you actually say here?”
A creator at a teleprompter cannot read this. Per the system’s own rule in the prompt (“A
PLACEHOLDER IS A FAILED BEAT, NOT A DRAFT”), half this script is failed beats. What
happened mechanically: the video idea is inherently personal (a founder’s fear-of-
judgement story), the writer correctly refused to fabricate personal history (needs_user
substance state — ethically right), but the product then shipped the refusal as the script.
The honest refusal is correct; presenting it as dead text with no path forward is the single
biggest UX failure in the product.
This is the #1 fix and the #1 value unlock (see Part 4). The system’s own measurements
already prove the answer: creator-answered questions are the highest-quality knowledge
source in the entire pipeline (better than transcripts, which beat captions 78% vs 13% on
substance). Every “Only you can supply this” beat should become a one-tap micro-
interview — ask the specific question the beat needs (“What almost made you quit
posting?”), take a 1-2 sentence answer, write the line from it live, and store the answer as
permanent creator knowledge (source: 'asked', which the pipeline already supports).
One failed script becomes a permanently smarter twin. Right now the same dead-end will
recur on every personal-story reference this creator ever remixes.
1.2 Every scene is filmed in the same spot — contradicts the system’s own

retention doctrine
Four scenes say identically: “Standing in the center of the room facing a window.” The
system prompt itself demands: “introduce new visual or verbal information constantly so
there is no flat stretch” and bans “generic descriptors.” A video where the frame never
changes is exactly the flat stretch the doctrine forbids. The location field passed validation
because “clean achievable direction” is the rule — but nothing checks variety across scenes.
Missing check: scene-to-scene visual delta. At minimum, alternate framing (which it
does: chest-up → overlay → full-screen insert), but location/energy/prop should shift at the
re-hook beat.
1.3 The recommended hook breaks the system’s own 12-word rule
“If you are a solo founder in your twenties right now, you need to hear this, because your
fear of judgement is literally cementing you into a life you hate” — ~28 words. The prompt
requires “one spoken line under ~12 words.” At a natural speaking pace that hook is ~9-10
seconds — the 3-second scroll decision is over before the sentence’s first clause ends. The
psychology is right (self-relevance + emotional stakes + the “cementing” tie to the DIY-fail
visual is genuinely clever), but it’s two hooks fused. Tighter cut: “Your fear of judgement is
cementing you into a life you hate.” (11 words, keeps the metaphor). The ledger already
documented that hook_options[0] is checked for enumeration but “FIVE HOOKS ARE
GENERATED AND FOUR ARE NEVER CHECKED” — add a word-count/duration check on
all five.
1.4 Scene 2’s fields contradict each other
Framing: “Overlay” (a screen recording covers the frame) — but “How to stand & move”
says “Hold hands up in a gesture of surrender.” If the viewer is watching a screen recording,
the gesture is invisible; if the creator is on camera gesturing, it’s not an overlay. This is the
four-field split (location / editor_intent / framing / action) drifting apart — each field
individually valid, mutually incoherent. Missing check: cross-field coherence per scene (if
framing = overlay/full-screen insert, action_posing should be empty or explicitly “off-camera
VO delivery”).
1.5 Scenes 4 and 5 render as a bare number (“2” , “3”)
Two silent-shot cards show only a digit as their content. Either the enumeration ordinal
leaked into the wrong field, or the card body failed to render its description (the actual shot
info — “Screen recording showing the deletion of a draft” , “Boring office environment” —
appears in a sub-card below). Either way a creator scanning the timeline sees a card whose
content is “2” . Cosmetic-looking, but it’s the exact “field written, nothing reads it correctly”
family the ledger documents nine times.

1.6 The reference analysis is shallower than the UI implies — honestly
labeled, but strategically thin
“What we took from the reference: 4 things read, 9 we did not look at.” Platfor m
(observed), Format/Why-it-works/Story-structure (interpreted from transcript) — and not
observed: shot choices, camera work, framing, caption design, transitions, b-roll purpose,
zooms, music, pacing of dead space. So “we copy the proven structure” today means: the
transcript’s narrative skeleton only. All nine visual dimensions — the things that make a
reference video feel like that reference video — fall back to brand defaults. The honest
labeling is excellent (rare in this industry). But for a product whose pitch is “remix a viral
video,” 9/13 dimensions unanalyzed is the depth ceiling on the whole promise. This is a cost
decision (video analysis is expensive; transcript is cheap) — see Part 4 for the tiered fix.
1.7 What’s genuinely good in this script — credit where due
The premise adaptation is strong: a physical DIY-fail (cement) reference became a
psychological founder story that keeps the escalation mechanism (tiny mistake →
irreversible disaster) while mapping each reference beat to an achievable equivalent.
“Dropping a key into cement” → “Deleting your first post” is exactly the theirs→yours
translation the prompt demands, executed well.
“Why it works” and the retention map are real coaching, not filler — each beat
names the tactic (open loop, visual change, tonal shift) and where drop-off happens.
This teaches the creator transferable skill, which builds the “private creative brain” trust
you want.
The Teach-Your-Twin question placement (“What does almost everyone in your niche
believe that you think is wrong?”) under a just-delivered script is the measured-correct
placement (below-fold questions previously got zero answers).
The honesty labels (observed / interpreted / not observed) are a trust feature no
competitor has. Keep them; fix the depth behind them instead.
PART 2 — Audit of the pipeline that produced it
2.1 Onboarding & the brief (what gets asked)
What exists: niche/voice quiz fallback, DNA scan by handle, pre_script_brief (workKind,
forbiddenClaims, audience, offer, promotes, goal, tone), product evidence capture, and the
one-question-at-a-time Teach-Your-Twin flow. Strong properties: three-state discipline
(unanswered ≠ “none” ≠ blank — genuinely rare rigor), forbidden-claims flow with tone
clamping for professionals, the composer that fuses separate facts into one “what THIS

video is” position.
Gaps:
The brief never asks for stories. Everything asked is categorical (what do you do, who
for, what’s the offer). Nothing asks “tell me about a time…” — yet experience items are
the #1 predictor of non-generic scripts, captions produce zero of them, and most
creators start caption-only. The first script for a new creator is therefore structurally
doomed to placeholders exactly like the screenshot. The single highest-leverage
onboarding change: a 3-question story interview at signup (“What’s a mistake you
made that taught you the most?” / “What result are you proudest of — with the
number?” / “What do people in your niche get wrong?”). Three answers = three
experiences = more substance than 374 scraped captions produced.
Product Library has zero rows in production — a fully built feature waiting on a screen
nobody visits. Product facts should be captured in-flow (first time a script needs a
product fact, ask for it then), same pattern as Teach-Your-Twin.
2.2 Creator DNA & knowledge selection
The measured state (from the team’s own ledger): transcripts 78% substance vs captions
13% (with zero experiences from captions ever); the transcript-preference selector is the
one intervention creators blind-preferred (17-7); the selection bottleneck moved from
supply to selection; repetition affects 67% of scripts and got worse with denser material;
every prompt-instruction fix measured inert.
What this means practically: the DNA system is real but its quality is a direct function of
whether the creator talks on camera. A creator whose catalogue is captions/text-overlay
content gets a hollow twin, silently. Nothing warns them.
Missing: a “twin strength” meter. The system knows exactly how many substance
items, experiences, and figures a voice holds. Show it: “Your twin knows 4 real stories
and 2 numbers. Answer 3 questions to strengthen it.” This converts the silent-
degradation failure into an engagement loop, and it’s honest.
2.3 The writer (SYSTEM prompt) — assessment
The prompt encodes genuinely elite short-form doctrine: 3-second rule, hook-retain-
reward, 4 cognitive triggers with stack-2 requirement, enumeration-as-contract (count
must be spoken, no silent beats mid-list, unit must translate to the creator’s domain), re-
hook must carry substance, progress-checks banned, placeholder ban, no-fabricated-
personal-history rule, anti-injection fencing with output-side link sanitization, cliché ban list.
This is a top-5% prompt for this domain, and the substance/evidence declaration system
(every beat must name its source, checked post-hoc) is a real moat.

Weaknesses, all evidenced:
1. Rules without checks drift — hook length (unchecked, violated in the live screenshot),
hooks 2-5 (never checked at all), scene visual variety (no rule and no check), cross-field
coherence (no check). The team’s own lesson applies: “a contract check beats a prompt
rule where the defect is decidable.” Hook word count, scene-location repetition, and
framing/action coherence are all decidable.
2. Repetition remains unsolved and the only remaining lever the data supports is a
model-judge repair pass (the judge finds these reliably; every cheap detector failed). It
costs one extra call per generation — worth it, since repetition is the top creator-facing
flaw.
3. needs_user has no product path (the screenshot’s fatal issue) — the prompt tells the
writer to “write the beat around what you DO know,” but when the whole video is
personal, the honest output collapses to placeholders. The prompt can’t fix this; only a
supply-side interview can.
PART 3 — Persona simulation: 7 creator types run against
today’s system
(Each persona = a realistic user segment, what they’d experience today, and what would
make TwinAI indispensable to them.)
P1 — “Ayesha” , beginner lifestyle creator, 800 followers, caption-only
catalogue
Today: DNA scan returns 13%-substance caption knowledge, zero experiences. First script
= placeholder-riddled (the screenshot experience). Likely churns believing “the AI is dumb,”
when actually the AI refused to lie about her life. Needs: the signup story-interview (2.1),
the twin-strength meter, and micro-interview beats. She is the majority of your funnel — fix
her experience first.
P2 — “Hamza” , faceless YouTube/TikTok automation channel (voiceover +
stock/screen footage, never on camera)
Today: structurally unsupported. shot_type allows only talking_head or cover_frame —
the schema literally cannot describe his videos. Every framing/action field (“point at the
lens”) is noise to him. Needs: a faceless mode — third shot type (voiceover_broll),
scene cards that specify footage/screen-capture instead of stance, and caption-first
emphasis. Faceless channels are a huge, underserved, highly commercial segment (they

post daily and pay for tools).
P3 — “Dr. Sana” , physiotherapist, professional constraints
Today: actually well-served — forbiddenClaims flow, tone clamp for professionals, no-
fabricated-history rule, three-state compliance discipline. This is the segment the system’s
rigor was built for. Needs: claim-safe proof suggestions (“show the anatomy model, not the
promise”), and a visible “compliance-checked” badge on the script — turn the invisible
safety work into a selling point. She’d pay premium for auditability.
P4 — “Bilal”, e-com brand owner selling one product (your Stylique-adjacent
audience)
Today: product_entities exists, evidence capture exists, product_dna substance tracking
exists — and the Product Library has 0 production rows, so in practice his scripts get
generic product beats or needs_user gaps. Needs: in-flow product capture (first product-
dependent script asks 3 product questions), UGC-ad formats in the gallery (unboxing,
demo, objection-handling — currently the gallery skews personal-brand), and the capability
flag for “product visible on camera” actually driving scene planning.
P5 — “Umar” , comedy/skit creator
Today: the retention doctrine (promise → deliver items → CTA) is an information-content
frame. A skit has characters, escalation, and a punchline — “state the number in the hook”
and “one CTA near the end” actively damage comedy. His remixes will feel like a marketer
wrote his sketch. Needs: a format-family switch: the reference reader already detects
format; let skit/entertainment route to a different beat grammar
(setup/escalation/subversion/tag) and suppress CTA doctrine. Without it, tell him honestly
this isn’t for him yet — a wrong-shaped script erodes trust faster than a “coming soon.”
P6 — “Fatima” , established expert with 200 talking-head videos (deep
transcript store)
Today: the best-served creator — 73% grounded, 8% generic with transcript-preference
selection. But: transcript-dense arms are the most repetitive (7/8 scripts), and she’ll notice
her twin saying the same idea twice faster than anyone. Needs: the repetition repair pass
(she’s who it’s for), and catalogue awareness — the writer “HAS NEVER SEEN A SCRIPT
THIS SYSTEM ALREADY WROTE” for her (quoted from the code), so nothing stops script
#12 from re-pitching script #3’s idea. For a daily poster, cross-video novelty is retention of
the creator, not the viewer.
P7 — “Ali” , Urdu/Roman-Urdu creator (your home market)

Today: the entire doctrine, prompt, and output are English-first. Whisper handles Urdu
unevenly; the cliché ban-list, hook formulas, and caption specs are English-calibrated.
Needs: language passthrough (script in the creator’s language, doctrine stays internal),
Urdu/Hinglish caption styling, and localized hook patterns. Pakistan/India creator economy
is enormous, underserved by every US tool, and it’s your unfair advantage — nobody else
will build Roman-Urdu hook formulas.
PART 4 — The 10x plan, ranked by (value to creator ÷ build
cost)
1. Micro-interview beats (kills the placeholder failure). Every needs_user beat renders
as a one-tap question card → answer → line written live → stored as asked knowledge
forever. Turns the worst moment in the product into the best knowledge source the
pipeline has. This is the single change that most closes the gap between “impressive
demo” and “tool I use weekly.”
2. 3-question story interview at onboarding + twin-strength meter. Guarantees every
creator’s first script has ≥3 experiences to draw on — the difference between the
screenshot and a shootable script, on day one.
3. Decidable checks for the prompt’s own rules: hook ≤12 words (all 5 hooks), scene-
location variety (no location string repeats >2 consecutive scenes), framing/action
coherence (overlay 㱺 no on-camera stance direction). Cheap, catches the exact defects
visible in the live screenshot.
4. Repetition repair pass (one judge call per generation, only when the classifier routes it
— the 2+ substantive trigger was the only one that won its blind test, 3-0; do NOT
build the payoff-repair branch, it lost 1-6).
5. Faceless mode (P2) — third shot grammar. Opens an entire commercial segment the
schema currently cannot describe.
6. Tiered reference analysis. Keep transcript-only as the free default with today’s honest
labels; offer “Deep analysis” (the 9 unobserved visual dimensions) as a paid/premium
action on gallery references — analyze once, cache for every user who remixes that
reference. The gallery makes the expensive analysis amortize across users.
7. In-flow product capture (P4) — retire the Product Library screen as an entry point; ask
for product facts the first time a script needs them.
8. Catalogue-aware novelty (P6) — feed the writer a one-line summary of the creator’s
last N TwinAI scripts with an instruction-free mechanism: exclude already-used

premises from the candidate pool (input-side change — the kind that measurably works
— not a prompt rule, the kind that measurably doesn’t).
9. Format-family routing (P5) — at minimum, detect entertainment references and be
honest; ideally a second beat grammar.
10. Language passthrough (P7) — Urdu first, as the strategic wedge market.
What NOT to build (the data already says so)
More prompt instructions for quality (measured inert, repeatedly).
Whole-script AI rewriting passes (blind tests: neutral-to-negative).
A hook reranker (only 8 real preference decisions exist; it would learn artefacts).
The Substance Packet in production (12-12 coin flip; keep as instrument).
PART 5 — The consistency question: can a creator use this
weekly, forever?
Verdict: not yet, for three reasons — all fixable, all above.
1. The placeholder wall means personal-story formats (most of what goes viral in personal
brands) fail today for anyone without a deep transcript history. Fix #1/#2 removes it.
2. No cross-video memory means a consistent user gets repetitive premises by week 3. Fix
#8 removes it.
3. One beat grammar means only educational/personal-brand creators fit. Fixes #5/#9
widen it.
What’s already right for consistency — and worth protecting: the honesty architecture
(observed/interpreted labels, refusal to fabricate history, three-state answers) is precisely
what makes a creator trust the tool at video #50, not just video #1. Every recommendation
above adds supply or checks; none loosens the honesty. That’s the compounding asset: a
twin that never lies about you is the only twin worth keeping.