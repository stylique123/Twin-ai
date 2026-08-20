#!/usr/bin/env node
// THE 20–40 THAT DECIDE WHETHER THE FRAMES PASS IS WORTH RUNNING AT ALL.
//
// ⚠️ THE TRANSCRIPT PILOT'S STRATA ARE THE WRONG ONES HERE. `pilotSample`
// stratifies by platform then niche, because transcript COST is dominated by
// long-form YouTube. The frames pass costs the same for a 20-second TikTok
// whatever its niche, and what varies is not price but whether the pass can SEE
// anything — so the strata are the visual situations, and a sample drawn by
// platform would be four hundred talking-heads that never exercise
// `requires_second_person` or `requires_multiple_locations` at all.
//
// ⚖️ THE FOUR STRATA, AND WHY EACH EARNS ITS PLACE:
//
//   no_speech      Videos the transcript pass could not read. THE HIGHEST-VALUE
//                  STRATUM: for these, frames are the only evidence that will
//                  ever exist, and they are 79 rows of library the gallery
//                  currently cannot describe at all.
//   with_beats     Rows whose content profile carried beat timestamps, so
//                  `frameSampleTargets` returns a schedule and the sample is
//                  taken at the hook/rehook/payoff. The `content_beats` arm.
//   without_beats  Rows with a profile but no usable beats — the `uniform` arm.
//                  Without both arms `scheduleBasis` records a distinction
//                  nobody can compare.
//   long           The longest clips available. A 4-frame sample spans a 20s
//                  video densely and a 3-minute one barely at all, and if
//                  temporal claims degrade with duration that is a finding about
//                  DEFAULT_FRAME_COUNT rather than about the model.
//
// ⚠️ DETERMINISTIC, FOR THE REASON pilotSample GIVES: a pilot you cannot re-draw
// is a pilot you cannot argue with. Selection is a pure function of the rows and
// the size, so "was that a property of the library or of the sample" stays
// answerable after a prompt change.
//
// ⚠️ DRY RUN BY DEFAULT. This enqueues work that costs a SECOND download per
// video; a driver whose easiest invocation spends money is a driver that will.
//
//   node scripts/frame-pilot.mjs                 # dry run: show the sample
//   node scripts/frame-pilot.mjs --go            # enqueue it
//   node scripts/frame-pilot.mjs --report        # results once drained
//   node scripts/frame-pilot.mjs --size 40 --go
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from '@supabase/supabase-js'

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : (process.argv[i + 1] ?? true) }
const flag = (n) => process.argv.includes(`--${n}`)

const DEFAULT_SIZE = 32
/** ⚠️ THE CEILING IS LOW ON PURPOSE. This is the step BEFORE a batch decision,
 *  and a "pilot" of 400 is not a pilot — it is the batch, run without having
 *  made the decision the pilot exists to inform. */
const MAX_SIZE = 60

/** ⚖️ PRIORITY BELOW THE BACKLOG, WHICH IS ITSELF BELOW CREATOR WORK. The queue
 *  orders by `priority desc`, so -20 puts the pilot behind both. A pilot that
 *  preempts a creator's scan has cost more than it can possibly learn. */
const PILOT_PRIORITY = -20

// ⚠️ LAZY, SO THE SELFTEST NEEDS NO CREDENTIALS. Demanding the service role key
// at module load meant the one mode that touches nothing — the selection
// selftest — could only run for somebody holding production's most dangerous
// secret. A check that cannot be run without the key will not be run in CI,
// which is the only place it would catch anything.
let _db = null
function client() {
  if (_db) return _db
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required'); process.exit(2) }
  _db = createClient(url, key, { auth: { persistSession: false } })
  return _db
}

/** Beats present and usable, mirroring `frameSampleTargets`' own refusal rules:
 *  a `not_checked`/`indeterminate` basis is NOT beats, and neither is a beat
 *  list with no finite startSec. Reproduced here rather than imported because
 *  this script reads raw jsonb from the row, not a parsed profile. */
function hasUsableBeats(profile) {
  const b = profile?.structure?.beats
  if (!b || b.basis === 'not_checked' || b.basis === 'indeterminate') return false
  return Array.isArray(b.value)
    && b.value.some((x) => typeof x?.startSec === 'number' && Number.isFinite(x.startSec) && x.startSec >= 0)
}

