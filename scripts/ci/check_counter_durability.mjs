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
import { readdirSync, readFileSync, statSync } from 'node:fs'
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

  // ── INCIDENTS: one occurrence matters, and a log is the right home ───────
  substance_unsupported: { kind: 'incident', why: 'A beat citing something not supplied. Reported per generation, never rewritten.' },
  reference_claim_leak: { kind: 'incident', why: "The reference's own measured claim reaching a script." },
  reference_claim_leak_repair: { kind: 'incident', why: 'What the repair pass rewrote.' },
  contentless_enumeration_unit: { kind: 'incident', why: 'A count promised with no unit behind it.' },
  script_mostly_questions: { kind: 'incident', why: 'A script that asks more than it says.' },
  spoken_placeholders_or_empty_promises: { kind: 'incident', why: 'A placeholder that reached a spoken line.' },
  placeholder_beats_asked: { kind: 'incident', why: 'Beats sent back to the creator as questions.' },
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
  entitlement_blocked: { kind: 'incident', why: 'A claim the creator is not entitled to make.' },
  entitlement_repair: { kind: 'incident', why: 'What the entitlement repair rewrote.' },
  entitlement_unrepaired: { kind: 'incident', why: 'A repair that did not take.' },
  hooks_unentitled: { kind: 'incident', why: 'Hooks resting on an unentitled claim.' },
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
  creator_knowledge_merge_absent: { kind: 'incident', why: '0123 unapplied — dedupe is off, and that must be loud.' },
  creator_knowledge_source_column_absent: { kind: 'incident', why: '0122 unapplied — the selector cannot see source.' },
  scrape_dna_empty: { kind: 'incident', why: 'A scan that found nothing. Honesty about a failed scan, per scan.' },
  scrape_dna_read_failed: { kind: 'incident', why: 'A scan that could not read the account.' },
  container_template_applied: { kind: 'counter_ephemeral', why: 'How often an assessed reference actually gave the writer a named shape. A rate, not an incident: it is the measure of whether the transcript pass is reaching the script, and it belongs on a dashboard rather than in a row per generation.' },
  container_template_absent: { kind: 'counter_ephemeral', why: 'And why it did not — reference_not_assessed, container_not_assessed, no_template_for_container, read_failed. Four causes that need four different responses, kept apart so the ratio is diagnosable rather than merely low.' },
  downloader_probe: { kind: 'incident', why: 'What the CONTAINER can do, asked at boot rather than inferred from requirements.txt. Emitted once per worker start; zero impersonation targets is the line that would have explained a wave of TikTok failures before anybody read 38 error rows.' },
  scrape_dna_reader_failed: { kind: 'incident', why: 'The READER reported a failure of its own — an Apify Actor that times out writes an error into its dataset and exits zero, which used to reach a creator as "your account is private or empty". Per occurrence, because each one is a public account being told it is not.' },
  scrape_dna_unsupported_platform: { kind: 'incident', why: 'A platform the worker does not handle.' },
  profile_scrape_free_failed: { kind: 'incident', why: 'The free profile path failed; a paid one may follow.' },
  profile_scrape_free_empty: { kind: 'incident', why: 'The free profile path returned nothing.' },
  profile_facts_missing: { kind: 'incident', why: 'A scrape with no resolvable account facts.' },
  profile_facts_enrich_failed: { kind: 'incident', why: 'Enrichment failed; the scan continues.' },
  ci_bootstrap_granted: { kind: 'incident', why: 'A staging credential issued. Every decision is logged by design.' },
  ci_bootstrap_refused: { kind: 'incident', why: 'A staging credential refused, with the reason.' },
  ci_bootstrap_no_credential: { kind: 'incident', why: 'No credential available to issue.' },
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
function storedDestinations() {
  const dir = join(REPO, 'supabase', 'migrations')
  const dests = new Set()
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.sql')) continue
    const sql = readFileSync(join(dir, f), 'utf8')
    for (const m of sql.matchAll(/alter table (?:public\.)?(\w+)[\s\S]*?add column if not exists (\w+)/g)) {
      dests.add(`${m[1]}.${m[2]}`)
    }
    for (const m of sql.matchAll(/create table if not exists (?:public\.)?(\w+) \(([\s\S]*?)\n\)/g)) {
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
