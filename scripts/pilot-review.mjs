// ONE COMMAND: SELECT, PREFLIGHT, RUN, WAIT, PACKET, LABEL, LOCK, AGGREGATE.
//
// ⚠️ THE HUMAN STEP IS THE LABELLING AND NOTHING ELSE. Every other step here was
// previously a separate command with a separate chance to be run in the wrong
// order — draw a cohort, enqueue it, poll a report by hand, start a server,
// remember to lock before looking at the numbers. Each of those is machine work
// and each was a way to spoil the experiment.
//
// ⚖️ AND IT STILL REFUSES RATHER THAN REPAIRS. It will not substitute a
// reference after freezing the sample, will not show an aggregate before the
// lock, and will not spend anything without printing the bill first. An
// automation that quietly fixed those would be automating the parts that make
// the result trustworthy.
//
// ⚠️ IT NEVER TOUCHES THE 332. The frozen manifest is the whole population it
// will ever act on in a run.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import {
  selectCohort, bandOf, handleOf, freezeManifest, assertManifestUnchanged,
  progressOf, attrition, flattenClaims, orderClaims, isLabel, aggregate, friction,
  briefFor69, PILOT_PRIORITY, MAX_SIZE,
} from './pilot-core.mjs'

const DIR = '.twinai-pilot'
const FILE = join(DIR, 'run.json')
const load = () => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : null)
const save = (s) => { mkdirSync(DIR, { recursive: true }); writeFileSync(FILE, JSON.stringify(s, null, 2)) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** ⚠️ RE-DECLARED HERE, AND THE COMMENT SAYS WHY. The worker's SCHEMA_REQUIREMENTS
 *  is TypeScript this script cannot import. Probing the same columns is a second
 *  statement of the same requirement, which is a real cost — but the alternative
 *  is spending eight downloads to discover a missing column afterwards. */
const CAPABILITIES = [
  { table: 'reference_content_profiles', columns: 'url,visual_profile,frames_sampled,visual_failure_code' },
  { table: 'reference_frames', columns: 'url,frame_index,at_seconds,storage_path' },
]

export async function runReview(db, opts) {
  const size = Math.min(MAX_SIZE, Math.max(1, Number(opts.size) || 8))
  let run = load()

  // ── 1. SELECT, and freeze ────────────────────────────────────────────────
  if (!run) {
    const { data: rows, error } = await db.from('reference_content_profiles')
      .select('url, transcript_chars').like('error', 'no_speech%')
    if (error) throw new Error(`could not read the no-speech cohort: ${error.message}`)
    const cohort = selectCohort(rows ?? [], size)
    if (cohort.length === 0) {
      // ⚠️ AN EMPTY DRAW IS A REFUSAL, NOT AN EMPTY RUN. Proceeding would produce
      // a locked pilot of nothing and a 0% that looks like a measurement.
      throw new Error('the no-speech cohort is empty — nothing to pilot')
    }
    run = { manifest: freezeManifest(cohort, size), enqueued: false, labels: null, events: [], locked: false }
    save(run)
  }
  const m = run.manifest

  // ── 2. PREFLIGHT ─────────────────────────────────────────────────────────
  console.log(`\nPILOT SAMPLE — frozen, digest ${m.digest.slice(0, 12)}`)
  for (const u of m.urls) console.log(`  ${u}`)
  console.log(`\n  ${m.size_frozen} references · ${m.creators} creators · `
    + `${m.bands.chars_zero} at zero chars, ${m.bands.chars_tiny} thin`)
  // ⚖️ THE BILL, BEFORE THE SPEND. force bypasses the transcript cache, so each
  // reference pays a fresh acquisition AND the frames download.
  console.log(`  cost: about ${m.size_frozen * 2} downloads (${m.size_frozen} acquisitions + `
    + `${m.size_frozen} frame pulls) and ${m.size_frozen} vision calls\n`)

  if (run.locked) throw new Error('this pilot is already locked — move .twinai-pilot aside to start a new one')

  for (const cap of CAPABILITIES) {
    const { error } = await db.from(cap.table).select(cap.columns).limit(0)
    if (error) {
      throw new Error(`schema not ready for the visual route — ${cap.table}(${cap.columns}): `
        + `${error.message}. Apply the outstanding migrations before spending anything.`)
    }
  }
  console.log('  preflight: schema OK, no locked labels, sample frozen')

  // ── 3. RUN, only the frozen 8 ────────────────────────────────────────────
  if (!run.enqueued) {
    if (opts.dryRun) { console.log('\ndry run — pass --go to spend. Nothing enqueued.'); return }
    const { error } = await db.from('jobs').insert(m.urls.map((url) => ({
      type: 'assess_reference',
      priority: PILOT_PRIORITY,
      // ⚠️ EXACTLY true, and force, for the reasons frame-pilot-cohort states.
      payload: { url, platform: 'tiktok', frames: true, force: true },
    })))
    if (error) throw new Error(`could not enqueue the pilot: ${error.message}`)
    run.enqueued = true
    run.enqueuedAt = new Date().toISOString()
    save(run)
    console.log(`\n  enqueued ${m.urls.length} at priority ${PILOT_PRIORITY}`)
  }

  // ── 4. WAIT ──────────────────────────────────────────────────────────────
  let progress = null
  const deadline = Date.now() + (Number(opts.timeoutMin) || 60) * 60_000
  for (;;) {
    const { data: rows } = await db.from('reference_content_profiles')
      .select('url, visual_profile, frames_sampled, visual_failure_code').in('url', m.urls)
    const drift = assertManifestUnchanged(m, (rows ?? []).map((r) => r.url).length === m.urls.length
      ? (rows ?? []).map((r) => r.url) : m.urls)
    if (drift) throw new Error(drift)
    progress = progressOf(rows ?? [], m)
    process.stdout.write(`\r  ${progress.ready}/${m.urls.length} ready · ${progress.running} running · `
      + `${progress.failed} failed · ${progress.unreadable} unreadable   `)
    if (progress.done) break
    if (Date.now() > deadline) {
      // ⚖️ A TIMEOUT IS NOT A RESULT EITHER. Stopping with references still
      // running must not be reported as those references failing.
      console.log(`\n  stopped waiting after ${opts.timeoutMin ?? 60} min with `
        + `${progress.running} still running. Re-run this command to resume; nothing is lost.`)
      return
    }
    await sleep(15_000)
  }

  // ── 5. FAILURE REPORT ────────────────────────────────────────────────────
  const att = attrition(progress)
  console.log(`\n\nATTRITION — over the ${att.selected} SELECTED, not the survivors`)
  console.log(`  ready for label : ${att.ready_for_label}`)
  console.log(`  unreadable      : ${att.unreadable}   (frames landed, no claims)`)
  console.log(`  failed          : ${att.failed}`)
  for (const [code, n] of Object.entries(att.failures_by_code)) console.log(`      ${code}: ${n}`)
  run.attrition = att
  run.states = progress.states.map((s) => ({
    url: s.url, terminal_state: s.state,
    failure_code: s.row?.visual_failure_code ?? null,
    frames_sampled: s.row?.frames_sampled ?? null,
  }))
  save(run)
  if (att.ready_for_label === 0) throw new Error('no reference produced claims — nothing to label')

  // ── 6. PACKET ────────────────────────────────────────────────────────────
  if (!run.labels) {
    const { data: rows } = await db.from('reference_content_profiles')
      .select('url, visual_profile').in('url', m.urls).not('visual_profile', 'is', null)
    const claims = orderClaims((rows ?? []).flatMap((r) => flattenClaims(r.url, r.visual_profile)))
    run.labels = claims.map((c) => ({ ...c, label: null, correctedValue: null }))
    run.events = [{ kind: 'session_start', at: Date.now() }]
    save(run)
  }
  return run
}

/** ⚠️ AGGREGATES ARE COMPUTED ONLY HERE, AFTER THE LOCK. */
export function finish(run, reviewer) {
  run.locked = true
  run.lockedAt = new Date().toISOString()
  run.reviewer = reviewer ?? process.env.USER ?? 'unknown'
  const agg = aggregate({ locked: true, labels: run.labels })
  const fr = friction(run.events ?? [])
  run.aggregate = agg
  run.friction = fr
  run.brief69 = briefFor69(fr, agg)
  return run
}
