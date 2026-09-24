#!/usr/bin/env node
// WHERE DOES THIS COUNTER LAND, AND HOW LONG DOES IT LIVE?
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// Three times in two days, in three unrelated subsystems, the same defect:
//
//   C8   a failed script generation left no row anywhere; the one durable
//        record was an ops_events row written when the REFUND failed. We
//        durably recorded the failure of the failure handler and not the
//        failure.
//   0130 `substance_route_shadow` — selection shape, starved flag, figure
//        counts — was a console.log. Edge logs expire within days, so a month
//        of production traffic would have left nothing to count.
//   0131 `beat_substance` carried G8's `entailment_gaps`, the counter whose
//        whole open question is a RATE across many generations. Same fix,
//        found by the same accident: writing the query that would read it.
//
// ⚠️ EACH WAS FIXED AS AN INSTANCE. This is the guard on the CLASS. The
// question it forces is not "is this counter good" — it is the one nobody
// asked three times running: **where does this land, and how long does it
// live?**
//
// ── WHAT IT DOES, AND WHAT IT DELIBERATELY DOES NOT ───────────────────────
//
// It cannot decide whether a measurement deserves a column; that is judgement.
// What it CAN do is refuse to let the question go unasked. Every structured
// event emitted from the edge or the worker must appear in the registry below
// with a classification and a reason. An unlisted event fails the build.
//
// ⚖️ AND `counter_ephemeral` IS A REAL ANSWER, NOT A LOOPHOLE. Some rates are
// genuinely not worth a column yet. Naming one is a DEBT — the same word
// `check_staging_migration_coverage.mjs` uses for an excluded migration, and
// for the same reason: an exclusion nobody wrote down is how 0120 and 0121 sat
// unapplied while a branch that read them waited to merge.
//
//   incident           one occurrence matters and a log is the right home:
//                      an error, a refusal, a "this should not happen".
//   counter            a RATE. Must name a durable destination that exists.
//   counter_ephemeral  a rate we knowingly do not persist. Needs a reason.
//
//   node scripts/ci/check_counter_durability.mjs            # the real tree
//   node scripts/ci/check_counter_durability.mjs --selftest # fixtures
import { readdirSync, readFileSync, statSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')

// ── The registry. One line per event, and the reason is the point ──────────
//
// ⚠️ ADDING AN EVENT WITHOUT ADDING IT HERE FAILS THE BUILD. That is the whole
// mechanism: it converts "nobody noticed" into "someone wrote down why", which
// is the only difference between an omission and a decision.
const EVENTS = {
  // ── COUNTERS WITH A HOME ────────────────────────────────────────────────
  substance_route_shadow: {
    kind: 'counter',
    stored: 'generations.selection',
    why: 'What the selector handed the writer. Was a log until 0130; the readings expired.',
  },
  // ⚖️ FIX 8b. `ran` is the SAME field the daily budget gate counts, so the
  // ceiling and the durable record can never disagree — one query, one
  // truth. Trigger and repair fields ride along on the same row.
  semantic_repetition_judge_ran: {
    kind: 'counter',
    stored: 'generations.beat_audit',
    why: 'Whether the judge ran, how many pairs it reported, whether the blind-tested '
      + '"2+ substantive" trigger fired, and whether a repair was offered. `ran: true` on '
      + 'this row is exactly what the 50/day budget gate queries before its next call.',
  },
  // ⚠️ THE SKIP MUST BE AS VISIBLE AS THE RUN, per decision #3 — a silent
  // skip is how a cost gate becomes a quality regression nobody can explain.
  // ⚠️ THIS ONE IS SUPPOSED TO STOP HAPPENING, which is why it is an incident
  // and not a counter. It fires when a creator-facing edge function could not
  // find a new-format `sb_secret_...` in the injected SUPABASE_SECRET_KEYS
  // dictionary and fell back to the platform-injected legacy service_role JWT.
  // ⚠️ DISTINCT FROM THE FALLBACK BESIDE IT, ON PURPOSE. "Fell back to the
  // legacy key" means the migration is unfinished; "found no credential at
  // all" means the function cannot work. Pooling them would hide an outage
  // inside a migration signal.
  service_key_absent: {
    kind: 'incident',
    why: 'A creator-facing edge function found neither a usable sb_secret_ in the '
      + 'injected SUPABASE_SECRET_KEYS dictionary nor a legacy service_role value. The '
      + 'call proceeds with an empty key and the gateway refuses it -- exactly what the '
      + 'previous `Deno.env.get(...)!` non-null assertion did when the variable was '
      + 'unset, so this is not a new failure mode; what is new is that the absence is '
      + 'logged instead of being indistinguishable from a working call. No durable '
      + 'home: it is an outage signal, not a rate.',
  },
  service_key_legacy_fallback: {
    kind: 'incident',
    why: 'An operator CANNOT set SUPABASE_SERVICE_ROLE_KEY -- the platform reserves the '
      + 'SUPABASE_ prefix and refuses it ("Name must not start with the SUPABASE_ prefix", '
      + 'hit during the 2026-09-15 rotation) -- so a rotated service credential reaches '
      + 'these functions only through the injected SUPABASE_SECRET_KEYS dictionary. '
      + 'Unlike ci-bootstrap, which fails closed because a wrong staging credential is '
      + 'worse than none, these 25 functions serve live creators: failing closed would '
      + 'take script generation, thumbnails and DNA scans down together. So the legacy '
      + 'value is accepted WHILE IT WORKS and the fallback is logged loudly. '
      + 'THE EXPOSED LEGACY KEY CANNOT BE DISABLED UNTIL THIS STOPS FIRING -- that is the '
      + 'whole point of logging it, because a fallback nobody can see is a migration that '
      + 'never finishes. No durable home: it is a transition signal, not a rate to keep, '
      + 'and the reason names the selection outcome only, never key bytes.',
  },
  semantic_repetition_judge_skipped_budget: {
    kind: 'incident',
    stored: 'generations.beat_audit',
    why: 'The daily judge budget (50) was exhausted, or the count could not be read and '
      + 'the gate failed closed. Never blocks the script — logged so the skip rate is '
      + 'visible instead of indistinguishable from "nothing to flag".',
  },
  semantic_repetition_judge_skipped: {
    kind: 'incident',
    why: "The outer try/catch caught something other than the budget gate — a malformed "
      + "model response, a network failure. Same shape as `script_advisory_skipped` beside "
      + "it: non-fatal by construction, so a log line is the right home for a one-off.",
  },
  semantic_repetition_repair_failed: {
    kind: 'incident',
    why: 'The trigger fired but the span-repair model call itself failed. The trigger '
      + 'and findings are already durable on the row via `semantic_repetition_judge_ran`; '
      + 'this is the one-occurrence failure of the optional second call, not a rate '
      + 'anything downstream currently depends on.',
  },
  // ⚠️ FIX 1 (Wave 1). Reference-copying, not reference-claim-borrowing —
  // `reference_claim_leak` below already covers a MEASUREMENT the reference
  // creator took; this is the reference's own WORDING reaching a script as
  // this creator's speech. Run A shipped a Hormozi line verbatim as spoken
  // dialogue; Run D reproduced a near-verbatim sentence even at
  // fidelity="loose". `found`/`repaired` on the same row every other 0131
  // counter already lands on, so a rising `found` with a flat `repaired` is
  // visible without a second query.
  reference_phrase_overlap: {
    kind: 'counter',
    stored: 'generations.beat_audit',
    why: 'Spoken lines sharing a >=6-content-word contiguous run with the reference '
      + 'transcript, and how many were rewritten or turned into an ask before shipping. '
      + 'Null when the reference had no readable transcript to check against.',
  },
  // ⚠️ A FRAMES-ONLY SWEEP THAT COVERED 600 OF 1,008 IS A FINDING ABOUT THE
  // TRANSCRIPT CACHE, NOT A MYSTERY ABOUT THE OTHER 408. `framesOnly` refuses
  // BEFORE the acquisition ladder when no stored transcript exists, because a
  // job that silently upgrades itself into a full re-assessment turns a
  // one-download sweep into a two-download one across a thousand references.
  //
  // ⚖️ EPHEMERAL, AND THE REASON IS THE ROW ITSELF. What a later query needs is
  // "which references still have no visual pass" — and that is already
  // answerable from `reference_content_profiles.visual_assessed_at`, which the
  // sweep leaves untouched on a miss precisely so the reference stays visible
  // to the next pass. A durable counter here would store a number derivable
  // from the rows it describes, which is the second authority this registry
  // exists to prevent.
  // ⚠️⚠️ THE SWEEP THAT EXISTS BECAUSE THE PREVIOUS WRITER WAS A HUMAN.
  // `caption_shape` had one writer — a manual script — so classification froze
  // on 2026-09-10 at 596 rows while `gallery_items` grew to 6,423, and
  // `generate-blueprint` kept reading that stale column on every generation.
  //
  // ⚖️ EPHEMERAL, AND THE REASON IS THE TABLE ITSELF. Every number in this line
  // is a `select … group by caption_shape_reason` away: the sweep WRITES its
  // misses (`no_pattern_match`, `too_short`, `not_english`) rather than skipping
  // them, precisely so the corpus can be asked what it understood and what it
  // could not. A durable counter here would store a total derivable from the
  // rows it describes — the second authority this registry exists to prevent —
  // and `caption_shape_at` already carries when each row was last read.
  niche_brain: {
    kind: 'counter_ephemeral',
    why: 'Per generation: how many niche-brain notes came back and whether the '
      + 'block rendered. Not persisted yet because the durable record belongs to the '
      + 'Learner step, which stores WHICH notes reached WHICH script so results can '
      + 'weight them; a bare count here would be a second, weaker authority.',
  },
  own_sweep: {
    kind: 'counter_ephemeral',
    why: 'Per batch of her own posts read by the niche brain. Durable in `own_post_reads` '
      + '(status, read_at per post) and private `brain_notes` rows, so progress is a query.',
  },
  brain_learn: {
    kind: 'counter_ephemeral',
    why: 'How many notes brain_learn() re-credited. The credit itself is durable on '
      + '`brain_notes` (used/filmed/posted/outcome_views) and recomputed from '
      + '`brain_note_uses`, so the count is derivable.',
  },
  moments: {
    kind: 'counter_ephemeral',
    why: 'One bucket\'s daily grounded search for world moments. Durable in `brain_moments` '
      + '(moments, sources, queries per bucket and day).',
  },
  brain_sweep: {
    kind: 'counter_ephemeral',
    why: 'How many corpus videos one niche-brain sweep read, found unreadable or '
      + 'failed on, and how many notes it filed. Not persisted because every figure is '
      + 'durable IN `corpus_reads` (status + read_at per video) and `brain_notes` '
      + '(times_seen, first_seen, last_seen), so progress is a query. The log line '
      + 'makes a stalled sweep visible in the moment.',
  },
  caption_sweep: {
    kind: 'counter_ephemeral',
    why: 'How many gallery cards one sweep read, classified and could not '
      + 'classify, with the refusal reasons. Not persisted because every figure is '
      + 'already durable IN `gallery_items`: the sweep writes `caption_shape_reason` '
      + 'on a miss and `caption_shape_at` on every row it touches, so "what does the '
      + 'corpus understand, and when was it last read" is a query rather than a '
      + 'counter. The log line exists to make a stalled sweep visible in the moment.',
  },
  // ⚠️ THE ONE PASS WHOSE WORK ERASES ITS OWN EVIDENCE. The shot-list and
  // setup-label resyncs beside it leave their result in the blueprint, so
  // "did it fire" is a query over the rows. This one REMOVES the leaked key —
  // afterwards a repaired beat is indistinguishable from one that never
  // leaked, so nothing in the shipped artefact records that the prompt drifted.
  //
  // ⚖️ SO THE FIGURE IS WRITTEN WHERE IT CANNOT EXPIRE, and only then is the
  // log line allowed to be ephemeral. `beat_audit.action_posing_hygiene`
  // carries `{ stripped, of }` on the generation row — both numbers, because
  // "2 stripped" says nothing without "of 6 beats that carried a direction".
  action_posing_key_stripped: {
    kind: 'counter_ephemeral',
    why: 'A beat shipped `action_posing` beginning with the taxonomy key that '
      + 'selected it ("hold_up: Hold it up to chest height") and the key was '
      + 'stripped before the blueprint shipped. The log line is not persisted '
      + 'because the figure already is: `generations.beat_audit.action_posing_hygiene` '
      + 'records `{ stripped, of }` per generation, so "is the prompt drifting back" '
      + 'is a query over generations rather than a counter. The warn line exists to '
      + 'make a sudden spike visible in the moment.',
  },
  transcript_retry: {
    kind: 'counter_ephemeral',
    why: 'A transcript call hit a transient or rate-limited failure and is being '
      + 'tried once more. Not persisted because the OUTCOME is what matters and it '
      + 'is already durable: if the retry succeeds the row records the route that '
      + 'worked, and if it fails the row records `failed_transient` / '
      + '`failed_rate_limited` in `routes`. A durable retry count would store a '
      + 'number derivable from those two.',
  },
  youtube_apify_failed_falling_back_local: {
    kind: 'incident',
    why: 'The paid YouTube Actor failed for a reason that is OURS rather than a fact '
      + 'about the video, so the local yt-dlp rung is being tried instead. One '
      + 'occurrence matters because it means the vendor path is degraded — the '
      + 'durable rate lives on the job row as `routes.failed_<class>` (billing, '
      + 'actor_missing, transient), which is what turns "0 of 15, reason unknown" '
      + 'into a named cause.',
  },
  instagram_apify_failed_falling_back_local: {
    kind: 'incident',
    why: 'Same as the YouTube line beside it, for the Instagram Actor — which until '
      + 'now had NO fallback at all, so a vendor failure was total. Durable rate is '
      + '`routes.failed_<class>` on the build_voice row.',
  },
  frames_only_no_cached_transcript: {
    kind: 'counter_ephemeral',
    why: 'A frames-only job found no stored transcript for the URL and returned '
      + 'without acquiring one. Not persisted because the durable form of this '
      + 'question already exists: reference_content_profiles rows with '
      + 'visual_assessed_at still null are exactly the references a sweep could '
      + 'not cover, and the miss deliberately leaves that column untouched.',
  },
  reference_phrase_overlap_repair: {
    kind: 'incident',
    why: 'What the phrase-overlap repair pass rewrote or turned into an ask. Same shape '
      + 'as reference_claim_leak_repair beside it: the durable rate already lives on '
      + '`reference_phrase_overlap` (0131-pattern), so this is the one-off log of what '
      + 'the repair call actually did.',
  },
  // ⚠️ FIX 2 (Wave 1). A CTA that names, or first-person-plural claims, a
  // business absent from `product_entities`. Run C shipped "We partner with
  // founders ... at Acquisition dot com" — the REFERENCE creator's own
  // company — because the writer had no offer on file and reached for the
  // nearest one in context. `found`/`replaced` on the same `generations.
  // beat_audit` row every other 0131 counter lands on, per the exact pattern
  // `reference_phrase_overlap` above uses.
  cta_entity_unmatched: {
    kind: 'counter',
    stored: 'generations.beat_audit',
    why: 'CTA beats naming or first-person-plural claiming a business not on this '
      + "creator's product_entities, and how many were replaced with the deterministic "
      + 'non-commercial fallback before shipping. Null when the check never ran.',
  },
  cta_entity_unmatched_repair: {
    kind: 'incident',
    why: 'What the CTA-entity repair pass replaced. Same shape as '
      + 'reference_phrase_overlap_repair beside it: the durable rate already lives on '
      + '`cta_entity_unmatched` (0131-pattern), so this is the one-off log of what the '
      + 'repair call actually did.',
  },
  // ⚠️ FIX 3 (Wave 1). A hook option (across all five, not just
  // hook_options[0]) asserting a currency/magnitude figure, a first-person-
  // plural business claim, or a business-model term (churn/subscribers/
  // headcount) absent from `product_entities`. Run A shipped "revenue was
  // stagnant"; Run D shipped "we do over a million in revenue" and "stop
  // blaming your churn" — no product_entities backed either. `found`/
  // `demoted` on the same `generations.beat_audit` row every other 0131
  // counter lands on, per the `reference_phrase_overlap`/`cta_entity_unmatched`
  // pattern above — DEMOTED here, never dropped, so a flagged hook is still a
  // preference datapoint the creator can pick.
  // ⚠️ FIX 8a, ENFORCED AT LAST. `hook_body_collisions` (registered below as a
  // plain count) has reported this since it shipped and NOTHING ACTED ON IT —
  // the code's own comment deferred enforcement to "when this is worth acting
  // on". MEASURED ON PRODUCTION 2026-09-14 over the 85 generations carrying
  // that key: 22 (26%) had at least one collision, 24 colliding beats in total,
  // worst run 3. A quarter of runs offered the creator a hook the script had
  // already spent, which is the population the deferral was waiting for.
  //
  // ⚖️ REGISTERED SEPARATELY FROM THE COUNT, BECAUSE IT ANSWERS THE OTHER HALF.
  // `hook_body_collisions` says how many beats collided; this says what was
  // DONE about it. Recording only the count is precisely what let the rule sit
  // unenforced without the gap showing in a single row.
  hook_body_collision_demoted: {
    kind: 'counter',
    stored: 'generations.beat_audit',
    why: 'Hook options a body beat already restates, and how many of them actually moved '
      + 'behind the clean options rather than being deleted or rewritten. `found` is what '
      + 'the rule detected; `demoted` is what the order on screen actually changed, which '
      + 'is zero when a collided option was already last. Lands as '
      + 'hook_body_collision_demotion; null when the pass never ran, because a demotion '
      + 'that threw must not read as checked-and-clean.',
  },
  hook_unsupported_claim: {
    kind: 'counter',
    stored: 'generations.beat_audit',
    why: 'Hook options asserting a business fact (figure, first-person-plural claim, or '
      + "business-model term) not on this creator's product_entities, and how many were "
      + 'demoted behind the clean hooks rather than deleted. Null when the check never ran.',
  },
  // ⚠️ FIX 4 (Wave 2). shot_list and script are written together by one model
  // call, then only script gets rewritten by every repair above (Fix 1/2/3,
  // entitlement, ask/answer fill). Run A/B/C's shot lists all shipped
  // disagreeing with the teleprompter (liveRunFixtures.test.ts §4) because
  // nothing ever resynced them. `resynced`/`orphaned` on the same
  // `generations.beat_audit` row every other 0131 counter lands on.
  shot_list_resync: {
    kind: 'counter',
    stored: 'generations.beat_audit',
    why: 'Shot-list rows whose spoken_text was rewritten to match the FINAL script beat '
      + 'at that position, and how many spoken rows had no beat left to match at all '
      + '(an extra beat a repair dropped) and were blanked. Null when the generation '
      + 'carried no shot list to reconcile.',
  },
  // ⚠️ FIX 7 (Wave 3). Same defect shape as shot_list_resync above, in the
  // SAME `notes` field: the model writes "Setup <letter> · description ·
  // framing" once and nothing downstream ever reconciles it. Run A-D's
  // comma-split location text and non-deterministic, repeating setup
  // letters (liveRunFixtures.test.ts §7) shipped for exactly this reason.
  // `relabeled`/`setupCount` on the same `generations.beat_audit` row every
  // other 0131 counter lands on.
  setup_label_resync: {
    kind: 'counter',
    stored: 'generations.beat_audit',
    why: 'Shot-list rows whose notes setup label was rewritten — a comma-split '
      + 'location description rejoined, the letter reassigned to the '
      + 'deterministic first-appearance sequence, or both — and the number of '
      + 'distinct setups the shot list resolved to. Null when the generation '
      + 'carried no shot list to relabel.',
  },
  // ⚠️ FIX 5 (Wave 2). Same defect shape as shot_list_resync above, one panel
  // over: `reference_read.retention_map` is written by the same model call as
  // `script`, then only `script` gets rewritten by every repair since. Run
  // B's retention map shipped describing the reference's own lead-magnet
  // CTA over the shipped save-this CTA; Run C's included "The pivot", a beat
  // absent from the final teleprompter; Run D's claimed 6 structural beats
  // for a 5-scene script (liveRunFixtures.test.ts §5).
  retention_map_resync: {
    kind: 'counter',
    stored: 'generations.beat_audit',
    why: "How many output retention-map rows landed on a beat whose name the model's "
      + 'original row still used (that row\'s prose is discarded regardless — every '
      + 'goal is synthesized fresh from the FINAL script beat, never copied from the '
      + "reference-era reasoning), and how many original rows named a beat the final "
      + 'script no longer has and were dropped rather than shipped stale. Null when '
      + 'the generation carried no retention map to reconcile.',
  },
  // ⚠️ FIX 5's SIBLING, ONE LIST UP. `why_it_works` renders as green ticks
  // directly above the retention map on Result, from the same one model call,
  // and described the REFERENCE video rather than the script the creator is
  // about to film. `dropped` is how many of the model's reference-era claims
  // were discarded (all of them, always — none is ever carried forward);
  // `derived` is how many checkable claims the FINAL script supported. Derived
  // falling toward 1 on real scripts would mean the claim set is too strict to
  // say anything, which is the failure mode worth watching.
  //
  // ⚖️ WRITTEN BY MUTATING `beatAudit` AT THE RESYNC SITE, not by a field in
  // the object literal — the literal is constructed earlier in the handler than
  // this pass runs, so a literal field would durably store the value the
  // counter had before it was computed.
  why_it_works_resync: {
    kind: 'counter',
    stored: 'generations.beat_audit',
    why: 'How many reference-describing claims were dropped and how many '
      + 'script-derived claims replaced them. Absent when the generation carried '
      + 'no reference_read to reconcile.',
  },
  beat_substance: {
    kind: 'counter',
    stored: 'generations.beat_audit',
    why: "What the writer did with it, including G8's entailment_gaps. Stored by 0131.",
  },
  // ⚖️ A COUNTER, NOT AN INCIDENT, AND THE DISTINCTION IS THE POINT. One
  // generation during a voice build is not a defect — the creator asked for a
  // script and got one. What matters is the RATE: if a meaningful share of
  // generations land in the window between `scrape_dna` settling and
  // `build_voice` finishing, the two-stage build needs a wait or a warning; if
  // almost none do, it needs neither. A per-occurrence log answers the wrong
  // question, and it expires before anyone asks this one.
  generation_during_voice_build: {
    kind: 'counter',
    stored: 'generations.beat_audit',
    why: 'Written from a half-built voice — captions in, transcripts not yet. The rate decides whether the two-stage build needs a gate.',
  },

  // ── RATES WE KNOWINGLY DO NOT PERSIST YET ───────────────────────────────
  //
  // ⚖️ EACH OF THESE IS A DEBT, VISIBLE HERE RATHER THAN DISCOVERED LATER BY
  // SOMEBODY WRITING A QUERY THAT RETURNS NOTHING.
  voice_corpus_bounded: {
    kind: 'counter_ephemeral',
    why: 'How much of a creator\'s transcript corpus the voice synthesiser could actually '
      + 'read — used, whole, excerpted, dropped. It exists because the previous bound was '
      + 'SILENT: a `.slice(0, 12000)` on a front-loaded join read ~1.5 videos for a '
      + 'long-form creator and ~11 for a short-form one, against 25 transcribed for free, '
      + 'and nothing said so. Ephemeral rather than stored because the durable answer is '
      + 'the voice profile itself; this line is how we see the bound biting while the '
      + 'yield curve is measured. Promote it to a counter if the window is ever tuned '
      + 'against a target rather than against a measurement.',
  },
  reference_transfer_shadow: {
    kind: 'counter_ephemeral',
    why: 'Shadow measurement of reference-claim transfer. Its finding (#368) is already '
      + 'enforced by a repair pass, so the rate is diagnostic rather than load-bearing. '
      + 'Promote it if the repair is ever made conditional.',
  },
  packaging_measured: {
    kind: 'counter_ephemeral',
    why: 'Title/packaging habits per scan. Already persisted in substance on the voice '
      + 'profile; this log is the per-scan breakdown behind it, useful live and not as a rate.',
  },
  creator_state_observed: {
    kind: 'counter_ephemeral',
    why: 'Which creator-state branch a generation took. No question currently rests on its '
      + 'rate; if one does, it belongs beside selection and beat_audit.',
  },
  caption_knowledge_stored: {
    kind: 'counter_ephemeral',
    why: 'Items stored per scan. The store itself is the durable record — creator_knowledge '
      + 'can be counted directly, so a second copy of the count would be able to disagree with it.',
  },
  product_knowledge_extracted: {
    kind: 'counter_ephemeral',
    why: 'Same shape: product_entities holds the rows, so the count is derivable from them.',
  },
  product_prices_from_page_data: {
    kind: 'counter_ephemeral',
    why: 'The durable fact is the price facts written into product_entities.knowledge; the log '
      + 'is the live trace of reading them from the page\'s schema.org data.',
  },
  product_not_found_on_shop: {
    kind: 'counter_ephemeral',
    why: 'Diagnostic trace of a shop lookup miss (closest titles). Nothing durable changes; '
      + 'product_entities keeps its old link.',
  },
  product_found_on_shop: {
    kind: 'counter_ephemeral',
    why: 'The durable fact is product_entities.product_url, rewritten from the shop front to '
      + 'the product page it found; the log is the live trace of that rewrite.',
  },
  product_found_on_web: {
    kind: 'counter_ephemeral',
    why: 'The durable fact is product_entities.product_url plus knowledge facts with source '
      + 'web_search; the log is the live trace of the grounded search that found the page.',
  },
  product_web_search_no_match: {
    kind: 'counter_ephemeral',
    why: 'Nothing is written on a miss — the old fallback runs unchanged — so this log is the '
      + 'only trace that a web search ran and why its answer was refused.',
  },
  scan_target_assessed: {
    kind: 'counter_ephemeral',
    why: 'What a handle resolved to. brand_voices already stores the resolved facts; this '
      + 'is the live trace of the decision.',
  },
  voice_built: {
    kind: 'counter_ephemeral',
    why: 'Completion marker. brand_voices.updated_at carries the durable fact.',
  },
  creator_knowledge_paraphrase_merged: {
    kind: 'counter_ephemeral',
    why: 'G9 dedupe rate. Worth promoting once anyone asks how often re-wording is caught — '
      + 'measured at 9 of 18 on a repeat run, and unmeasured in production since.',
  },
  thumbnail_generated: {
    kind: 'counter_ephemeral',
    why: 'Completion marker; the asset row is the durable record.',
  },
  blueprint_generated: {
    kind: 'counter_ephemeral',
    why: 'Completion marker; the generations row is the durable record.',
  },

  // ⚠️ THE TWO COUNTERS THAT SAY WHETHER THE RECORDING FIX WORKED. A creator
  // recorded twice on 2026-08-09 and Twin refused both takes; one reached
  // validation and was rejected `duration_unknown` for a browser WebM that had
  // simply never written its Segment duration. `media_assets.metadata` already
  // carries the rejection record for a take that fails, so the DURABLE half is
  // there — what these two add is the recovery, which leaves no other trace: a
  // take that is rescued produces no incident, no rejection row and no
  // complaint, and would be indistinguishable from one whose header was fine.
  //
  // ⚖️ AND `then` IS ON THE EVENT ON PURPOSE. Recovering the duration and
  // ACCEPTING is the fix working; recovering it and then failing `too_short` is
  // the fix working AND the take genuinely being bad. Pooling them would let a
  // regression that decodes garbage look like a success.
  source_duration_decoded: {
    kind: 'counter_ephemeral',
    why: 'A header with no duration, measured by decoding, carrying `then` — accepted, or which real bound it went on to fail. '
      + '⚠️ A DEBT NAMED RATHER THAN A COLUMN ADDED, and named because the first version of this entry claimed '
      + '`media_assets.metadata` as its home and the guard refused it: a REJECTED take records itself there, but a RESCUED '
      + 'one leaves no row anywhere and would be indistinguishable from a take whose header was fine. So the recovery rate '
      + 'lives only in the log and expires with it. That is acceptable while the question is "did the fix work at all" on '
      + 'three known takes; it stops being acceptable the moment anybody wants a trend, and the home is then '
      + '`media_assets.metadata.duration_recovered`.',
  },
  source_duration_undecodable: {
    kind: 'incident',
    why: 'A source whose length could not be measured even by decoding. Rare by construction, and the only case where refusing a take is honest.',
  },

  // ⚖️ A COUNTER RATHER THAN AN INCIDENT, AND ITS DURABLE HOME IS THE TABLE IT
  // REPAIRS. One stranded recording is not a "should not happen" — the last step
  // of the upload state machine runs on the creator's device, so some fraction
  // will always be lost to a closed tab. The RATE is the finding: 78% of all nine
  // recordings ever made were stranded when this was measured (2026-09-16, six
  // creators, ages to 37 days), and whether that falls to near zero or stays high
  // is the only way to tell a lost finalize call from a broken upload path.
  //
  // ⚖️ AND IT NEEDS NO NEW COLUMN, WHICH IS WHY THIS IS NOT `counter_ephemeral`.
  // The count is recoverable from `media_assets.status` at any moment — exactly
  // the query `_shared/ownerConsole.ts` already runs to tell the owner "N takes
  // never finished uploading". Declaring it ephemeral would claim there is no
  // durable home when the durable home is the thing being fixed.
  upload_sweep: {
    kind: 'counter',
    stored: 'media_assets.status',
    why: 'Recordings that reached storage but were never finalized, recovered by handing them to the validator that already worked. The rate says whether the client finalize path is losing calls occasionally or systematically; the count itself is re-derivable from media_assets.status, which is what the owner console reads.',
  },
  // ── INCIDENTS: one occurrence matters, and a log is the right home ───────
  substance_unsupported: { kind: 'incident', why: 'A beat citing something not supplied. Reported per generation, never rewritten.' },
  reference_claim_leak: { kind: 'incident', why: "The reference's own measured claim reaching a script." },
  // ⚠️ AN INCIDENT AND NOT A RATE, AND THE DISTINCTION IS THE COST. This fires
  // when the visual pass for a PASTED reference could not be queued after her
  // transcript already landed. One occurrence is the whole finding: that
  // reference will never get a `visual_profile`, so the observed-visual block
  // the writer reads is silently thinner for that one generation, and the only
  // act that fixes it is re-queueing that url. A count would tell an operator
  // nothing the first line does not.
  //
  // ⚖️ AND IT MUST NOT BE DURABLE ON THE ROW IT BELONGS TO, because there is no
  // such row — the failure IS the absence of a `reference_content_profiles`
  // row. Storing the failure on the record it failed to create is the circular
  // home this registry exists to refuse.
  reference_frames_unqueued: { kind: 'incident', why: 'The frames pass for a pasted reference could not be enqueued after its transcript was stored. Deliberately non-fatal: the transcript is the deliverable a creator waits on and an enrichment that could not be queued must not cost it. Logged rather than counted because one occurrence is already actionable (re-queue that url) and because the failure is the ABSENCE of the profile row, so it has no durable home that is not circular.' },
  schema_health: { kind: 'incident', why: 'A job type the production schema cannot serve, so the worker has stopped claiming it. An INCIDENT rather than a rate because it is actionable by exactly one act — apply the named migration — and because the count is not the point: one blocked job type is already the whole finding. Logged only when the blocked SET changes, so the five-minute recheck does not repeat itself; the recovery transition is logged too, because an operator who applied the migration needs to see the worker notice. Six migrations reached main unapplied on 2026-08-21 and twice a job type claimed work it could only throw on while the queue reported it pending. CI cannot detect this: migration-reconcile.yml refuses if its DB url points at production, so the worker is the only process holding legitimate production access.' },
  reference_claim_leak_repair: { kind: 'incident', why: 'What the repair pass rewrote.' },
  contentless_enumeration_unit: { kind: 'incident', why: 'A count promised with no unit behind it.' },
  script_mostly_questions: { kind: 'incident', why: 'A script that asks more than it says.' },
  spoken_placeholders_or_empty_promises: { kind: 'incident', why: 'A placeholder that reached a spoken line.' },
  placeholder_beats_asked: { kind: 'incident', why: 'Beats sent back to the creator as questions.' },
  ask_beats_bounded: { kind: 'incident', why: 'Asks beyond the per-script cap, or fed only by skipped optional fields, written around or omitted (items 30/31).' },
  blueprint_links_stripped: { kind: 'incident', why: 'A destination the creator never vouched for, removed.' },
  // ⚖️ A COUNTER RATHER THAN AN INCIDENT, because one long sentence in one
  // script is not a defect worth waking anybody for — the RATE is the finding.
  // A creator who retypes a line before saying it leaves no complaint, no
  // refund and no event, so this is the only trace the failure has.
  // ⚖️ A DEBT NAMED RATHER THAN A COLUMN ADDED. Each line is one failed profile
  // read, which is a defect on its own — but the number actually worth having is
  // the RATIO: how often does the second attempt succeed where the first did
  // not? That is what says whether retrying is load-bearing or theatre. It is
  // not persisted yet because one retry is a strictly better outcome than the
  // zero we shipped before, and a column for a rate nobody has read once is the
  // mistake this guard exists to prevent in the other direction.
  //
  // ⚠️ PROMOTE THIS THE MOMENT THE RETRY IS USED TO JUSTIFY ANYTHING — a longer
  // Actor timeout, a third attempt, or a claim that scans are reliable now.
  profile_read_failed: {
    kind: 'counter_ephemeral',
    why: 'One line per failed profile read, with the attempt number and whether it '
      + 'was judged retryable. The rate that matters (does attempt 2 rescue attempt 1?) '
      + 'is diagnostic today; promote it before the retry justifies any other change.',
  },
  // ⚖️ A COUNTER, NOT AN INCIDENT. One script failing one decidable check is not
  // worth waking anybody; the RATE across traffic is the finding, and it is the
  // first measurement this product has ever had of its founding defect.
  // ⚖️ A COUNTER, NOT AN INCIDENT, AND EPHEMERAL ON PURPOSE. One scan whose
  // captions were trimmed is not actionable — the physio's catalogue genuinely
  // exceeds the budget and always will. What this exists to answer is whether
  // the fix HELD: `discarded` was ~13 of 50 for a writing creator under the old
  // `.slice(0, 120)` + `.slice(0, 12000)`, and must now be 0 with `truncated`
  // carrying the pressure instead. A non-zero `discarded` in the logs means the
  // waterfill stopped waterfilling.
  //
  // ⚠️ NOT PROMOTED TO A STORED COLUMN, AND THE REASON IS THE READER, NOT THE
  // COST. Nothing decides anything from it: the corpus is rebuilt from
  // `scraped_posts` on every scan, so a historical row would record how one
  // model call was fed and change nothing. Give it a column the day a rule
  // reads it — a stored counter nobody consumes is the defect this whole file
  // exists to catch, pointed the other way.
  caption_corpus_built: {
    kind: 'counter_ephemeral',
    why: 'How much of a creator\'s caption catalogue reached the model: considered, included, discarded, truncated, chars. Measured before the fix on two real creators — lukefitphysio lost 28% of 16,659 characters to positional truncation, ishmaelmechanic lost nothing — so this is the line that says whether waterfill is still keeping every caption. Diagnostic only; promote it if anything ever decides from it.',
  },
  script_report_failed_checks: {
    kind: 'counter',
    stored: 'generations.script_report',
    why: 'Which decidable checks the shipped script failed, and which could not be asked. Observe only; stored by 0147.',
  },
  script_hard_to_say: {
    kind: 'counter',
    stored: 'generations.speech_audit',
    why: 'How sayable the shipped script was. Observe only; stored by 0145.',
  },
  product_claim_escalated: { kind: 'incident', why: 'A product claim raised past what evidence supports.' },
  stories_withheld: { kind: 'incident', why: 'A stored story withheld: off-product, or told in 2 of the last 5 scripts (item 32).' },
  script_length_extended: { kind: 'counter_ephemeral', why: 'Item 38: a script under 80% of its word budget got one grounded extension pass; accepted or why not (invented, integrity_removed, not_longer, call_failed). A rate worth a column only once the pass has run long enough to show whether it is ever rejected.' },
  rebuttal_framing_stripped: { kind: 'counter_ephemeral', why: 'Rebuttal framing ("I still think", "some people say") stripped from a script whose objective is not an objection/comparison (81cfb5ba). Also carried in beat_audit.goal_fidelity, which is durable.' },
  unconfirmed_promotion_removed: { kind: 'counter_ephemeral', why: 'A promotion (buy N get M, % off, free shipping over, code, sale) in the script that no confirmed text backs was cut (ae4031ba). Also carried in beat_audit.goal_fidelity, which is durable.' },
  cta_goal_mismatch_repaired: { kind: 'counter_ephemeral', why: 'The closing CTA did not match a sell (names product, points to buying) or leads (direct-contact ask, never a buy) goal and was replaced. Also carried in beat_audit.goal_fidelity, which is durable.' },
  shot_list_claim_drift: { kind: 'counter_ephemeral', why: 'Spoken shot rows that asserted something the final teleprompter beat does not, before re-derivation. Count also carried in beat_audit.shot_list_claim_drift, which is durable.' },
  script_integrity_repaired: { kind: 'incident', why: 'A finished script needed a header, a dropped duplicate story, a restored number, a stripped invented name or a length trim (items 33-38).' },
  entitlement_blocked: { kind: 'incident', why: 'A claim the creator is not entitled to make.' },
  entitlement_repair: { kind: 'incident', why: 'What the entitlement repair rewrote.' },
  entitlement_unrepaired: { kind: 'incident', why: 'A repair that did not take.' },
  hooks_unentitled: { kind: 'incident', why: 'Hooks resting on an unentitled claim.' },
  cta_fallback: {
    kind: 'counter',
    stored: 'generations.beat_audit',
    why: 'A hook, payoff or CTA that claimed it needed the creator. Those three are '
      + 'craft -- writable from the goal and the offer, both already on file -- so the '
      + 'claim is always wrong, and in the audited script the final beat shipped as '
      + '"Only you can supply this" to a creator at a teleprompter. Durable because a '
      + 'RISING rate is the signal that matters: it means the writer regressed and this '
      + 'check is the only thing standing between that and a dead line on screen. '
      + 'Stored by 0131, null when the check did not run.',
  },
  caps_emphasis_moved: {
    kind: 'counter',
    stored: 'generations.beat_audit',
    why: 'ALL-CAPS runs lifted out of a spoken line and into emphasis_words. A real '
      + 'script shipped "YOU HAVE TIME" as dialogue, which a creator reads as shouting '
      + 'and which then burns into captions permanently. Durable because the question is '
      + 'whether the prompt line takes effect: this should trend to 0, and if it does not '
      + 'that is the familiar inert-instruction result and the check carries it alone. '
      + 'Stored by 0131, null when the split did not run.',
  },
  scan_ceiling_reached: {
    kind: 'incident',
    stored: 'scan_events (the ledger the ceiling counts)',
    why: 'An account hit its monthly voice-scan ceiling and a scan was refused. '
      + 'AN INCIDENT RATHER THAN A COUNTER: each one is a creator who was told no, '
      + 'and the durable record is the ledger itself -- scan_events holds every '
      + 'billable scan append-only, so "how many did they run and when" is '
      + 'answerable months later without this log line. The line exists so the '
      + 'refusal is greppable in the moment; the evidence is in the table.',
  },
  scan_event_not_recorded: {
    kind: 'incident',
    stored: 'not persisted -- deliberately',
    why: 'The ledger insert failed and the scan proceeded anyway. NOT PERSISTED '
      + 'ON PURPOSE: the only durable home for it would be the very table that '
      + 'just refused a write, so a row here would be the least trustworthy row '
      + 'in the system. It is an incident to page on, not a rate to track. Its '
      + 'consequence is visible instead as an undercount in scan_events, which is '
      + 'the honest direction to fail -- a creator is never charged for a scan we '
      + 'could not record.',
  },
  business_fact_provenance: {
    kind: 'counter_ephemeral',
    why: 'How many of the CREATOR DNA business facts on this run were stated by the '
      + 'creator versus guessed by synthesis, as a stated/guessed/total triple. '
      + 'MEASURED on production 2026-08-26 (41 profiles, 40 voices) before the '
      + 'labelling existed: brief.offer set for 0 of 40, and audience_pain and '
      + 'dream_outcome guessed for 34 of 34 voices that carried them -- so every '
      + 'script described its creator\'s audience from an inference rendered as '
      + 'fact. NOT PERSISTED because it is derivable at any time from brand_voices '
      + 'and profiles, which is where the one-off measurement came from; a column '
      + 'would duplicate a query, not preserve a fact that is otherwise lost. It is '
      + 'logged so the ratio becomes a series in the edge logs rather than a number '
      + 'somebody ran by hand once. Revisit if the ratio ever needs to be joined to '
      + 'a specific generation.',
  },
  brand_truth_projection_skipped: {
    kind: 'incident',
    why: 'The brand-truth projection threw and the CREATOR DNA block rendered '
      + 'unlabelled -- the pre-existing behaviour, not a degraded script. Not '
      + 'persisted because it must never cost a paid generation and an ops_events '
      + 'insert on this path is one more thing that can fail while a creator is '
      + 'waiting. If it ever fires at volume the labelling is silently absent, which '
      + 'is exactly what the four per-field assertions in brandTruthPrompt.test.ts '
      + 'would NOT catch: they check the code renders the marker, not that the '
      + 'projection succeeded at runtime.',
  },
  script_advisory_read: {
    kind: 'counter',
    stored: 'generations.blueprint',
    why: 'What the one advisory read found, beside the LEXICAL FLOOR it should be '
      + 'checked against -- exact pairs and strongest overlap for the same script. '
      + 'Durable because the pair is the whole point: a blind creator panel put beat '
      + 'repetition at 67% while every lexical measure computable from production '
      + 'lands at 0-11% (2026-08-26, 41 scripts), and only a stored verdict NEXT TO '
      + 'its floor can say which of those two the model is agreeing with. A findings '
      + 'count alone would be a number nobody could argue with. Written into the '
      + 'blueprint rather than script_report because Result.tsx reads the blueprint '
      + 'and reads script_report never.',
  },
  script_advisory_skipped: {
    kind: 'incident',
    why: 'The advisory read threw and the script shipped without a note -- the '
      + 'pre-existing behaviour, not a degraded script. Not persisted because it runs '
      + 'after the rescue point on a generation the creator has already paid for, and '
      + 'an ops_events insert there is one more thing that can fail while they wait. '
      + 'If it fires at volume the notes are silently absent, which the per-field '
      + 'assertions cannot catch: they check the code renders a note, not that the '
      + 'model answered.',
  },
  shots_named_by_number: {
    kind: 'counter',
    stored: 'generations.beat_audit',
    why: 'Shot-list rows whose "shot" field is the row\'s position rather than the '
      + 'shot\'s name. MEASURED at 98 of 223 rows -- 44% -- before the prompt line '
      + 'existed; the card renders that field as its heading, so a creator holding a '
      + 'phone against their shot list read a card called "2". shotLabel already '
      + 'repairs the RENDER, so this is not what the creator is waiting on. Durable '
      + 'because the only open question is whether the WRITER stopped: it should trend '
      + 'to 0, and if it does not, that is the familiar inert-instruction result and '
      + 'this counter is the only thing that can say so. Null when no shot list came '
      + 'back to scan -- which is NOT the same as zero numbered shots.',
  },
  hook_over_length: {
    kind: 'counter',
    stored: 'generations.beat_audit',
    why: 'The prompt demands a hook under ~12 words and nothing checked it — a hook '
      + 'shipped to a real creator at 30. Counts hooks that broke the length/opener '
      + 'contract as written, how many the deterministic ladder rescued, and how many '
      + 'were demoted and still offered. Durable because the honest question it answers '
      + '-- does the 12-word doctrine survive contact with the writer, and do creators '
      + 'pick the shorter hooks once they exist -- is only answerable across many '
      + 'generations. Stored by 0131, null when the contract did not run.',
  },
  generation_not_billable: { kind: 'incident', why: 'A generation the ledger must not charge for.' },
  // ⚠️ A SUCCESS FOR THE CREATOR AND A DEFECT FOR US, WHICH IS WHY IT IS AN
  // INCIDENT RATHER THAN A COUNTER. Every occurrence is one throw in the 792
  // lines of analysis that run after a paid writer call — the script was saved,
  // and something that was only ever meant to DESCRIBE it failed. It has a
  // durable home in `ops_events` (kind: generation_rescued) as well as the log,
  // because the whole point is that the run now looks healthy in every count.
  generation_rescued: { kind: 'incident', why: 'The analysis threw after the writer succeeded; the paid script was saved anyway.' },
  // ⚠️ ONE OCCURRENCE IS A DEFECT REACHING A PAID GENERATION, not a rate. It
  // means a creator's voice was `ready` with no knowledge behind it and the
  // script was written from nothing — the empty-shell defect, caught late. It
  // has a durable home in `ops_events` (kind: empty_voice_scan_enqueued) as well
  // as the log, because the number that matters is how many accounts were in
  // that state, and edge logs expire long before anyone asks.
  // ⚖️ A COUNTER, NOT AN INCIDENT, AND THE DISTINCTION IS THE POINT. One
  // generation during a voice build is not a defect — the creator asked for a
  // script and got one. What matters is the RATE: if a meaningful share of
  // generations land in that window, the two-stage build needs a wait or a
  // warning, and if almost none do, it needs neither. A per-occurrence log
  // answers the wrong question. It is stored on the beat audit
  // (`voice_build_in_flight`), which is the durable home every generation
  // already writes.
  empty_voice_scan_enqueued: { kind: 'incident', why: 'A ready voice with no knowledge; the missing scan was scheduled from a generation.' },
  readiness_incomplete: { kind: 'incident', why: 'Generation attempted before the brief was ready.' },
  cdp_refused: { kind: 'incident', why: 'A goal and a library that contradict each other, refused before the charge. Per occurrence, because each one is a creator who set out to sell and was stopped — if the rate is high the answer is a better Product Library, not a softer rule.' },
  readiness_answers_not_persisted: { kind: 'incident', why: 'Brief answers that did not survive the write.' },
  knowledge_insert_failed: { kind: 'incident', why: 'A knowledge write that did not land.' },
  knowledge_kind_rejected: { kind: 'incident', why: 'An extracted item whose kind the schema refuses.' },
  targeted_knowledge_extracted: {
    kind: 'counter',
    stored: 'jobs.result',
    why: 'How many of the seven (or ten) targeted questions this creator\'s speech actually answered, per question. The SILENCE is the measurement — "which question does nobody ever answer" is what says whether the bank is right — and it is unrecoverable once the rows merge into a store of 1,339. build_voice writes it to the job result as `targeted_yield`; remine_knowledge writes items_targeted/items_general/track_b_asked to its own.',
  },
  transcript_lines_mined: {
    kind: 'counter',
    stored: 'jobs.result',
    why: 'How many audience questions and promised videos were found in her own speech by the regex pass, split by which. It is the supply figure for the channel `audience_questions` was deleted for lacking, so "does this actually find anything on a real corpus" has to be answerable later; build_voice writes `mined_lines` to the job result and remine_knowledge writes `items_mined` to its own.',
  },
  knowledge_coverage_unavailable: { kind: 'incident', why: 'The per-creator depth view could not be read, so that panel is ABSENT rather than empty. Per admin call, because an empty list here would read as "no creator has any knowledge" — the same number the view exists to find honestly.' },
  owner_product_check_failed: { kind: 'incident', why: 'The product gate could not be read, so the three pricing questions were NOT asked. Unknown means no, and this line is the only thing that distinguishes "she sells nothing" from "we could not tell".' },
  creator_knowledge_merge_absent: { kind: 'incident', why: '0123 unapplied — dedupe is off, and that must be loud.' },
  creator_knowledge_source_column_absent: { kind: 'incident', why: '0122 unapplied — the selector cannot see source.' },
  objective_answer_stored: { kind: 'incident', why: 'Per generation that carried an answer to the rotating objective question: whether it was stored under its question id. A failed store costs rotation (the same question comes back next time), never the script.' },
  knowledge_rotation_columns_absent: { kind: 'incident', why: '0215 unapplied — the selector cannot see what it has already spent, so the same items lead every script. Per generation, because that is how long the degraded ranking lasts.' },
  knowledge_spend_not_recorded: { kind: 'incident', why: 'A delivered script whose supplied knowledge was not written to the ledger. Silent, this looks exactly like a creator whose runway was never touched.' },
  scrape_dna_empty: { kind: 'incident', why: 'A scan that found nothing. Honesty about a failed scan, per scan.' },
  scrape_dna_read_failed: { kind: 'incident', why: 'A scan that could not read the account.' },
  reference_exposure: { kind: 'counter_ephemeral', why: 'How many characters of the reference creator\u2019s verbatim transcript the writer was actually given, beside the reference_use level that decided it. A rate rather than an incident: withholding is the intended behaviour, so every line is a success and a row per generation would record nothing but normal operation. It is counted because this is the only place the decision is observable at all \u2014 the four audited live runs reproduced up to seventeen consecutive content words of a reference creator\u2019s speech while every generation reported success, and if this distribution collapses onto the widest budget (a normalisation regression, or reference_use ceasing to reach the writer) the leak returns with nothing looking broken.' },
  download_route_escalated: { kind: 'incident', why: 'A reference that failed with an IP block and was retried once through the residential proxy. ⚠️ WAS `counter_ephemeral`, AND THAT CLASSIFICATION CONTRADICTED ITS OWN REASON -- which said it "is counted because it is the only evidence the paid rung ran at all". It was a console.log, and worker logs expire, so the evidence expired with them. Measured 2026-09-13: 53 assess_reference failures carry a block-shaped error (the escalation precondition), newest 2026-09-03, and the database cannot say whether the rung fired on ONE of them. Now a durable row per escalation; the RATE is computed by counting rows, the same shape as `job_dead_letter`, because 53 chances in a month is rare enough that a row each is cheap.' },
  download_route_escalation_succeeded: { kind: 'incident', why: 'The residential retry actually produced a transcript. Read as a ratio against `download_route_escalated`, this is the answer to the question the rung exists to ask: was IP reputation the wall, or something behind it? Durable for the same reason as its denominator -- a ratio whose two halves both expired could never be computed. If it sits at zero while escalations climb, the proxy is not the fix and the spend should stop.' },
  container_template_applied: { kind: 'counter_ephemeral', why: 'How often an assessed reference actually gave the writer a named shape. A rate, not an incident: it is the measure of whether the transcript pass is reaching the script, and it belongs on a dashboard rather than in a row per generation.' },
  reference_multi_product_fallback: { kind: 'counter_ephemeral', why: 'Item 26 fallback: a reference with no multi-product container template read as multi-product from its own transcript/beats, and which signal fired (top_n, versus, ranking, distinct_products) so a false positive can be argued with.' },
  container_template_absent: { kind: 'counter_ephemeral', why: 'And why it did not — reference_not_assessed, container_not_assessed, no_template_for_container, read_failed. Four causes that need four different responses, kept apart so the ratio is diagnosable rather than merely low.' },
  alignment_probe: { kind: 'incident', why: 'What this image can do to a TIMESTAMP, asked at boot by importing rather than read off a docstring. Emitted once per worker start. Two refiner tiers were described as a working ladder for weeks while both raised ImportError on every call; a comment cannot be queried and this line can. `acousticAlignment=unavailable` is the expected, decided answer (torch declined until a bad-cut rate is measured) — `unknown` is the value worth reading twice, because it means the probe itself could not answer.' },
  transcript_cache_hit: { kind: 'counter_ephemeral', why: 'A retry that reused the transcript instead of re-downloading the video. A RATE, not an incident — the whole point is that it should be common. What it measures is the size of the waste 0153 removed: 145 quota-failed jobs were retried up to five times, each attempt paying for a download that had already succeeded. If this number is near zero while retries are happening, the cache is not being read and the saving is imaginary.' },
  transcript_cache_write_failed: { kind: 'counter_ephemeral', why: 'The transcript was obtained and could not be stored, so the next attempt will pay for the download again. Deliberately NOT an incident: the job still succeeds and the only cost is one repeated acquisition, which is exactly the cost we had before. It is a rate because a persistent failure here silently returns us to that old cost while every job still reports success — the failure mode is invisible unless counted.' },
  render_attempt_not_recorded: { kind: 'counter_ephemeral', why: 'The duration observation was obtained and could not be stored. A rate rather than an incident: the render itself is unaffected and the only cost is one missing row in a trend table. It is counted because a persistent failure here silently returns render_attempts to the state 0154 exists to end — the validator knowing the answer and nobody keeping it — while every render still reports success.' },
  routing_decision_not_recorded: { kind: 'counter_ephemeral', why: 'The routing decision was MADE and could not be stored. A rate rather than an incident, and the distinction matters: the reference is still routed correctly from the transcript in hand, so no creator sees anything wrong and no assessment fails. What is lost is only the record of how far the stored figure had drifted. It is counted because that is precisely the failure mode #66 exposed - 7 of 40 references routed on stale metadata while every job reported success - and a persistent write failure here would return us to that blindness with nothing looking broken.' },
  downloader_probe: { kind: 'incident', why: 'What the CONTAINER can do, asked at boot rather than inferred from requirements.txt. Emitted once per worker start; zero impersonation targets is the line that would have explained a wave of TikTok failures before anybody read 38 error rows.' },
  scrape_dna_reader_failed: { kind: 'incident', why: 'The READER reported a failure of its own — an Apify Actor that times out writes an error into its dataset and exits zero, which used to reach a creator as "your account is private or empty". Per occurrence, because each one is a public account being told it is not.' },
  scrape_dna_unsupported_platform: { kind: 'incident', why: 'A platform the worker does not handle.' },
  profile_scrape_free_failed: { kind: 'incident', why: 'The free profile path failed; a paid one may follow.' },
  profile_scrape_free_empty: { kind: 'incident', why: 'The free profile path returned nothing.' },
  profile_facts_missing: { kind: 'incident', why: 'A scrape with no resolvable account facts.' },
  profile_facts_enrich_failed: { kind: 'incident', why: 'Enrichment failed; the scan continues.' },
  reference_facts_unread: { kind: 'incident', why: 'The free metadata read on a pasted reference failed, so that row keeps a NULL view count forever -- there is no second pass, and a stranger\'s view count is not worth re-fetching later under a different date. Per occurrence, because a run of these means the metadata call itself has broken and every reference ingested meanwhile is unmeasured.' },
  reference_siblings_unread: { kind: 'incident', why: 'The uploader\'s other videos could not be read, so the reference keeps its own view count and no lift. Per occurrence: this path is a BILLED Actor run on YouTube and Instagram, and a failure that repeats is money spent for nulls.' },
  ci_bootstrap_granted: { kind: 'incident', why: 'A staging credential issued. Every decision is logged by design.' },
  ci_bootstrap_refused: { kind: 'incident', why: 'A staging credential refused, with the reason.' },
  ci_bootstrap_no_credential: { kind: 'incident', why: 'No credential available to issue.' },

  // ── THE `ops_events` KINDS, VISIBLE TO THIS GUARD SINCE THE SCANNER WAS
  // WIDENED ──
  //
  // ⚠️ ALL OF THESE ALREADY LANDED IN A DURABLE TABLE, AND NONE OF THEM HAD
  // BEEN ASKED THE QUESTION. That is the point worth stating: landing somewhere
  // is not the same as someone deciding it should. Two of eleven were listed;
  // the other nine were invisible to the guard because it matched only
  // `event: '...'`.
  //
  // ⚠️ AND `ops_events` IS AN INCIDENT TABLE, NOT A COUNTER STORE. Every kind
  // below is classified `incident` for one shared reason: each is a single
  // occurrence an operator must look at, and `ops_events` has no aggregation and
  // no retention policy that makes it a rate store. A kind here that becomes a
  // RATE worth trending needs a column, not another row in this table.
  billing_plan_unverified: { kind: 'incident', why: 'A paid webhook whose variant matched no configured plan, so the grant was REFUSED (severity critical), or a deployment with no variant map at all granting from seeded intent (warn). Per occurrence in both cases: the first is somebody who paid and did not get what they paid for, and the second is the window in which a user could seed `agency` and pay anything.' },
  generation_failed: { kind: 'incident', why: 'The generation threw. One creator, one build they paid for, one stack excerpt to read.' },
  generation_instrumentation_failed: { kind: 'incident', why: 'The selection/beat-audit instrumentation threw and was swallowed so the build could still succeed. Per occurrence, because it is the measurement going dark rather than the product.' },
  generation_record_not_written: { kind: 'incident', why: 'The `generation_choices` or `generation_outcomes` insert was rejected, so what the creator chose and how the build turned out left no record. Per occurrence, and a PGRST204 among them is marked `error` rather than `warning` because that code means the handler and the database disagree about what columns exist -- which loses the SAME row for every generation until a migration is applied, not one row. Nearly happened 2026-09-13 with 0203 believed-applied and absent; cost two days once already with 0190 and `is_heartbeat`.' },
  script_regenerated: { kind: 'incident', why: 'A rebuild off the same reference, with a verdict on what actually changed between the two. Per occurrence: the interesting case is a regeneration where nothing the creator changed should have changed the script.' },
  refund_failed: { kind: 'incident', why: 'Credits were spent and could not be returned -- severity critical, and the one alert in this file that needs a human the same day. It went nowhere silently for a while: the insert named `ops_alerts`, a table that has never existed, and the write is deliberately fire-and-forget so nothing caught it.' },
  job_dead_letter: { kind: 'incident', why: 'A worker job exhausted its attempts. Per occurrence so a spike is visible in the reliability panel; the RATE it feeds is computed from these rows rather than counted into a column.' },
  tier_zero_silent_row: { kind: 'incident', why: 'A visual pass that ran and wrote neither `tier_zero_profile` nor `tier_zero_failure_code`, naming WHICH of the two identical-looking shapes occurred. Measured 2026-09-03: 2 of 5 passes that ran. It ends a question the database could not answer about itself.' },
}

/** Every structured event emitted from code that ships. Tests are excluded —
 *  a fixture naming an event is not an emission. */
function emittedEvents(root) {
  const out = new Map()
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (name === 'node_modules' || name === 'dist' || name === '__tests__') continue
      if (statSync(p).isDirectory()) { walk(p); continue }
      if (!p.endsWith('.ts')) continue
      if (p.endsWith('.test.ts')) continue
      const src = readFileSync(p, 'utf8')
      for (const m of src.matchAll(/event: '([a-z0-9_]+)'/g)) {
        if (!out.has(m[1])) out.set(m[1], p.slice(REPO.length + 1))
      }
      // ⚠⚠ THE GUARD COULD NOT SEE THE ONE TABLE THAT IS ALREADY DURABLE.
      // It matched `event: '...'` only, so every `ops_events` row — the table an
      // operator actually watches — was invisible to it. MEASURED: 11 kinds are
      // written across the edge and the worker and only 2 were registered.
      //
      // That is this guard's own defect class turned on the guard: the question
      // "where does this land, and how long does it live?" went unasked for nine
      // events BECAUSE they already land somewhere. Landing somewhere is not the
      // same as someone having decided it should.
      //
      // ⚠️ MATCHED INSIDE AN `ops_events` INSERT, NEVER ON `kind:` ALONE. A bare
      // `kind: '...'` grep finds 49 names in this tree, and most are ordinary
      // discriminated unions — `card`, `clip`, `crossfade`, `phone`. A guard that
      // accused forty of those on its first run is a guard people learn to
      // ignore, which is the failure mode its own header warns about.
      for (const ins of src.matchAll(/from\('ops_events'\)\s*\n?\s*\.insert\(/g)) {
        const k = /kind:\s*'([a-z0-9_]+)'/.exec(src.slice(ins.index, ins.index + 400))
        if (k && !out.has(k[1])) out.set(k[1], p.slice(REPO.length + 1))
      }
    }
  }
  walk(root)
  return out
}

