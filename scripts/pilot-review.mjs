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
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import {
  selectCohort, bandOf, handleOf, freezeManifest, assertManifestUnchanged,
  progressOf, attrition, flattenClaims, orderClaims, isLabel, aggregate, friction,
  briefFor69, claimsDigest, evidenceDigest, byField, bySituation, slowestFields,
  PILOT_PRIORITY, MAX_SIZE,
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

  // ⚠️ A REFERENCE ALREADY LABELLED IN A LOCKED PILOT MUST NOT BE RE-DRAWN. The
  // second set of labels would not be independent of the first -- the reviewer
  // remembers -- and averaging them would report agreement with themselves as
  // accuracy. Prior runs are kept beside the current one for exactly this check.
  const priorLocked = existsSync(join(DIR, 'locked'))
    ? readdirSync(join(DIR, 'locked')).flatMap((f) => {
        try { return JSON.parse(readFileSync(join(DIR, 'locked', f), 'utf8')).manifest?.urls ?? [] }
        catch { return [] }
      })
    : []
  const repeats = m.urls.filter((u) => priorLocked.includes(u))
  if (repeats.length) {
    throw new Error(`${repeats.length} reference(s) were already labelled in a locked pilot: `
      + `${repeats.slice(0, 3).join(', ')}${repeats.length > 3 ? '…' : ''}. A second set of labels `
      + 'is not independent of the first. Draw a fresh sample, or review the locked run instead.')
  }

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
      // ⚠️ THE REJECTIONS COME TOO. What the model said that was THROWN OUT is
      // evidence about the prompt, and a reviewer judging a thin profile
      // deserves to see whether the pass answered nothing or answered badly.
      .select('url, visual_profile, visual_rejections, download_route')
      .in('url', m.urls).not('visual_profile', 'is', null)
    const claims = orderClaims((rows ?? []).flatMap((r) => flattenClaims(r.url, r.visual_profile)))
    run.context = Object.fromEntries((rows ?? []).map((r) => [r.url, {
      // ⚖️ RECORDED PER REFERENCE, because a failure pattern that follows one
      // download route is a routing finding, not a model finding.
      download_route: r.download_route ?? null,
      rejections: r.visual_rejections ?? null,
    }]))
    run.labels = claims.map((c) => ({ ...c, label: null, correctedValue: null }))
    // ⚠️ THE EVIDENCE IS CAPTURED NOW, WHILE IT IS WHAT THE REVIEWER WILL SEE.
    // Reading it at lock time instead would digest whatever the table holds by
    // then, which is not necessarily what was on screen.
    const { data: fr } = await db.from('reference_frames')
      // ⚠️ at_seconds TRAVELS WITH THE FRAME. A claim about what CHANGES needs
      // to know whether its two cited frames are half a second or half a minute
      // apart -- without the timestamps the reviewer is judging a temporal claim
      // from stills that could be anywhere in the clip.
      .select('url, frame_index, sha256, at_seconds, schedule_basis')
      .in('url', [...new Set(run.labels.map((l) => l.url))])
    run.frames = fr ?? []
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
  // ⚠️ THE OVERALL RATE CANNOT TELL A UNIFORMLY MEDIOCRE PASS FROM A GOOD ONE
  // WITH TWO BROKEN FIELDS, and those have opposite fixes: retune the prompt, or
  // drop two fields.
  run.by_field = byField(run.labels)
  run.by_situation = bySituation(run.labels)
  run.slowest_fields = slowestFields(run.events ?? [], run.labels)
  run.brief69 = briefFor69(fr, agg, slowestFields(run.events ?? [], run.labels))
  // ⚖️ THE REVIEWED OBJECT, RECOVERABLE. A later re-run that changes the claims
  // or re-draws the frames will not match these, and the mismatch is the point:
  // it says these labels describe something that no longer exists rather than
  // letting them look current.
  run.digests = {
    sample: run.manifest.digest,
    claims: claimsDigest(run.labels),
    evidence: evidenceDigest(run.frames ?? []),
  }
  // ⚠️ A LOCK IS FINAL FOR THIS VERSION. Re-reviewing is a NEW version with its
  // own digests, never an edit of this one — an editable lock is a note.
  run.review_version = (run.review_version ?? 0) + 1
  return run
}

// ─────────────────────────── 7-9: the review UI ──────────────────────────────

/** ⚠️ "EVERY REQUIRED CLAIM" EXCLUDES NOTHING SILENTLY. A skip leaves the claim
 *  unanswered, so the lock stays out of reach until it is revisited — which is
 *  the point of a skip rather than a quiet drop. */
