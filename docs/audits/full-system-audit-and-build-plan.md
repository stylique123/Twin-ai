# TwinAI — Full System Audit & Build Plan

_Source: uploaded PDF, committed verbatim (text-extracted). Covers the full core loop across onboarding, DNA, product, recording, and editor — broader scope than the scripting-specific audits above._

---

TwinAI — Full System Audit & Build Plan
Prepared for Abdullah — pulled directly from the codebase, migrations, docs, issues,
and the engineering team’s own production logs. Nothing here is speculation; every
finding cites where it came from.
0. The one-sentence verdict
TwinAI has exceptional engineering discipline (rare at this stage) wrapped around a
product that cannot yet complete its own core loop in production. The team has been
unusually honest with itself — this audit is only possible because they documented their
own failures in obsessive detail. That honesty is your biggest asset. The gap between
“impressive engineering” and “a tool creators trust with their content and their views” is
closable, but it is not small, and it is not just code — some of it is product philosophy.
1. The core loop — what’s supposed to happen vs what happens
today
The promised loop (from ARCHITECTURE.md):
What’s actually connected right now:
Stage Status Evidence
Learn your
voice (DNA
scan)
 Works, but
knowledge quality
is thin
See §2
Find a
reference /
Gallery
 Works Curated gallery, remix flow live
Blueprint
(script
 Works, quality See §3
learn your voice → find a reference → blueprint → record → AI edit → publish → analytics

generation) ceiling identified
Record
  Now works Upload timeout + WebM duration bugs fixed
