# TwinAI — Complete Ground Reality Audit

_Source: uploaded PDF, committed verbatim (text-extracted)._

---

TwinAI — Complete Ground-Reality Audit
Scope of this pass, stated honestly up front: the previous audit read the last ~30 merges.
This one reads the system: the repo tree (every app, package, worker module, edge
function, job handler), the writer’s prompt assembly, the live Gallery source, and — most
importantly — the project’s own long-form record: twinai-build-state.md, twinai-open-
items-ledger.md (sections A–G37), known-limitations.md, ai-editor-rebuild-
status.md, SECURITY.md, ARCHITECTURE.md.
One methodological note that changes the conclusions: this codebase documents its
own defects better than almost any I’ve read. Several things I reported as gaps in earlier
audits are recorded here as already found, measured, and in some cases disproven. Where
my earlier claims were wrong, they are corrected below and marked 
 CORRECTION.
PART 1 — What the system actually is (inventory, not
impression)
Layer Contents Notes
apps/web
21 pages (Studio/Result, Gallery,
Onboarding, ProductLibrary,
Calendar, History, Metrics,
ReviewApproval,
PilotVisualStart/Review,
OwnerConsole, Billing, Brands,
Settings, Landing, WatchedSession,
ClientReport, JoinWorkspace, Auth,
Dashboard) + v2/ capture flow
Far larger than a “video
tool” — this is a full creator
platform incl. client
reporting and multi-brand
packages/shared
~110 modules + editor/,
script/, gate/, pilot/
subtrees
The real brain: knowledge
selection, claim
entitlement, container
templates, gallery policy,
product entity/evidence,
community map, shot
grammar, screen-capture
conversion, twin strength,
style compiler

worker/src 40 modules + 54 job handlers
Editor v2 pipeline is ~25 of
those handlers (analyze →
speech → visual → align →
director → compile →
render → validate →
complete)
supabase/functions 24 edge functions
generate-blueprint is the
monolith; brand-truth,
pilot-* , editor-output,
source-asset, start-editor-
v2, review, social, billing,
referral
supabase/migrations 173+ (0173 referenced) Heavy RLS/constraint
discipline
discovery/ Python service (Dockerfile, deploy-
vps.sh)
Separate gallery-discovery
service on the VPS
eval/, scripts/qa/ Eval harness + QA instruments
detect-repetition, read-
hook-choices, derive-
knowledge, run-eval
docs/ 48 documents
Including a self-
maintaining status page
and a 37-section findings
ledger
postiz/ Publishing integration
PART 2 — 
 CORRECTIONS to my earlier audits (ground truth
wins)
C1. “Phase 8 / the renderer doesn’t exist. ” — Wrong now, and partly wrong then. The
worker holds a full editor v2 pipeline: editorCompile.ts, editPlanContract.ts,
ffmpegGraph.ts, editorRender.ts, editorRenderStage.ts, editorValidateOutput.ts,
editorComplete.ts, plus director contract/provider and a disfluency-acoustics module.
The ledger’s section A confirms A4: “The real renderer produces a real video” — matrix
#223, Phase 8 A1–A18. Phase 9 (the render truth layer: caption emphasis, brand colours,
zoom time-gating, loudness, language pin, face-aware zoom) is marked COMPLETE 10/10.

The accurate statement is narrower and still serious: the renderer works in staging, and
C7 records that editor v2 has never completed a run in production. The remaining gate
is not code — it is two flags (EDITOR_V2_START_ENABLED on edge, EDITOR_RENDER_ENABLED
in the worker env) plus real footage.
C2. “No b-roll is a gap to close. ” — Wrong framing. twinai-build-state.md §5 lists “No
B-roll” as a standing rule — “an explicit product scope decision, not an omission.” My Fix
12-B (build overlay support) argued against a decision already deliberately made. The
correct recommendation is the one that survived: convert unfilmable proofs to camera-at-
screen (which #552 already does by withholding, and screenCaptureConversion.ts now
exists in shared).
C3. “The gallery ranking machinery is fine, only inventory is wrong. ” — Half right, and
the repo says it sharper. Build-state §4 states: “The screen — NOT BUILT, and this is the
gap that matters most. GalleryCreatorView, the eligibility rules, the refusals and the
ranking all work in tests and reach no creator.” Since then the Gallery page has been
wired (I read the live wiring). So the current true state is: wired, but starved — Pass 1
assessed ~35 of ~3,500 videos (“The remaining ~3,500 videos — NEXT”), and Pass 2
(frames → visual profile) is NOT STARTED. My inventory diagnosis holds; the fix is already
the repo’s own declared next step.
C4. “The Gemini key needs rotating” (I said just rotate it). — Still true, and there’s a
second, more serious one I missed: build-state §6 lists “Rotating the leaked service role
key — blocked on the owner.” A leaked service role key is categorically worse than an API
key: it bypasses RLS entirely. That is the single highest-severity open item in the entire
repository and it is assigned to you.
C5. “Repetition is unaddressed. ” — Accurate, but the repo has gone further than I
credited: G17 tested four detectors (none separate repetition from same-topic), then
measured a prompt rule as exactly inert, then G18/G20 built and blind-tested a conditional
repair across 96 scripts — and the payoff branch lost 1–6, with an explicit instruction: do
not build the payoff branch. Only 2+ substantive won (3–0, n=3). So “build a judge repair
pass” is not a fresh idea here; it is a partially-answered question where the answer so far is
mostly no.
PART 3 — The findings that matter most, from the system’s
own record
3.1 The founding defect, in the repo’s own words

