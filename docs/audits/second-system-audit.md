# TwinAI — Second System Audit

_Source: uploaded PDF, committed verbatim (text-extracted)._

---

TwinAI — Second Full-System Audit (post-Wave-1)
Method: read the last ~30 merged PRs, the live Gallery source, the writer, and the
decision/ranking modules. Every claim below cites where it came from. Structure:
what verifiably improved → the gallery root cause you asked about → remaining
connected-system gaps → writer quality state → UI/UX → persona re-runs → ranked
plan → the two actions only you can take.
PART 0 — What verifiably improved since the last audit (credit
first, it’s substantial)
Last audit’s
finding Status now Evidence
Placeholder
refusal shipped
as spoken line
Fixed at the causing site — ask lives in its own field, line
is real writing or honestly empty; teleprompter shows the
question as a question (“Say it in your own words”) and
the beat no longer vanishes from the recording script
#542,
#553
Hook 28-30
words vs 12-word
rule, unchecked
Checked + deterministically repaired, all five hooks,
counters durable; and the check found a live missing-
brace defect that had disabled the reference-leak repair
on every normal generation
#541
CTA/payoff
shipped as
placeholder
Craft beats can’t be needs_user; deterministic fallback
from goal+offer; the ‘unspecified’ sentinel trap caught
before shipping
#541
CAPS-as-
emphasis in
spoken lines
Split into emphasis_words; caption packet finally has an
upstream source #543
Story interview at
onboarding
Shipped in the scan wait, reusing existing questions and
the asked-knowledge writer #545
Twin strength
meter Shipped as counts, never a score, three-state honest #544
Bare-digit scene Root-caused against production first (44% of shot rows

cards named by ordinal), repaired at render so 39 existing
generations heal too
#546
Silent beats
overwritten with
the hook
Fixed — silence, placeholder, unwritten are now three
states; one real script had the same hook pasted 3 of 4
beats including the CTA
#549
Cliché ban
prompt-only
Phrase-level lint shipped, and the obvious word list was
measured first and found 57% false-positive (“hustle” was
the creator’s stance) — correctly narrowed
#550
“Sometimes”
showability
recorded as
“Never”
Fixed; middle option now reachable; edit panel asks the
same question in the same words #555
Account-level
“you’re never on
camera” warning
never reached
creators
Shipped end to end: sampling job, agreement guard
between worker/shared halves, dashboard card that
renders silence when there’s nothing honest to say
#538-
#540,
#556
Community map
Fully wired: capture form → column → attestation →
writer prompt block naming pages, speakable figures,
privacy covering lines
#534,
#535
Script duration
never disclosed
Disclosed — and the measurement that motivated it is
damning: only 8 of 35 adaptations land within 25% of the
reference’s length; one shipped script was 4 seconds of
talking
#547
Scan cost abuse
(no per-account
ceiling)
Fixed, plus two TRUNCATE/DELETE privilege holes found
and closed on the way #557
CORS wildcard
unwatched
Premise now guarded — the day any function reads a
cookie while wildcarded, the build fails #559
This is one of the fastest, most honest fix cycles I’ve seen. Now the new findings.
PART 1 — The Gallery: root cause of “it still shows the wrong
videos”