/** Columns and tables the migrations actually create, so a `stored` claim
 *  cannot name a destination that does not exist.
 *
 *  ⚠️ THE REVERSE CHECK IS THE ONE THAT MATTERS. A registry entry claiming a
 *  home it does not have is worse than an unlisted event: it reads as a
 *  decision that was made and kept, and nobody would look again. */
// ⚖️ THE DIRECTORY IS A PARAMETER SO THE PARSER CAN BE TESTED. It was hardcoded,
// which is why the selftest could only ever exercise `problems()` and never the
// function that decides whether a declared home EXISTS. Default unchanged.
function storedDestinations(dir = join(REPO, 'supabase', 'migrations')) {
  const dests = new Set()
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.sql')) continue
    const sql = readFileSync(join(dir, f), 'utf8')
    for (const m of sql.matchAll(/alter table (?:public\.)?(\w+)[\s\S]*?add column if not exists (\w+)/g)) {
      dests.add(`${m[1]}.${m[2]}`)
    }
    // ⚠️ `if not exists` IS OPTIONAL IN THIS REPO AND THIS REGEX ONCE REQUIRED IT.
    // Measured 2026-09-16: six tables are created with a plain `create table` —
    // `media_assets`, `edit_projects`, `media_analyses`, `edit_plans`,
    // `edit_events` and more across three migrations — so EVERY column of those
    // tables was invisible here, and a counter truthfully declaring a home in one
    // of them was told "no migration creates that". A guard that rejects a TRUE
    // claim teaches the next person to reach for `counter_ephemeral`, which is
    // how a rate stops being persisted for a reason nobody wrote down.
    //
    // ⚖️ THIS WIDENS WHAT THE GUARD CAN VERIFY, NOT WHAT IT PERMITS. A home that
    // genuinely does not exist is still refused — the selftest below proves it.
    for (const m of sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+) \(([\s\S]*?)\n\)/g)) {
      for (const c of m[2].matchAll(/^\s{2}(\w+)\s/gm)) dests.add(`${m[1]}.${c[1]}`)
    }
  }
  return dests
}