export const remaining = (run) => run.labels.filter((l) => !isLabel(l.label)).length
export const canFinish = (run) => remaining(run) === 0

export async function serveReview(db, run, save, port) {
  const page = readFileSync(new URL('./pilot-review.html', import.meta.url), 'utf8')
  const frameCache = new Map()

  async function frameBytes(url, index) {
    const k = `${url}|${index}`
    if (frameCache.has(k)) return frameCache.get(k)
    const { data: row } = await db.from('reference_frames')
      .select('storage_path').eq('url', url).eq('frame_index', index).maybeSingle()
    if (!row) return null
    const { data, error } = await db.storage.from('reference-frames').download(row.storage_path)
    if (error || !data) return null
    const buf = Buffer.from(await data.arrayBuffer())
    frameCache.set(k, buf)
    return buf
  }

  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const u = new URL(req.url, `http://localhost:${port}`)
      const json = (o, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)) }

      if (u.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(page) }

      if (u.pathname === '/claims') {
        // ⚠️ NO AGGREGATE IN THIS PAYLOAD, DELIBERATELY. A running accuracy on
        // screen is how the last few labels start agreeing with the first few,
        // and it would be trivial to include here by accident.
        return json({
          labels: run.labels, remaining: remaining(run), canFinish: canFinish(run), locked: run.locked,
          // ⚖️ STILL NO AGGREGATE. Timestamps and rejections are EVIDENCE about
          // the claim on screen; an accuracy figure is a verdict about the
          // labels already given, and only one of those belongs here.
          frames: run.frames ?? [], context: run.context ?? {},
        })
      }

      if (u.pathname === '/frame') {
        const bytes = await frameBytes(u.searchParams.get('url'), Number(u.searchParams.get('i')))
        if (!bytes) { res.writeHead(404); return res.end() }
        res.writeHead(200, { 'content-type': 'image/jpeg' })
        return res.end(bytes)
      }

      if (u.pathname === '/label' && req.method === 'POST') {
        if (run.locked) return json({ error: 'this review is locked' }, 409)
        let body = ''
        for await (const c of req) body += c
        const { index, label, correctedValue, kind } = JSON.parse(body || '{}')
        const row = run.labels[index]
        if (!row || (label !== null && !isLabel(label))) return json({ error: 'not a label' }, 400)
        if (isLabel(row.label)) run.events.push({ kind: 'relabel', at: Date.now(), index })
        row.label = label
        row.correctedValue = correctedValue ?? null
        run.events.push({ kind: kind === 'skip' ? 'skip' : 'label', at: Date.now(), index })
        save(run)   // ⚠️ EVERY ANSWER, not at the end: a lost session is a session done twice.
        return json({ saved: true, remaining: remaining(run), canFinish: canFinish(run) })
      }

      if (u.pathname === '/event' && req.method === 'POST') {
        let body = ''
        for await (const c of req) body += c
        const e = JSON.parse(body || '{}')
        if (['frame_change', 'nav', 'key'].includes(e.kind)) {
          run.events.push({ kind: e.kind, at: Date.now(), via: e.via ?? null })
          save(run)
        }
        return json({ ok: true })
      }

      if (u.pathname === '/finish' && req.method === 'POST') {
        // ⚖️ THE SERVER REFUSES, NOT JUST THE BUTTON. A disabled control is a
        // suggestion; this is the rule.
        if (!canFinish(run)) return json({ error: `${remaining(run)} claims still unanswered` }, 409)
        finish(run, process.env.PILOT_REVIEWER)
        save(run)
        // ⚖️ ARCHIVED UNDER ITS OWN DIGEST. A locked run that stayed only in
        // run.json would be overwritten by the next pilot, and the "already
        // labelled" refusal above would have nothing to consult.
        mkdirSync(join(DIR, 'locked'), { recursive: true })
        copyFileSync(FILE, join(DIR, 'locked', `${run.manifest.digest.slice(0, 16)}.json`))
        json({ locked: true })
        server.close()
        return resolve(run)
      }

      res.writeHead(404); res.end()
    })
    server.listen(port, '127.0.0.1', () => {
      console.log(`\n  ${run.labels.length} claims to label. open http://localhost:${port}`)
      console.log('  1 supported · 2 unsupported · 3 indeterminate · 4 wrong evidence · s skip')
      console.log('  the numbers stay hidden until you press Finish & lock.\n')
    })
  })
}