You’re right that it’s still wrong, and the reason it has survived multiple “fixes” is that every
fix so far improved the ranking, and ranking can only reorder what exists. The problem
is inventory and assessment, not order. Read directly from Gallery.tsx:
1.1 — The pool itself doesn’t contain your creators’ videos. The FEATURED set is 8
hardcoded celebrity clips (GaryVee ×2, Ramsay, Lynja ×2, Joey Swoll, Humphrey Yang,
Huberman) across 6 broad buckets. Community items come from discovery, but nothing
forces discovery to stock the current creator’s niche. A jewelry-brand creator resolves to
“Business” or “Beauty” and gets GaryVee motivational clips and GRWM content —
technically “their bucket,” obviously not their videos. No ranking change can fix a shelf
that doesn’t hold the product.
1.2 — The niche system is 6 coarse buckets. resolveNiche maps free-text niches onto
Business/Fitness/Food/Education/Lifestyle/Beauty via keyword signals. “AI virtual try-on for
fashion brands,” “Islamic finance coaching,” and “dropshipping” all collapse into the same
one or two buckets. The sub-niche mechanism only works when the sub-niche already
exists as a chip in the library — for most creators it resolves to nothing and silently does
nothing.
1.3 — The format dimension (your exact complaint: “should be talking videos”) now
exists in the code and has almost nothing to act on. The machinery is genuinely there:
requirements (needs objects / needs screen), ReferenceProfile from the transcript pass,
capability-based refusals, preferredFormats finally wired after being dark since
onboarding existed (the code’s own comment admits it). But the comments state the
operative fact twice: “unassessed is the normal case” and “~97% of cards have no
assessment yet. ” An unassessed card refuses nobody and matches nothing. So a product-
demo video sits in a talking-head creator’s feed because nothing has ever read that card to
learn it’s a product-demo video.
1.4 — The for-you tier gives up quietly at thin inventory. If fewer than 6 relevant cards
exist for your niche, the feed shows everything. With a thin, celebrity-skewed pool, most
real creators are permanently in the everything state — which is exactly the experience
you’re describing.
The fix — “Stock the shelf for this creator, ” end to end
1. Seeded, per-creator discovery. On voice creation (and whenever the creator’s
assessed-matching count < 12): enqueue a discovery job scoped to (creator’s actual
niche keywords from their DNA — not the bucket) × (talking-to-camera format). The
scraper infra and the job queue already exist; this is a new job type + query construction
from brand_voices.profile.niche/sub_niche + audience/offer terms.
2. Assess on ingest, admit only when assessed. Every discovered item runs the existing

early-look/talkingHead analyzer + transcript profile before it becomes visible. The
analyze-once cache (media_analyses, keyed by asset) makes this pay once per
reference forever. The gallery’s for-you tier becomes assessed-only; the “All” tab can
keep unassessed items with an honest “not yet analyzed” state.
3. Kill the buckets as the matching unit. Match on the creator’s own niche text against
the reference’s transcript-derived topics (the profile already carries them) — buckets
remain only as browse chips. This is the same lesson the writer already learned:
selection quality beats taxonomy.
4. Default the format filter from the creator’s own sample. #540/#556 built exactly the
signal needed: the own-account sample knows whether this creator is a talking-head
creator. If their own videos are talking-to-camera, the for-you feed defaults to talking-
to-camera references, with a visible, changeable filter chip — the feed explains itself
instead of guessing silently.
5. Featured cards enter the same pipeline. The 8 celebrity cards carry requirements:
undefined and can never be refused or format-matched — either assess them like
everything else or demote them to a separate “Classics” row that never outranks niche
matches.
6. An empty shelf says so and fixes itself. When a creator’s assessed-matching count is
low, show it honestly: “We’re stocking your shelf — 4 of 12 references found for [their
niche] so far,” with discovery running behind it. Honest scarcity beats silently irrelevant
abundance — the same honesty architecture as everything else in this product.
7. Metric: % of for-you impressions that are (same-niche-text ∨ related) ∧ format-
matched ∧ assessed — today effectively near zero; target >80%. Plus remix-rate per
impression before/after (the gallery_remix event with niche_relation already logs
the needed halves).
PART 2 — Connected-system gaps still open (new + carried)
G-A. The ask loop captures at the teleprompter but never feeds the store. The micro-
interview shipped its first half: the question reaches the creator, they answer by speaking
during recording (“Say it in your own words”). But the interactive answer card was
deliberately deleted (a component nobody mounts — right call), and no path yet turns the
spoken answer into creator_knowledge. So the same personal gap will be asked again on
the next script. The close: when the editor’s ASR lands, the words spoken over an ask-
scene are the answer — transcribe that segment, confirm with the creator in one tap (“Save
this as something your twin knows?”), write through the existing asked path. Until ASR: offer