function stratify(rows) {
  const seen = new Set()
  const take = (list) => list.filter((r) => !seen.has(r.url) && (seen.add(r.url), true))
  // ⚠️ ORDERED BY URL INSIDE EACH STRATUM, so the draw is reproducible. Ordering
  // by `assessed_at` would make the sample a function of WHEN the backlog ran.
  const byUrl = (a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0)
  const noSpeech = take(rows.filter((r) => typeof r.error === 'string' && r.error.startsWith('no_speech')).sort(byUrl))
  const clean = rows.filter((r) => !r.error)
  const withBeats = take(clean.filter((r) => hasUsableBeats(r.profile)).sort(byUrl))
  const withoutBeats = take(clean.filter((r) => !hasUsableBeats(r.profile)).sort(byUrl))
  // Longest first here, deliberately — this stratum IS the extreme.
  const long = take([...clean].sort((a, b) => (b.transcript_chars ?? 0) - (a.transcript_chars ?? 0)))
  return { no_speech: noSpeech, with_beats: withBeats, without_beats: withoutBeats, long }
}

/** Round-robin across the strata so a thin one does not silently hand its quota
 *  to whichever stratum happens to be listed first. */
function draw(strata, size) {
  const names = Object.keys(strata)
  const out = []
  const shortfall = {}
  for (let i = 0; out.length < size; i++) {
    let progressed = false
    for (const n of names) {
      if (out.length >= size) break
      const row = strata[n][i]
      if (row) { out.push({ ...row, stratum: n }); progressed = true }
    }
    // ⚠️ NO INFINITE LOOP WHEN THE LIBRARY IS SMALLER THAN THE ASK.
    if (!progressed) break
  }
  for (const n of names) {
    const got = out.filter((r) => r.stratum === n).length
    // ⚖️ NAMED, NOT SILENTLY DROPPED — the same rule pilotSample states. A
    // stratum that contributed nothing means the pilot does not test what it
    // claims to, and a caller that never hears about it will read the results
    // as though it did.
    if (got === 0) shortfall[n] = strata[n].length
  }
  return { rows: out, shortfall }
}

async function loadRows() {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client().from('reference_content_profiles')
      .select('url,platform,error,profile,transcript_chars,visual_assessed_at')
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  // ⚠️ NEVER RE-RUN A VIDEO THE VISUAL PASS ALREADY SAW. The pilot's value is in
  // fresh answers; re-reading a row would also overwrite the evidence a previous
  // round produced, which is the one thing a comparison cannot survive.
  return out.filter((r) => !r.visual_assessed_at)
}

/** ⚠️ THE SELECTION IS THE PART THAT CAN BE WRONG WITHOUT ANYONE NOTICING. A
 *  draw that quietly favours one stratum produces a pilot that answers a
 *  question nobody asked, and the results look perfectly reasonable. */
function selftest() {
  const rows = [
    { url: 'c', error: 'no_speech: transcript was 4 characters', profile: null, transcript_chars: 4 },
    { url: 'a', error: 'no_speech: transcript was 9 characters', profile: null, transcript_chars: 9 },
    { url: 'b', error: null, profile: { structure: { beats: { basis: 'transcript', value: [{ startSec: 1 }] } } }, transcript_chars: 900 },
    { url: 'd', error: null, profile: { structure: { beats: { basis: 'not_checked', value: [] } } }, transcript_chars: 4000 },
    { url: 'e', error: null, profile: { structure: { beats: { basis: 'transcript', value: [{ startSec: null }] } } }, transcript_chars: 100 },
  ]
  const st = stratify(rows)
  const ok = (label, cond) => { console.log(`  ${cond ? 'ok' : 'FAIL'}: ${label}`); if (!cond) process.exitCode = 1 }

  ok('no_speech rows are found by their error prefix', st.no_speech.map((r) => r.url).join() === 'a,c')
  ok('a beat with no finite startSec is NOT usable beats', st.without_beats.some((r) => r.url === 'e'))
  ok('not_checked basis is NOT usable beats', st.without_beats.some((r) => r.url === 'd'))
  ok('a real beat lands in with_beats', st.with_beats.map((r) => r.url).join() === 'b')
  // ⚠️ NO ROW APPEARS IN TWO STRATA. Double-counting would make a 32-row pilot
  // silently smaller than it claims.
  const all = [...st.no_speech, ...st.with_beats, ...st.without_beats, ...st.long].map((r) => r.url)
  ok('strata are disjoint', new Set(all).size === all.length)
  ok('ordering is by url, not by assessment time', st.no_speech[0].url === 'a')

  const drawn = draw(st, 3)
  ok('draws exactly what was asked for when supply allows', drawn.rows.length === 3)
  ok('round-robins rather than draining one stratum', new Set(drawn.rows.map((r) => r.stratum)).size >= 2)

  const tiny = draw(stratify(rows.slice(0, 1)), 50)
  // ⚖️ THE INFINITE-LOOP GUARD. Asking for more than exists must terminate.
  ok('terminates when the library is smaller than the ask', tiny.rows.length === 1)
  ok('names a stratum that contributed nothing', Object.keys(tiny.shortfall).length >= 1)

  const none = draw(stratify([]), 5)
  ok('an empty library draws nothing rather than hanging', none.rows.length === 0)
  console.log(process.exitCode ? 'frame-pilot selftest: FAILURES' : 'frame-pilot selftest: all cases passed')
}