/** ⚠️ 13: THE FINAL OUTPUT, AND IT LEADS WITH THE DENOMINATOR. */
export function report(run) {
  const a = run.aggregate, f = run.friction, b = run.brief69, at = run.attrition
  const pct = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`)
  const L = []
  L.push('\nPILOT LOCKED')
  L.push(`  reviewer ${run.reviewer} · ${run.lockedAt} · review version ${run.review_version}`)
  // ⚠️ PRINTED, NOT ONLY STORED. A digest nobody sees is a digest nobody checks,
  // and these are what say these labels describe an object that still exists.
  L.push(`  sample ${run.digests.sample.slice(0, 12)} · claims ${run.digests.claims.slice(0, 12)} `
    + `· evidence ${run.digests.evidence === null
      ? 'NOT CAPTURED — no frame rows were found for the reviewed references'
      : run.digests.evidence.slice(0, 12)}`)
  L.push(`\n  selected            ${at.selected}`)
  L.push(`  successfully assessed ${at.ready_for_label}   (${pct(at.assessed_of_selected)} of selected)`)
  L.push(`  unreadable          ${at.unreadable}`)
  L.push(`  failed              ${at.failed}`)
  for (const [c, n] of Object.entries(at.failures_by_code)) L.push(`      ${c}: ${n}`)
  L.push(`\n  claims labelled     ${a.claims_labelled} of ${a.claims_shown}`)
  L.push(`  supported           ${pct(a.supported_of_all_asked)} of everything asked`)
  L.push(`                      ${pct(a.supported_of_answered)} of what the model answered`)
  L.push(`  unsupported         ${a.distribution.UNSUPPORTED}`)
  L.push(`  indeterminate       ${a.distribution.INDETERMINATE}`)
  L.push(`  wrong evidence      ${pct(a.wrong_evidence_rate)}`)
  L.push(`\n  REVIEW FRICTION`)
  L.push(`  median per claim    ${Math.round((f.median_ms_per_claim ?? 0) / 100) / 10}s`)
  L.push(`  slowest             ${Math.round((f.slowest_ms ?? 0) / 100) / 10}s`)
  L.push(`  backtracks          ${f.backtracks}`)
  L.push(`  frame enlargements  ${f.evidence_frame_changes}`)
  L.push(`  skipped             ${f.skipped}`)
  const slow = (run.slowest_fields ?? []).slice(0, 3)
  if (slow.length) {
    L.push('  slowest fields')
    for (const x of slow) L.push(`      ${x.path.padEnd(28)} ${Math.round(x.median_ms / 100) / 10}s median, ${x.labelled} labels)`)
  }
  // ⚖️ WORST FIELDS FIRST, and never-answered called out separately, because
  // "the model is silent here" and "the model is wrong here" are different
  // problems with different fixes.
  const fields = Object.entries(run.by_field ?? {})
  const broken = fields.filter(([, v]) => v.supported_of_answered !== null && v.supported_of_answered < 0.5)
    .sort((a, b) => a[1].supported_of_answered - b[1].supported_of_answered)
  const silent = fields.filter(([, v]) => v.never_answered).map(([k]) => k)
  if (broken.length) {
    L.push('\n  FIELDS THE MODEL GETS WRONG')
    for (const [k, v] of broken) L.push(`      ${k.padEnd(28)} ${pct(v.supported_of_answered)} of ${v.answered} answered`)
  }
  if (silent.length) L.push(`\n  FIELDS THE MODEL NEVER ANSWERED (not the same as wrong): ${silent.join(', ')}`)
  const sits = Object.entries(run.by_situation ?? {}).filter(([k]) => k !== 'situation_unconfirmed')
  if (sits.length) {
    L.push('\n  BY VISUAL SITUATION — only where a human confirmed what the video is')
    for (const [k, v] of sits) L.push(`      ${k.padEnd(28)} ${pct(v.supported_of_answered)} across ${v.references} reference(s)`)
    const unc = run.by_situation.situation_unconfirmed
    if (unc) L.push(`      ${'situation unconfirmed'.padEnd(28)} ${unc.references} reference(s) — primaryMode was not SUPPORTED`)
  }
  L.push(`\n  #69 — ${b.verdict}`)
  for (const i of b.items) L.push(`   · ${i.change}\n       because ${i.because}`)
  if (b.items.length) L.push(`\n  thresholds: ${b.thresholds}`)
  return L.join('\n')
}