(commits #414-415)
AI Edit
  Does not exist
in production
Phase 8 (compiler→render) — issue #206, confirmed
“editor v2 has never completed a run in production”
Publish
  Partially wired
(Postiz) Not the current bottleneck
Analytics
  Partial Behind publish
The number that matters most: as of the last funnel read, 0 recordings have ever been
successfully edited and exported. 41 scripts generated → 2 people opened a camera → 0
finished videos. The upload bugs blocking that are now fixed, but the thing they’d unlock —
Phase 8, the actual renderer — doesn’t exist yet. Right now, even a creator who does
everything right cannot get a finished video out of TwinAI.
This is the single fact that should drive prioritization above everything else in this document.
2. Intelligence & DNA extraction — is it actually smart?
This is where the team’s own measurement work is gold — they ran real A/B experiments on
real creator data instead of guessing. Key findings:
2.1 What the “brain” is actually made of
Captions are nearly worthless for substance. 374 caption-derived knowledge items
→ 13% substance, 0 experiences. Zero. Not “few” — none. A creator’s captions can
never produce a story, an opinion, or a lived claim.
Transcripts are where the intelligence lives. 178 transcript items → 78% substance,
50 experiences, 23 with real numbers.
The paid-vs-free asymmetry was mispriced for months. TikTok transcription is free
(local Whisper); YouTube/Instagram cost money via Apify. The system capped all three
at the same budget (10 videos) — meaning the free, high-quality source was being
artificially throttled to match the expensive ones. Fixed, but only in the last session
(TikTok raised to 25).
A silent bug meant only 5 videos were ever actually transcribed, regardless of
what the budget said (5, 10, or 25). A downstream .slice(0, 5) overrode every

budget increase for weeks. Every “we raised the transcript budget and it helped” claim
from that period was actually measuring 5 videos, not 10 or 25. Found and fixed, but it
means months of tuning happened on the wrong denominator.
2.2 “More knowledge” made scripts worse — and they found out why
This is the standout finding. Giving the AI writer more of a creator’s derived knowledge
dropped script grounding from 63% → 52%, because low-value caption-derived items
(topic, product mentions) crowded out the creator’s real claims and experiences on pure
keyword-overlap ranking. Selection quality matters more than knowledge quantity —
and this was only caught by measuring, not by intuition.
2.3 Repetition is the #1 quality complaint and it’s structurally hard to fix
A blind creator-panel review found 67% of scripts restate an earlier beat — the single
most common flaw. Four different detection methods were tried (lexical overlap,
embeddings at multiple thresholds, beat-plan analysis); none reliably separates “repeats
itself” from “stays on the same topic, which it should.” A prompt instruction telling the
writer to avoid repetition was measured and found to be exactly inert — zero effect.
This is a real open research problem, not a quick fix.
2.4 Every “smarter prompt” idea tested this way failed; every “better input”
idea worked
This is the most important strategic finding in the entire codebase:
Intervention type Result
Prefer spoken (transcript) material over captions in
selection
17–7 win in blind creator preference
— the only clear win
“Substance Packet” (pre-structuring facts into an
argument before writing) 12–12, coin flip
Targeted AI repair of weak beats 10–14 loss, net negative
Prompt instruction naming the #1 defect explicitly Exactly zero effect
Lesson for your roadmap: stop trying to prompt-engineer your way to better scripts.
The lever that works is fixing what data reaches the model, not how you talk to it.
2.5 The knowledge system has a “write it, nobody reads it” disease — 9+
separate instances

Documented directly by the team (docs/twinai-open-items-ledger.md, section G1): fields
get built, stored, displayed — and never actually read by anything downstream, or vice versa
(read by something with no writer). Examples: a product_entities table with no writer; a
per-video capability override that could never fire because only the account-level default
was ever written; a “proof” field displayed to creators that was wrong 39% of the time
because a classifier bug inflated its own accuracy score. This is a recurring architectural
failure mode, not a one-off bug — worth a standing engineering practice, not just a patch
(see Build Plan §8).
2.6 Measurement instruments were themselves broken, repeatedly
At least 4 separate quality metrics were found to be measuring the wrong thing (one metric
reported “100% of supplied knowledge unused” on scripts that visibly quoted it, due to a
denominator bug). The team’s own conclusion, stated plainly in their docs: “the
measuring instrument is part of the experiment. ” Take every historical quality percentage
in this codebase with that caveat until it’s been independently re-verified.
2.7 Every quality counter that was supposedly “live” evaporates in days
Nearly every telemetry counter in the system was writing to ephemeral edge function logs
(days of retention), not a database. Months of “we’re tracking this” were actually tracking
nothing retrievable. Partially fixed with a durability guard (check_counter_durability.mjs)
that now forces every new counter to declare where it lives and for how long — good
practice, applied too late to a lot of history.
3. Scripting quality — client-facing verdict
What’s genuinely good: The scripting pipeline enforces real discipline — citations must
trace to real supplied knowledge, numbers can’t be invented, unsupported claims get
flagged, “beat plans” are shootable rather than generic. This is meaningfully more rigorous
than a naive GPT wrapper.
What’s not good enough yet, in a creator’s actual hands:
1. Repetition (67% of scripts) — see §2.3. Unsolved.
2. 59–74% of a creator’s own supplied knowledge never makes it into the script.
Partly by design (a 5-beat script can’t say everything), but it means selection quality —
which facts get chosen — is now the main lever, and it’s under-tuned.
3. The hook-picker’s “learning” data was mostly fake. selected_hook — the field
meant to learn which hooks creators actually prefer — was silently defaulted to “the first

option shown” whenever a creator didn’t explicitly pick one, to avoid an empty column.
Of 23 rows, 14 were indistinguishable from this default. The real preference signal was
8 rows, not 23, and any reranking model trained on this would have learned “creators
like whatever we show first” — a fabricated finding. This was found and fixed
(provenance now recorded), but it shows how easy it is for this system to quietly lie to
itself about what creators want.
4. A citation-integrity hole is still open: a script beat can cite a real, correctly-sourced
piece of knowledge while still asserting a fabricated number, and nothing currently
catches it if the number doesn’t literally appear in the reference video. Partial fix
shipped for the reference-leak case; the general case (“invented number, citing an
unrelated but real fact”) is unmeasured.
5. Creator answer-a-question flow (the highest-quality knowledge source, better
than transcripts) exists but has near-zero data, because it’s brand new and adoption
is unmeasured.
4. The editor / renderer — the actual bottleneck
Phase 8 (Decision → EditPlan → FFmpeg render → validated MP4) does not exist in
the repo. No render code, edit_plans table empty (issue #206).
Two hard pre-beta gates are still open:
#193 — ASR (speech-to-text) has never been validated on real user recordings, only
synthetic fixtures.
#204 — No formal 12-real-user consented quality test has happened. This explicitly
blocks any beta launch.
Infra isn’t stable enough to safely load-test rendering yet (#203 — an unrelated
container on the same VPS was restart-looping, which would corrupt any render
capacity benchmark).
Two research-grade bugs show real fragility in the “smart editing” layer:
#302 — A disfluency-detector’s floor value is mathematically unreachable because
an upstream VAD setting silently deletes short segments before the detector ever
sees them. Found by reading code, not by any test (the tests fake their own input
data instead of running the real pipeline).
#303 — On the first real human recording ever run through it, the “um/uh” filler-word
detector flagged the real phrase “this week” as a filler word. The two signals meant

to be independently robust turned out to share a blind spot.
Bottom line: the “shoot it, edit it, post it” promise in your prompt is currently
unbuildable end-to-end, because the middle step (edit) is vaporware in production.
This is not a tuning problem — it’s an unbuilt phase.
5. Buttons, dead ends, half-cooked things — the “reader with
no writer” catalogue
The team’s own ledger names this pattern nine separate times in one work session alone.
Consolidated list of things that look wired but are dead ends today:
Feature What’s broken
Per-video “can’t
record my screen”
override
UI existed; nothing ever wrote the per-video flag, so it silently
always fell back to the account-wide default — a creator on a
borrowed laptop had no way to answer “just for this video.” Fixed in
the last session.
Product Library /
product knowledge
screen
Fully built, correctly designed, zero rows in production — it’s a
screen nobody visits, so the intelligence behind it is unused.
BrandTruthSnapshot
(brand-fact lineage /
anti-hallucination
pinning)
The producer exists and works. Nothing calls it yet. The
consumer-side checks that depend on it have never been able to
fire.
Approval → published-
post binding
Built and enforced now, but for most of the product’s life, “a
creator approved this video” and “this is the video that got posted”
were two unconnected facts — a security-relevant gap (a malicious
client could have pointed a scheduled post at someone else’s
video) that’s now closed.
Consent for
recordings
Deletion is built. Consent capture is not. A consent table with no
writer is exactly the “half-built” pattern to avoid — don’t add it until
the actual recording UI moment exists.
Editor cost/economics
tracking
Measurement code exists; the two most expensive line items (VPS
compute, egress) aren’t tracked anywhere and can’t be derived.
Every render currently looks “free” in the system’s own accounting.
No budget gate exists — nothing would stop a render from being
uneconomical at scale.

Script-generation
failure logging
If the AI script call fails (timeout, bad JSON, model refusal), no row
is written anywhere. You cannot currently answer “how often
does script generation fail, and why?” from the database. (Recently
partially fixed via script_attempts.)
Edit-pair / rewrite
learning loop
Built to capture “creator rewrote line X to line Y” — the richest
signal for learning creator voice preferences — but the table holds
0 rows in production. Nobody has wired the capture point into the
live editor yet.
6. Security — real state, not aspirational
The good news: there’s an actual security model, three-reviewer panel process, and RLS
(row-level security) on every table. This is more rigor than most pre-seed products have.
Verified strong:
Tenant isolation via RLS + auth.uid() — checked, not just asserted.
Money-moving operations (credits, billing) are service-role-only, audited RPCs — never
reachable from a browser.
Secrets are correctly tiered (browser only ever sees the public anon key).
Rate limiting exists on paid AI/scraping calls (prevents a malicious script from burning
your Gemini/Apify budget).
Real gaps, in order of severity:
1. A CREATE OR REPLACE FUNCTION migration silently created a permission overload — a
security-relevant Postgres function ended up with two live versions (5-arg and 6-arg)
simultaneously, meaning some callers were silently writing incomplete data while
appearing to succeed. Caught by a manual verification query, not by any automated
check. This is a general risk pattern for your migration process, not a one-off.
2. CORS is wide open (*) — accepted as low-risk today because every endpoint requires
a Bearer JWT, but it’s flagged as unresolved hardening, not resolved.
3. No plan-based quota on total brand-voice scans per user — a user can scan any
public handle repeatedly; only per-minute rate limiting exists, not a cost ceiling per
account. At scale, this is a real cost-abuse vector.
4. The Gemini API key was pasted in plaintext in a session transcript and flagged for
rotation — worth confirming this was actually done, since leaked keys in any historical

log/transcript are a standing risk until rotated.
5. Consent-for-recording-a-real-person’s-face is not built. Given the product literally
uses AI on someone’s likeness and voice, this is a legal/trust gap, not just a feature gap
— especially before any beta with real users.
7. Fail-at-scale premor tem
Assume you get the “millions of views” outcome you’re aiming for. Here’s what breaks first,
in rough order of when it would bite:
1. The renderer doesn’t exist, so scale is moot until Phase 8 ships. This is the blocking
premortem finding — nothing else matters until this is real.
2. Render concurrency is hard-capped at 1 per VPS by design (“initially” per the
architecture doc) — meaning at any real volume, every creator queues behind every
other creator for their video to render. This needs a horizontal scaling plan before any
real launch, not after.
3. No cost gate on rendering. Because compute cost per render is untracked, you have
no automatic way to stop a runaway rendering bill or flag an uneconomical customer
segment before the invoice arrives.
4. TikTok/Instagram scraping is adversarial and already fragile — the commit history
shows an ongoing cat-and-mouse fight with TikTok’s anti-bot system (impersonation
targets, residential proxies, blockbuster headers). This is inherently fragile infrastructure
that will need continuous maintenance as these platforms change their defenses —
budget for this as an ongoing cost, not a one-time fix.
5. Repetition and generic-script quality issues will compound at scale — if 67% of
scripts have a repeated beat today at low volume with careful attention, that number
won’t self-improve just from more users; it needs a real fix (see §2.3, currently
unsolved).
6. The “reader with no writer” disease will keep recurring unless it becomes a standing
process check (§8), because it’s already happened 9+ times independently — it’s a
pattern in how the team builds, not a single root cause.
7. Knowledge/DNA quality degrades for anyone whose primary content is caption-
heavy rather than talking-to-camera — 0% experiences extracted from captions
means creators who don’t narrate on camera get a structurally worse product, silently,
with no current warning to them about it.

8. No resumable/chunked upload — a genuinely interrupted large video upload restarts
from zero. At scale, on real-world mobile networks, this will be a top support complaint.
8. What this means for the “one trusted app for creators” vision
Your stated goal is specific and good: a private creative brain that scripts, shoots, edits,
and posts — trusted enough at scale that it becomes the reason creators get millions
of views. Measured honestly against that bar:
Scripting intelligence: Real, but capped by data quality (caption-heavy creators are
underserved) and an unsolved repetition problem. Not yet “knows you better than you
know yourself” — more like “a competent first-draft assistant.”
Shooting guidance: Exists (scene-by-scene teleprompter direction), functional.
Editing: Does not exist as a shippable feature yet. This is the single largest gap
between vision and reality.
Posting: Partially wired, not the current bottleneck.
Trend/market intelligence (“knows all trends, what creators need to make”): The
Gallery/discovery system finds viral references but there’s no evidence of a systemic
trend-prediction or “what’s about to work” layer — today it’s reactive (remix what’s
already viral), not predictive.
Trust at scale: Given the security and consent gaps in §6, and the fact that core
telemetry has been silently broken multiple times, “trust” needs the process fixes in the
Build Plan below before it can be a real claim, not just a marketing line.
9. Build Plan — sequenced to counter every gap above
Phase 0 — Stop the bleeding (1–2 weeks)
1. Confirm the Gemini API key rotation actually happened; audit all session transcripts/logs
for other leaked secrets.
2. Fix the VPS container restart-loop (#203) — nothing about capacity or rendering can be
trusted until the host is stable.
3. Close the CORS wildcard, or explicitly document why it’s staying open with an expiry
date to revisit.

4. Add a per-account scan quota (not just per-minute rate limit) to remove the scraping-
cost abuse vector.
Phase 1 — Ship the missing core: the editor (4–8 weeks, the critical path)
5. Build Phase 8 for real: Decision → EditPlan compiler → deterministic FFmpeg render →
validated MP4 output, exactly as scoped in issue #206 — freeze the EditPlan schema
first, benchmark render capacity on the actual VPS at 3 duration tiers before writing
more code, fix thresholds before seeing results (already correctly scoped by the team —
just needs execution).
6. Run the ASR real-recording validation gate (#193) before enabling the editor for anyone.
7. Run the 12-real-user consented quality gate (#204) before any beta — build the
consent-capture flow (currently missing) as part of this, since you need it for the same
recordings.
8. Only after 5–7 pass: turn on EDITOR_V2_START_ENABLED and EDITOR_RENDER_ENABLED in
production.
Phase 2 — Fix the intelligence layer where it’s proven to matter (parallel to
Phase 1, 3–5 weeks)
9. Ship the transcript-preference selector fix system-wide (already proven 17–7 in blind
testing) if not already fully rolled out — this is your one confirmed quality lever.
10. Do not spend more time on prompt-engineering fixes for repetition or grounding —
every test showed near-zero effect. Instead:
Build a real repetition-repair pass using the model-based judge approach the team
scoped but didn’t ship (costs one extra model call per generation — worth it given
repetition is the #1 complaint).
Increase adoption of the “ask the creator one question” flow — it’s the highest-
quality knowledge source with near-zero current usage. Consider surfacing it more
(still one question at a time, still dismissible — the team already learned that
batching questions kills response rate).
11. Wire BrandTruthSnapshot into the actual blueprint generation flow — it’s built and
unused.
12. Build a real cost-per-render tracker (VPS compute + egress) before scaling render
volume — you cannot manage what you can’t measure, and right now every render looks
free in your own books.

Phase 3 — Close the trust/scale gaps (parallel, ongoing)
13. Build the missing consent-capture UI at the actual recording moment (not before — the
team is right that a consent table with no writer is worse than not having one yet).
14. Add resumable/chunked upload for large recordings.
15. Build a horizontal render-scaling plan — the current 1-render-per-VPS cap will not
survive real launch volume.
16. Institute the standing process fix for the “reader with no writer” disease: no PR should
add a field, table, or UI control without a same-PR reader/writer on the other end. The
team already built an automated guard for counter durability
(check_counter_durability.mjs) — extend that discipline to a general “every new field
needs a proven reader in the same PR” CI check.
Phase 4 — Only after 1–3 are real: talk about scale and “millions of views”
17. Load-test the full loop end-to-end with real creators before any broad marketing push.
18. Build the trend-prediction layer if you want to move from “remix what’s already viral” to
“know what’s about to work” — this doesn’t exist today in any form.
10. The one-line priority if you can only do one thing next
Ship Phase 8 (the editor). Everything else — intelligence quality, security hardening, scale
planning — is optimizing a product that, today, cannot finish making one video for one
creator. Fix the thing that makes the loop actually a loop, then optimize.