optional typed capture on the Plan screen’s ask cards. The never-ask-twice promise is
currently only half true.
G-B. Duration disclosure exists; duration comparison has no data path. #547 says it
plainly: the Plan screen has no access to the reference’s duration. 27 of 35 adaptations miss
the reference’s length by >25% — that’s a writer-input problem too: the writer should
receive the reference duration as a hard beat-budget constraint (input-shaping, the lever
that works), and the Plan screen should show “yours ~34s · reference 19s.” Needs one field
carried from reference_read into the generation row.
G-C. Hook angle diversity is noted, not enforced. #551 ships the honest note (“five
options that begin identically are not five options”) — correctly without criticizing the
creator’s signature opener. The next step is decidable and cheap: the writer’s schema can
require the five hooks to draw from distinct trigger families (the prompt already names four
cognitive triggers), checked post-parse by first-3-content-words distinctness; repair =
demote duplicates, never rewrite. The note tells the creator; the check would prevent the
menu shipping degenerate in the first place.
G-D. The b-roll demand signal has arrived and is strong: act on it. #552’s measurement:
8 of 20 real proof notes are footage requests (screen recordings, b-roll) that must be
withheld because Twin doesn’t make them. That’s 40% of the writer’s visual ideas hitting
the capability wall. This is exactly the demand measurement Fix 12-B was waiting for.
Decision time: either the camera-at-screen conversion (the plan you approved) reaches the
writer so those beats become filmable instead of withheld, or the overlay slot gets
prioritized in Phase 8. Right now the ideas are silently discarded — better than broken
promises, but the third state (convert to filmable) is specced and not yet wired into the
writer’s output path.
G-E. Claiming a suggestion still skips the capability question (#555’s own “not built”
note): a creator who claims a suggested product never gets asked whether they can film
that product — it falls to the account default. Small UX cost to fix, and it’s the same one-
question-in-flow pattern as everything else.
G-F. Semantic repetition (the 67% defect) remains the largest unaddressed writer-
quality issue. Everything shipped so far catches lexical problems (ordinals, caps, clichés,
hook-menu degeneracy). The judge-based annotation pass (Wave 4, only auto-repairing on
the 3-0-validated trigger) is still the only evidenced route, and it’s not built. It’s also the
natural place to catch hook-vs-body duplication.
G-G. The editor remains the product’s missing organ — now with a working staging
harness. The #460 saga (zoom sweep: four controlled renders, INSUFFICIENT_EVIDENCE
→ INCOMPLETE_SWEEP honesty, donor-generation seam) shows Phase 8 is being proven
properly in the matrix. But the funnel truth from the first audit is unchanged: until the editor