“Twin writes voice-accurate, content-empty scripts. It learns how a creator sounds and
then has nothing for them to say.”
Everything below is either closing that or is scaffolding for closing it. This is the correct
diagnosis and it is still the live one.
3.2 The one intervention with human evidence — and the pattern it proves
Intervention Kind Blind panel result
Prefer spoken/transcript material (#376) changes the input 17–7 win
Substance Packet restructures the input 12–12
Routed span repair edits the output 10–14 loss
Beat-plan prompt rule naming the top defect instructs the writer exactly inert
Strategic conclusion, now supported by four experiments: stop spending on prompt
instructions and output repair. Every unit of effort belongs on what reaches the writer.
(This is also why my “creativity via prompt” suggestions in the last audit were the wrong
shape — the named-devices/schema version survives, the exhortation version does not.)
3.3 The supply ceiling, quantified
Captions: 374 items → 13% substance, ZERO experiences ever. Transcripts: 178
items → 78% substance, 50 experiences.
Transcript-only stores: 73% grounded / 8% generic vs 58% / 23% mixed.
G25: two transcript-budget raises never reached production — a downstream
.slice(0, 5) capped every scan at 5 videos since 2026-08-04, so every “we raised it
to 10/25” claim measured five. Now fixed; TikTok at 25, paid platforms deliberately held
at 5.
G11/G12: enumerated formats (“top 7… ”) would refuse 25–100% of creators — and
of 302 enumerable items across 17 real creators, 302 were bare product mentions,
zero were claims/experiences/examples. So list-shaped references are structurally
unsupportable for caption-only creators today.
3.4 Preference data — the bottleneck for every ranking idea
selected_hook: 23 rows, but 14 of 23 were auto-written defaults (Result.tsx wrote
the recommended hook on page load). Usable signal: 8 rows. Provenance now recorded

(0134); the 14 are a permanent, deliberately un-backfilled loss.
script_edits: 0 rows. The edit-classification and lesson-derivation machinery
(G33/G36) is complete and cannot fire; trigger is 20 pairs for one creator.
G36’s remaining hole: no “accepted final. ” Two edits to one line leave two pairs and
no record of which text was actually recorded. Until that exists, a pair records what
someone tried, not what they kept.
3.5 The recurring structural defect, now a named class
G1: nine instances in one session of a field written/stored/displayed and read by nothing —
and three of those were introduced by the changes fixing the others. The response was
correct (guards written against the rule, not the instances), and the class keeps producing:
D3’s per-video capability writer, C3’s BrandTruthSnapshot caller, G35’s
recordSurfaceForms (caught only by mutation). G34 is the sharpest lesson in the repo: a
migration’s own comment forbade adding an overload, and create or replace with a new
parameter created one anyway — leaving two live functions where callers could silently write
incomplete data. Prose didn’t prevent it; the verification query caught it. And a test was
asserting the bug.
3.6 Measurement integrity — the repo’s real moat, and its scar tissue
At least six metrics were found broken by their own authors: the 186/192 proof classifier
(true figure 61%, not 97%), Jaccard-vs-containment on unequal lengths (reported “100%
unused” on scripts visibly quoting the item), the $50K/$50,000 normalisation false
positive, “1.5M views” parsed as 1.5, the pooled hook-pick rate hiding the house account,
and the harness running a stale selector for three studies (G22).
“The measuring instrument is part of the experiment.” This is why I now treat every
quality percentage in this system as provisional unless the ledger says it was re-verified.
PART 4 — The real open gaps, ranked by what they block
Tier 1 — Blocked on you, and everything waits behind them
1. Rotate the leaked SERVICE ROLE key. Highest severity in the repo. Bypasses RLS
entirely. (Also: the Gemini key, per E and #558 — that one is a claim held OPEN because
it can’t be verified either way; rotating closes it in five minutes.)
2. Vercel deploy hook (#527 must not merge before it exists, or production deploys stop
silently).

3. Record real footage. Build-state §5 standing rule: “Real footage before more features.
No human has recorded a video yet.” This single act unblocks: editor v2’s first
production run (C7), the 12-user quality gate, ASR validation on real recordings,
script_edits supply, “accepted final” , and the §4a success criterion that matters —
script → recording started → recording completed.
4. The 689 explore/tags/ hashtag rows — hide/delete/leave, owner decision.
Tier 2 — Built, complete, and cannot fire (unblock by usage/wiring)
5. script_edits = 0 rows → edit-type learning inert (G33/G36).
6. product_entities empty in production → slotFill has nothing to match for a real
person; Product Library is a complete feature with zero rows because it waits to be
visited (the same wall as the below-the-fold questions).
7. ensureBrandTruthSnapshot still has no caller (C3) — the lineage checks in
creativeTransferPlan have never been able to fire.
8. WriterInput (the “writer gets five things, not the account” rebuild, §4a item 5) is done
in shared and NOT wired into generate-blueprint — the single biggest architectural
improvement to the writer is sitting complete and unconnected.
9. Speech-polish contract built; the model call is not (§4a item 6).
Tier 3 — Not built, and named as the biggest product risks
10. Preflight before recording (Phase 11 item 6) — room echo, backlight, orientation, head
cropped, mic source. The panel called this its #1 gap: “nothing in the pipeline addresses
the actual failures of video #1.” For a product whose success metric is recording
completed, this is the highest-value unbuilt feature in the repo.
11. Edit the script before filming (Phase 11 item 8) — NOT BUILT. A creator who dislikes a
line has no path except recording it.
12. Output variation / 3 moods (Phase 13 item 15) — NOT BUILT; “don’t all look the same”
is half done.
13. Transcript-as-editor review gate — contract built, screen is not (Phase 10 item 4).
14. Gallery Pass 1 completion (~3,500 videos) and Pass 2 (visual profiles) — Pass 2
NOT STARTED, and the pilot’s ~20% no_speech rate means those references are
invisible to Twin entirely today.
Tier 4 — Measurement/pilot integrity

15. PILOT_COHORT_IS_NOT_THE_PRODUCT_PATH — OPEN. The first visual pilot cohort was
drawn from no_speech references only — i.e. montage and B-roll, not the talking-head
videos the product exists to remake. talkingHead was false on 8 of 8; 16 claims
discriminate nothing. The labels are real evidence about reading B-roll and must never
be pooled with the with-speech cohort. The with-speech draw is your Start button
(#475 ships the selection).
16. TALKINGHEAD_LOOSER_THAN_INDUSTRY — OPEN, correctly deferred to cohort boundary;
the shotType field lands with the analyzer version bump and is not retroactive.
PART 5 — The writer, judged against the system’s own rebuild
plan
§4a defines the target pipeline: PREMISE SELECTOR → SMALL CDP → CONTAINER RESOLVER →
RESEARCH → WRITER (five inputs) → SPEECH POLISHER → VALIDATOR. Items 1–4, 7, 8 are
done; item 5 (writer receives resolved inputs only) is done in shared but not wired; item 6’s
model call isn’t built; item 9 — “a real creator records 10 videos” — is not started and
gates everything.
So the honest state of the writer: the intelligence to feed it correctly exists and is not yet
connected to it. generate-blueprint still assembles the “whole DNA blob” prompt the
rebuild was designed to replace — which is also why the AI-voice problem I audited last turn
persists: the writer is receiving ninety-four things (many of them “NONE STORED — infer”)
instead of five resolved ones. Wiring WriterInput is simultaneously the fix for prompt
bloat, the missing-brace class of defect (G-H), and a meaningful share of the generic-
voice problem. It is the highest-leverage engineering item that is not blocked on you.
PART 6 — Security & operations, current
Verified strong: RLS everywhere with policy-backed verbs (0172/0173 revoked TRUNCATE
and a stray DELETE — “absent is not zero”, the matrix never had the table); service-role-
only money paths; CORS wildcard now premise-guarded (the build fails the day any
function reads a cookie while wildcarded, which is the right shape — an origin allowlist
would have stopped nothing and broken previews); per-account monthly scan ceiling with
an append-only ledger and no UPDATE/DELETE policy; delete_generation now actually
purges media (previously ON DELETE SET NULL meant every raw take survived a deletion
that appeared to succeed).

Open: the leaked service role key (Tier 1); consent capture for recordings still deliberately
not built (correctly — a consent table with no writer is the same defect class); the enqueue-
autoedit 410 tombstone has outlived its stated removal condition and should be re-
checked against edge logs.
PART 7 — What I’d do, in order
1. Rotate both keys today. Service role first. (Five minutes; highest severity in the repo.)
2. Create the deploy hook, then let #527 merge.
3. Record ten videos yourself this week. It is the gate on §4a’s entire success criterion,
on editor v2’s first production run, on script_edits, on the preference corpus, and on
every quality claim currently resting on model-judging-model. Nothing else you can do
buys as much.
4. Wire WriterInput into generate-blueprint — the completed rebuild that never got
connected; fixes prompt bloat, voice genericness, and the monolith’s structural fragility
at once.
5. Build preflight (Phase 11 item 6) — the panel’s #1 gap, and directly serves the one
metric that defines success.
6. Finish Gallery Pass 1 (~3,500 refs) and start Pass 2 — with the with-speech cohort
drawn separately and never pooled with the no_speech pilot.
7. Wire ensureBrandTruthSnapshot’s caller and close C3’s decorative-lineage gap.
8. Then, and only then, revisit repetition — with the payoff branch explicitly excluded per
G20, and only the 2+ substantive trigger under test.
And one standing recommendation: twinai-build-state.md and the ledger are the most
valuable engineering artifacts in this company. They caught six of my own errors in this
audit. Keep the rule at the top of the status page — keep it honest or delete it — enforced.