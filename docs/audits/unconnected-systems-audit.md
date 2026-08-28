# TwinAI — Unconnected Systems Audit

_Source: uploaded PDF, committed verbatim (text-extracted). Covers subsystems built but not wired to a live caller._

---

TwinAI — The Unconnected Systems Audit
Every subsystem that is built, tested, correct, and not delivering value — with the
exact reason it’s disconnected, what it would take to connect, and what it’s worth.
Verified against the live code, not the docs.
 One correction before the list, because it changes the top item and I’d rather correct
myself than repeat a claim: I said “WriterInput is built in shared and not wired.” That is
half wrong. generate-blueprint imports buildSlots, filledFrom and slotsReady from
the shared module at line 15 and calls all three (lines 4282–4322). What is NOT wired is
buildWriterInput itself — the five-key closed payload. See §1 for what that distinction
actually means, because it’s more interesting than the simple version.
The four categories of disconnection
Each item below is one of:
NO CALLER — code exists, nothing invokes it
NO DATA — code runs, the table it needs is empty
NO FLAG — code runs in staging, a switch is off in production
PARTIAL PATH — some of the chain is wired, the payload-shaping half isn’t
§1 — buildWriterInput: PARTIAL PATH (not “no caller”)
What’s actually true. The edge uses the resolution half of the module: it resolves the
container template, computes filledFrom, builds slots, records slots_resolved /
slots_total into the audit, and passes resolvedSlots to validateScript. So slot
resolution is live and measured.
What isn’t: the writer is still handed the assembled mega-prompt (CREATOR DNA blob +
knowledge block + claim rules + do-not-use + evidence + community + container block),
not the five-key WriterInput. The module’s own opening comment is the diagnosis: “a
model given ninety-four fields does not weigh them, it picks.”
Two live consequences, visible in the code:

1. Two validator checks report not_run in the normal case. all_slots_filled and
no_unsupported_claim only run when resolvedSlots !== null && slotsReady(...) —
and slots resolve only for an assessed reference with a known container. Since almost
no references are assessed, the two checks that would catch invented content are
structurally idle on most generations. The code is honest about this (not_run is
recorded as its own state, never as a pass) — but the practical effect is that the
strongest correctness checks in the writer path rarely fire.
2. buildWriterInput’s refusal never happens. Its stated purpose: return null when a
slot is still owed something, so “the writer is never called on an unresolved container —
the cheapest moment to discover a video cannot be made is before anybody is charged
for it.” Today the writer is called regardless, and the unresolved beat becomes a
needs_user ask or a general beat.
To connect: the blocker is real and worth naming — generate-blueprint has its own inline
style shape and cannot produce a StyleProfile, which buildWriterInput requires. (The
module says so explicitly, and says a function demanding one “would have been copied
there rather than called, which is exactly how six copies of the substance rules came to
exist.”) So the wiring order is: (a) make the edge’s inline style compiler emit a real
StyleProfile via the generated-copy mechanism, (b) call buildWriterInput, (c) render
the prompt from the five keys, (d) keep the mega-prompt behind a flag for one release to
A/B on the blind panel. Worth: this is the prompt-bloat fix, the generic-voice fix, and the
“monolith brace bug” structural fix in one. Highest-value engineering item not blocked on
you. Dependency worth stating: its value scales with assessed references — which makes
gallery Pass 1 a prerequisite, not a parallel track.
§2 — product_entities: NO DATA (severity: total, for its whole
subsystem)
Zero rows in production. Written from exactly one place — a tap on the onboarding confirm
step. Every generation therefore takes the unrecordedProduct branch: “do NOT write a
scene that depends on a product.” Everything downstream is correct and inert: claim
rules by relationship, showability gating, evidence read-only vs on-screen, slotFill’s
“your products cover all 3” , the community map, product scene guidance. To connect: in-
flow capture — ask the first time a script needs a product fact, one question, under
something the creator already wanted. (Same pattern that made the story interview work;
same wall that made the Product Library a complete feature with zero rows.) Worth:
unlocks an entire built subsystem for every commercial creator.