GA’s, completed-video count stays where it is. Everything else in this audit is optimizing the
approach to a door that isn’t open yet.
G-H. The 5,700-line edge function is now a proven defect risk at the structural level.
The missing-brace bug (#541) put 71 lines inside the wrong if — a live defect invisible to
every reviewer and every test, found only because a new check happened to be wired
nearby. One file that large, in a language where a brace decides semantics, with
mechanically-copied inline modules, will produce this class again. Recommend: continue
the extraction the beatAsk/communityMap modules started — every new subsystem lives in
shared with a generated copy, and the monolith only shrinks; plus one structural test
asserting the top-level block map of index.ts (the brace-walking technique #541’s guard
already invented, generalized).
PART 3 — Writer quality: current state honestly scored
Dimension Then Now Remaining lever
Placeholder
beats
Fatal, 3/6
scenes Solved structurally Feed answers back to store
(G-A)
Hook
length/openers
Unchecked,
violated
Checked+repaired, all
5 —
Hook menu
variety Unmeasured
Measured (5/41
degenerate), noted to
creator
Decidable distinctness check
(G-C)
CTA/ending Could ship
unwritten Guaranteed written —
Timing Silent Disclosed Reference comparison +
writer budget (G-B)
Cliché/stock
phrases Prompt-only Phrase-lint, FP-tested
Tier-2 judged only if demand
appears (measured: 1 hit —
correctly not built)
Emphasis
channel
Mixed into
dialogue Split, feeds captions —
Semantic
repetition
67%,
unsolved Unchanged Judge pass (G-F) — now the
#1 writer issue

Witness/first-
person
evidence
Absent for
thin stores
Supply side shipped
(interview+meter+asks)
Observer-frame rule for
testimony formats not yet in
prompt
Visual ideas vs
capability
Broken
promises
Honestly withheld
(40%!)
Convert-to-filmable third
state (G-D)
PART 4 — UI/UX audit (what a creator feels, screen by screen)
Gallery: the reasons-not-scores and readiness lines are genuinely good («Your
products cover all 3»). Missing: a visible format control (“Talking to camera / Product on
screen / Any”), a “more like this” per card, and any affordance to say “this isn’t my
niche” (that signal would train discovery for free). The empty state routes to pasting a
link — right instinct, but it should also trigger seeded discovery so the shelf stocks itself.
Plan screen: ask-cards now exist, duration line now exists, shot cards have names,
proof direction shows performance notes. The remaining UX debt: the creator still can’t
answer an ask by typing here (G-A), and the honesty labels panel should become the
deep-analysis upsell surface per the tiered-analysis plan.
Teleprompter/Capture: the ask rendering as “say it in your own words” is a genuinely
elegant solve — improvised answers are usually more natural than read ones. Add: a
subtle marker on ask-scenes in the scene strip so the creator knows before recording
that scene N needs their own story (surprise mid-recording is the failure mode).
Dashboard: strength meter + own-account sample card are the right honesty surfaces.
They should link: “your twin knows 2 stories” → tap → the asked-question flow, one
question. (The meter says the nudge; make the nudge tappable.)
Cross-cutting: the product’s voice — counts not scores, silence not empty cards, “we
did not look at” labels — is now a genuine brand asset. Codify it: a one-page UI-copy
doctrine (never a percentage without a measurement, never a verdict from a partial
sample, absence ≠ zero) so new surfaces inherit it instead of relearning it.
PART 5 — Persona re-runs (same seven + two new)
P1 Ayesha (beginner, caption-only): Massively improved. Story interview fills the store
at signup; strength meter tells her the truth; asks reach her teleprompter. Remaining
pain: her gallery is still GaryVee (Part 1), and her spoken ask-answers evaporate (G-A).

Then: 2/10 → now: 6/10.
P2 Hamza (faceless): unchanged, structurally unsupported — but now measurably
wanted (40% withheld footage proofs). Honest “not yet” still not shown in-product.
3/10.
P3 Dr. Sana (professional): compliance rigor intact; community map irrelevant to her;
nothing regressed. 7/10.
P4 Bilal (e-com/product): “Sometimes” fix directly serves him; community map if he
runs one; product scenes still gated on the Product Library visit problem (0-row screen),
suggestion-claim skips capability (G-E). 5/10 → 6.5/10.
P5 Umar (comedy): unchanged; one beat grammar. Honest-mismatch labeling still
absent. 3/10.
P6 Fatima (deep transcripts): hooks fixed, duration disclosed; her #1 pain (repetition)
untouched (G-F); catalogue-awareness still absent. 6/10, flat.
P7 Ali (Urdu): unchanged; still the strategic wedge nobody’s built. 2/10.
P8 (new) Zara, niche craft seller (“resin jewelry for desi weddings”): her niche
resolves to… Beauty-ish? Business-ish? Her feed: GRWM and GaryVee. She pastes her
own references instead and never opens the gallery again. The Part 1 fix is entirely for
her.
P9 (new) returning weekly user, week 4: hooks no longer degenerate, scripts
complete, durations known — but premises start repeating across videos (no catalogue
awareness) and the gallery shows the same shelf as week 1 (no freshness). Retention
risk shifts from “product broken” to “product static.” Seeded discovery + catalogue-
aware novelty are the week-4 retention pair.
PART 6 — Ranked plan v2 (value ÷ cost, dependencies noted)
1. Gallery: stock-the-shelf (Part 1, items 1-2-4-6) — the user-visible product promise,
and it reuses scraper + analyzer + job queue wholesale.
2. Close the ask loop into the store (G-A) — typed capture on Plan now; ASR capture
when editor lands. Makes never-ask-twice true.
3. Reference-duration into the writer + Plan comparison (G-B) — one carried field; fixes
a measured 77%-miss problem at the input side.
4. Wire camera-at-screen conversion into the writer (G-D) — turns 40% withheld ideas

into filmable scenes; already fully specced.
5. Hook trigger-family distinctness check (G-C) — small, decidable, completes the hook
system.
6. Judge-based repetition annotations (G-F) — the last big writer-quality item; cost-
gated, async.
7. Editor GA path (G-G) — continues on its own track; everything above raises the value of
the day it opens.
8. Monolith decomposition discipline (G-H) — a standing rule, not a project.
9. Suggestion-claim capability question (G-E) — small.
10. Honest “format not supported yet” for faceless/comedy (P2/P5) — one screen,
protects trust.
PART 7 — Two things only you (Abdullah) can do, sitting in the
repo as blocked-on-owner
1. Vercel deploy hook (#527): the PR that stops wasteful preview deploys must not
merge until you (a) create a Deploy Hook on branch main in Vercel → Settings → Git,
and (b) add its URL as the VERCEL_DEPLOY_HOOK_URL secret in GitHub. Merged without
that, production deploys stop silently. The engineer correctly refuses to touch project
settings.
2. The Gemini key claim (#558): an earlier audit asserted a key was pasted into a session
transcript. The repo search found nothing, but absence there isn’t absence everywhere
— the row is deliberately held OPEN and only you can close it: either rotate the key in
the console (five minutes, ends the question forever) or confirm the original claim was
an audit error. Rotation is the cheap branch; I’d just rotate.