async function main() {
  if (flag('selftest')) { selftest(); return }
  const size = Math.min(MAX_SIZE, Math.max(1, Number(arg('size', DEFAULT_SIZE)) || DEFAULT_SIZE))

  if (flag('report')) {
    const { data, error } = await client().from('reference_content_profiles')
      .select('url,frames_sampled,frame_schedule_basis,visual_profile,visual_rejections,visual_assessed_at')
      .not('visual_assessed_at', 'is', null)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    if (rows.length === 0) { console.log('no visual assessments yet.'); return }
    const basis = {}
    let observed = 0, unreadable = 0, indeterminate = 0, frames = 0
    for (const r of rows) {
      basis[r.frame_schedule_basis ?? '(none)'] = (basis[r.frame_schedule_basis ?? '(none)'] ?? 0) + 1
      frames += r.frames_sampled ?? 0
      observed += r.visual_profile?.fieldsObserved ?? 0
      unreadable += r.visual_profile?.fieldsUnreadable ?? 0
      indeterminate += (r.visual_profile?.indeterminate ?? []).length
    }
    const n = rows.length
    console.log(`${n} references assessed visually`)
    console.log(`  frames per reference   ${(frames / n).toFixed(2)}`)
    console.log(`  fields OBSERVED        ${(observed / n).toFixed(1)} of 15`)
    // ⚠️ THESE THREE ARE NOT INTERCHANGEABLE. `indeterminate` is the model
    // saying the frames cannot answer — a finding that RETIRES the question.
    // `unreadable` is an answer we refused. Pooling them would report a working
    // pass as a broken one, or the reverse.
    console.log(`  fields the frames could not answer (settled)  ${(indeterminate / n).toFixed(1)}`)
    console.log(`  answers REJECTED (bad or missing citation)    ${(unreadable / n).toFixed(1)}`)
    console.log(`  schedule basis         ${JSON.stringify(basis)}`)
    // ⚖️ THE QUESTION THE PILOT EXISTS TO ANSWER, asked out loud rather than
    // left to whoever reads the numbers.
    console.log('\nDecide from this: are the OBSERVED fields the ones the gallery needs')
    console.log('(secondPerson, multipleLocations, physicalProduct), or only the easy ones?')
    console.log('A high rejection rate is a PROMPT problem; a high settled rate may just be')
    console.log('honest — four stills genuinely cannot see everything.')
    return
  }

  const rows = await loadRows()
  const strata = stratify(rows)
  const { rows: chosen, shortfall } = draw(strata, size)

  console.log(`candidates ${rows.length} (never visually assessed)`)
  for (const [n, list] of Object.entries(strata)) console.log(`  ${n.padEnd(14)} available ${list.length}`)
  console.log(`\nsample of ${chosen.length}:`)
  const counts = {}
  for (const r of chosen) counts[r.stratum] = (counts[r.stratum] ?? 0) + 1
  console.log(`  ${JSON.stringify(counts)}`)
  for (const [n, avail] of Object.entries(shortfall)) {
    console.log(`  ⚠️  stratum "${n}" contributed NOTHING (${avail} available) — the pilot does not test it.`)
  }

  if (!flag('go')) {
    console.log('\ndry run. Re-run with --go to enqueue.')
    console.log('This costs ONE EXTRA DOWNLOAD PER VIDEO — the frames pass fetches video where')
    console.log('the transcript pass fetched audio. That is accepted at pilot scale and is the')
    console.log('first thing to optimise if the pass earns its place.')
    return
  }

  const jobs = chosen.map((r) => ({
    type: 'assess_reference',
    priority: PILOT_PRIORITY,
    payload: {
      url: r.url,
      platform: r.platform ?? 'unknown',
      // ⚠️ EXACTLY `true`. The handler tests `p.frames === true`; anything else
      // silently skips the pass and the pilot would report an absence it caused.
      frames: true,
      // ⚖️ FORCED, BECAUSE THE ROW ALREADY EXISTS. Without this the handler
      // skips an already-assessed reference and the pilot enqueues 32 no-ops.
      force: true,
    },
  }))
  for (let i = 0; i < jobs.length; i += 100) {
    const { error } = await client().from('jobs').insert(jobs.slice(i, i + 100))
    if (error) throw new Error(`enqueue failed at ${i}: ${error.message}`)
  }
  console.log(`\nenqueued ${jobs.length} at priority ${PILOT_PRIORITY} (behind the backlog, behind creators).`)
  console.log('Run with --report once the worker has drained them.')
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