function problems(events, dests, registry) {
  const out = []
  for (const [name, file] of events) {
    const e = registry[name]
    if (!e) {
      out.push(`${name} (${file}) is emitted and unregistered — say whether it is an `
        + `incident, a counter with a durable home, or a counter we knowingly do not `
        + `persist. Unlisted means nobody asked where it lands or how long it lives, `
        + `which is how three counters in two days measured nothing.`)
      continue
    }
    if (!e.why || e.why.trim().length < 20) {
      out.push(`${name}: the reason is the point of the entry, and this one says nothing.`)
    }
    if (e.kind === 'counter') {
      if (!e.stored) out.push(`${name}: classified counter with no durable destination.`)
      else if (!dests.has(e.stored)) {
        out.push(`${name}: claims it is stored at ${e.stored}, and no migration creates that. `
          + `A home that does not exist reads as a decision already kept.`)
      }
    }
    if (!['incident', 'counter', 'counter_ephemeral'].includes(e.kind)) {
      out.push(`${name}: unknown kind ${e.kind}.`)
    }
  }
  for (const name of Object.keys(registry)) {
    if (!events.has(name)) out.push(`${name} is registered and no longer emitted — remove it.`)
  }
  return out
}

// ── selftest ───────────────────────────────────────────────────────────────
function selftest() {
  let failed = 0
  const t = (label, fn) => {
    const ok = fn()
    if (!ok) { failed++; console.error(`  FAIL: ${label}`) } else console.log(`  ok: ${label}`)
  }
  const dests = new Set(['generations.selection'])
  const ev = (n, f = 'x.ts') => new Map([[n, f]])

  t('an unregistered event FAILS', () =>
    problems(ev('brand_new'), dests, {}).length === 1)
  t('a counter with no home FAILS', () =>
    problems(ev('a'), dests, { a: { kind: 'counter', why: 'a reason long enough to count' } })
      .some((p) => /no durable destination/.test(p)))
  t('a counter naming a home that does not exist FAILS', () =>
    problems(ev('a'), dests, { a: { kind: 'counter', stored: 'nope.column', why: 'a reason long enough to count' } })
      .some((p) => /does not exist|no migration creates/.test(p)))
  t('a counter with a real home PASSES', () =>
    problems(ev('a'), dests, { a: { kind: 'counter', stored: 'generations.selection', why: 'a reason long enough to count' } })
      .length === 0)
  t('an empty reason FAILS even when the kind is right', () =>
    problems(ev('a'), dests, { a: { kind: 'incident', why: 'short' } }).length === 1)
  t('a stale registry entry FAILS', () =>
    problems(new Map(), dests, { gone: { kind: 'incident', why: 'a reason long enough to count' } })
      .some((p) => /no longer emitted/.test(p)))
  // ⚠️ THE SQL PARSER ITSELF, WHICH NOTHING HERE USED TO TOUCH. Every case above
  // hands `problems()` a dests set built by hand, so `storedDestinations` — the
  // function that decides whether a declared home EXISTS — was entirely
  // unguarded. That is how it came to require `create table if not exists` and
  // go blind to `media_assets`, `edit_projects`, `edit_plans` and three more,
  // rejecting counters that were telling the truth.
  t('storedDestinations reads BOTH create-table forms, and invents nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cdsql-'))
    writeFileSync(join(dir, '0001_plain.sql'),
      'create table public.plain_t (\n  col_a text not null,\n  col_b jsonb,\n);\n')
    writeFileSync(join(dir, '0002_ine.sql'),
      'create table if not exists public.ine_t (\n  col_c text,\n);\n')
    writeFileSync(join(dir, '0003_alter.sql'),
      'alter table public.plain_t\n  add column if not exists col_d text;\n')
    const d = storedDestinations(dir)
    return d.has('plain_t.col_a')      // ⚖️ THE REGRESSION: plain `create table`
      && d.has('plain_t.col_b')
      && d.has('ine_t.col_c')          // the form that already worked
      && d.has('plain_t.col_d')        // `add column if not exists`
      && !d.has('plain_t.col_zzz')     // ⚠️ AND IT STILL REFUSES WHAT DOES NOT EXIST
      && !d.has('nope_t.col_a')
      // ⚠️⚠️ AND THE COLUMN MUST BE A COLUMN, NOT ANY WORD IN THE BODY. A first
      // version of this case asserted only the two absences above, and a mutant
      // that matched EVERY word — turning `dests` into a rubber stamp that
      // accepts `plain_t.<anything the DDL mentions>` — SURVIVED it. The type
      // keywords are the discriminator: they appear in the body and are not
      // columns, so a parser that admits them admits anything.
      && !d.has('plain_t.text')
      && !d.has('plain_t.jsonb')
      && !d.has('plain_t.not')
      && !d.has('plain_t.null')
  })
  t('counter_ephemeral is accepted WITH a reason', () =>
    problems(ev('a'), dests, { a: { kind: 'counter_ephemeral', why: 'a debt, stated, and visible here' } })
      .length === 0)
  console.log(failed ? `counter-durability selftest: ${failed} FAILED` : 'counter-durability selftest: all cases passed')
  return failed === 0
}

if (process.argv.includes('--selftest')) {
  process.exit(selftest() ? 0 : 1)
}

const events = new Map([
  ...emittedEvents(join(REPO, 'supabase', 'functions')),
  ...emittedEvents(join(REPO, 'worker', 'src')),
])
const dests = storedDestinations()
const found = problems(events, dests, EVENTS)
const counters = Object.values(EVENTS).filter((e) => e.kind === 'counter').length
const debts = Object.values(EVENTS).filter((e) => e.kind === 'counter_ephemeral').length
console.log(`  ${events.size} events emitted · ${counters} stored · ${debts} rates knowingly not persisted`)
if (found.length) {
  for (const p of found) console.error(`::error::${p}`)
  process.exit(1)
}
console.log('counter-durability guard: OK')