§3 — ensureBrandTruthSnapshot: NO CALLER
The producer exists in supabase/functions/brand-truth, is idempotent by digest, byte-
parity-guarded against its shared copy. creativeTransferPlan refuses any plan whose
brandTruthSnapshotId/sha256 the server didn’t issue — and nothing issues one, so
those mismatch checks have never been able to fire. The ledger’s own words: the lineage
was decorative from the day it landed. To connect: one call in the blueprint flow before plan
construction. The ledger notes the reason it stalled — it touches generate-blueprint,
owned by another session. Worth: turns a dead anti-hallucination guarantee live.
§4 — script_edits → edit learning: NO DATA
0127_script_edits is append-only and correct. classifyEdit (rewritten / made_concrete
/ made_personal / tightened / expanded, with unclassified as a real answer) and
deriveLessons (three selection-changing actions, deliberately never prompt text) are
complete and tested. 0 rows. Gates: 20 pairs per creator, 100 global. Also missing (G36’s
own note): “accepted final.” Two edits to one line leave two pairs and no record of which
text was actually recorded — so a pair says what someone tried, not what they kept. To
connect: needs recording usage, plus a small write when a take completes binding the
recorded text. Worth: the only non-circular quality signal you can accumulate. Every
reranker/judge idea waits here.
§5 — hook_choice provenance: NO DATA (and a permanent partial
loss)
0134 records how a hook value arrived (creator | default | freeform). Usable preference
rows today: 8, not 23 — 14 were auto-written defaults, correctly not backfilled because “a
fabricated preference is worse than a missing one.” To connect: usage only. Worth: at ~100
real picks, hook reranking becomes possible; below that it learns your own account’s habits.
§6 — Editor v2: NO FLAG (+ NO FOOTAGE)
Renderer proven in the staging matrix (Phase 8 A1–A18); Phase 9 render-truth layer
complete 10/10. Never completed a run in production. Gates: EDITOR_V2_START_ENABLED
(edge), EDITOR_RENDER_ENABLED (worker env), and real recordings. Worth: the product’s
missing organ. Also unblocks §4’s data and the ASR gate.

§7 — Gallery assessment: NO DATA (~1% coverage)
Pass 1 assessed ~35 of ~3,500 references; Pass 2 (visual profiles) not started. Every
eligibility rule, refusal, and format-match in galleryPolicy/galleryRank/decideGallery is
wired to the live page and skips on unassessed cards — which is ~97% of them. Also
gates §1 (slots resolve only for assessed references) and leaves the ~20% no_speech
references invisible entirely. Worth: the user-visible “wrong videos” complaint, plus a
hidden dependency for the writer rebuild.
§8 — Speech polisher: NO MODEL CALL
Contract and speakability measurement built in shared (speechPolish.ts); the model call
isn’t. Sits between writer and validator in the rebuild pipeline. Worth: directly serves “easy
to speak aloud,” one of the four stated targets of a good Twin script.
§9 — Per-video capability override: now connected (was the
flagship instance)
D3’s classic: resolveCapabilities documented per-video precedence, loadCapabilities
read it, and nothing wrote it — so the rule could never fire. saveVideoCapabilities now
writes it. Keeping it on this list as the reference case: this is exactly what the other eight
look like before they’re fixed.
§10 — Smaller instances worth clearing
Item State Note
Substance Packet Built, deliberately NOT wired 12–12 blind result; correct to
leave unwired
containerSupply
refusal
Measured, deliberately NOT
shipped as a stop Would refuse 25–100%; correct
Conditional span repair Built, NOT shipped 10–14 loss; payoff branch
explicitly forbidden

surface_forms (G35) Wired, unvalidatable Needs re-scans; production
shows six merges ever
Claimed-suggestion
capability question NOT built (#555’s own note)Small, real hole
enqueue-autoedit
tombstone
Deployed past its removal
condition Re-check edge logs
Transcript-as-editor
review gate Contract built, screen not Phase 10 item 4
The pattern, and the one rule that would stop it
Nine of these are the same defect wearing different clothes — the ledger’s G1 class: written,
stored, displayed, and read by nothing, found nine times in one session, three of them
introduced by the changes that fixed the others. The existing guards work against the
field-level version (walk the interface, demand a reader). What has no guard is the
subsystem-level version: a module with tests, no production caller, and no owner.
The rule that would catch these: a CI check listing every exported entry point in
packages/shared and supabase/functions/_shared with zero non-test callers, failing the
build unless the module carries an explicit @unwired annotation naming what it waits on
and who decides. That converts “somebody will wire it later” — which produced this entire
list — into a declared, reviewed debt, exactly as counter_ephemeral did for expiring
counters and the exclusion note did for skipped migrations. The precedent for it is already in
the repo twice; this is the third place it belongs.
Order I’d actually do them
1. Flip the editor flags + record footage (§6) — unblocks §4, the ASR gate, and every
“model judging model” caveat.
2. In-flow product capture (§2) — one question, unlocks a whole correct subsystem.
3. Gallery Pass 1 completion (§7) — user-visible, and prerequisite for §1.
4. buildWriterInput wiring (§1) — after §7, so slots actually resolve; brings the two idle
validator checks online.
5. ensureBrandTruthSnapshot caller (§3) — small, closes a dead guarantee.

6. “Accepted final” write + claimed-suggestion capability question (§4, §10) — small,
both unblock data.
7. The @unwired CI check — so this list can never quietly regrow.