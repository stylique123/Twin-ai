#!/usr/bin/env node
// THE 5-10 NO-SPEECH REFERENCES THAT DECIDE WHETHER TO TOUCH THE 332.
//
// ⚠️ THE SPEND IS THE POINT OF THE CAP. Looking at a reference costs a SECOND
// download of the same video. Running the frames pass over the whole no-speech
// population to prepare a labelling session would turn "label a pilot" into
// "reprocess the library" -- pre-empting the exact decision the pilot exists to
// inform. So the ceiling is 10 and the default invocation spends nothing.
//
// ⚖️ AND THE FIVE VISUAL SITUATIONS CANNOT BE SELECTED FOR. The spread we want
// -- product demo, text overlay with no usable speech, movement or POV, screen
// content, and one visually ambiguous -- is a description of what the FRAMES
// show. Selecting on it would require the labels the pilot exists to produce,
// so choosing on it now is choosing the answer. What this script can do is
// spread the draw across every axis that IS observable before looking, and then
// report which visual situations actually turned up. Planned versus realised,
// with the attrition stated, is the honest version of representative.
//
// ⚠️ THE OBSERVABLE AXES ARE THINNER THAN THEY LOOK. Measured on production:
// all 332 no-speech rows are ONE platform and ONE download route, so neither
// stratifies anything. What remains is the transcript band (51 rows at exactly
// zero characters, 281 between 1 and 119) and the creator, of which there are
// 305 distinct across 332 rows. One reference per creator is nearly free here
// and it is the difference between ten visual situations and one creator's ten
// videos.
//
// ⚠️ DETERMINISTIC, so the draw can be argued with after the fact. Selection is
// a pure function of the rows and the size: "was that a property of the library
// or of the sample" stays answerable after the prompt changes.
//
//   node scripts/frame-pilot-cohort.mjs --selftest   # no credentials needed
//   node scripts/frame-pilot-cohort.mjs              # dry run: show the draw
//   node scripts/frame-pilot-cohort.mjs --go         # enqueue it (SPENDS)
//   node scripts/frame-pilot-cohort.mjs --report     # realised spread + attrition
import { createHash } from 'node:crypto'

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : (process.argv[i + 1] ?? true) }
const flag = (n) => process.argv.includes(`--${n}`)

export const DEFAULT_SIZE = 8
/** ⚠️ TEN IS THE CEILING AND IT IS DELIBERATE. This is the step before deciding
 *  whether the visual pass is trustworthy enough to touch 332 references. A
 *  "pilot" of 40 has already made that decision by spending it. */
export const MAX_SIZE = 10

/** ⚖️ BELOW THE BACKLOG, WHICH IS ITSELF BELOW CREATOR WORK. The queue orders by
 *  priority desc. A pilot that preempts a creator's scan has cost more than it
 *  can learn. */
export const PILOT_PRIORITY = -20

/** The creator, from a TikTok reference url. ⚠️ Ten videos from one creator are
 *  ten samples of one visual situation, which is the failure mode a "random"
 *  draw hides. */
export const handleOf = (url) => {
  const m = /@([^/?#]+)/.exec(String(url ?? ''))
  return m ? m[1].toLowerCase() : null
}

/** ⚠️ TWO BANDS, NOT ONE. A transcript of exactly zero characters is a different
 *  fact from one of six: the first is silence or a failure to hear anything at
 *  all, the second is a video that made a sound we could read and it was not
 *  speech. Merging them would let the draw come entirely from the 281. */
export const bandOf = (chars) => (Number(chars) === 0 ? 'chars_zero' : 'chars_tiny')

const rank = (url) => createHash('sha256').update(String(url)).digest('hex')

/**
 * Draw the cohort.
 *
 * ⚖️ ONE PER CREATOR, ALTERNATING BANDS, ORDERED BY A DIGEST OF THE URL. The
 * digest is what makes it re-drawable: same rows and same size give the same
 * cohort on any machine, so a later argument about the sample is settleable.
 */
export function selectCohort(rows, size = DEFAULT_SIZE) {
  const n = Math.max(1, Math.min(MAX_SIZE, Number(size) || DEFAULT_SIZE))
  const seen = new Set()
  const bands = { chars_zero: [], chars_tiny: [] }

  for (const r of [...rows].sort((a, b) => rank(a.url).localeCompare(rank(b.url)))) {
    const h = handleOf(r.url)
    // A url with no handle is still a reference; it just cannot be deduplicated
    // by creator, so it is kept rather than silently dropped.
    if (h !== null) {
      if (seen.has(h)) continue
      seen.add(h)
    }
    bands[bandOf(r.transcript_chars)].push(r)
  }

  // ⚠️ ALTERNATE, DO NOT SPLIT IN HALF. The bands are 51 and 281 deep; a
  // proportional draw would give the zero-character band one slot out of eight
  // and call it represented.
  const out = []
  for (let i = 0; out.length < n && (bands.chars_zero.length || bands.chars_tiny.length); i++) {
    const first = i % 2 === 0 ? 'chars_zero' : 'chars_tiny'
    const second = first === 'chars_zero' ? 'chars_tiny' : 'chars_zero'
    const pick = bands[first].shift() ?? bands[second].shift()
    if (pick) out.push(pick)
  }
  return out
}

if (flag('selftest')) {
  let failed = 0
  const row = (url, chars) => ({ url, transcript_chars: chars })
  const many = (n, chars, prefix = 'c') => Array.from({ length: n }, (_, i) =>
    row(`https://www.tiktok.com/@${prefix}${i}/video/${i}`, chars))

  const cases = [
    ['caps at MAX_SIZE however large the ask',
      () => selectCohort(many(50, 0), 40).length === MAX_SIZE],
    ['returns the ask when the library can fill it',
      () => selectCohort(many(50, 0), 6).length === 6],
    ['is deterministic — same rows, same draw',
      () => JSON.stringify(selectCohort(many(50, 5), 8)) === JSON.stringify(selectCohort(many(50, 5), 8))],
    ['does not depend on the order rows arrive in',
      () => JSON.stringify(selectCohort(many(50, 5), 8))
         === JSON.stringify(selectCohort([...many(50, 5)].reverse(), 8))],
    // ⚠️ THE FAILURE A RANDOM DRAW HIDES.
    ['never takes two references from one creator', () => {
      const rows = Array.from({ length: 30 }, (_, i) =>
        row(`https://www.tiktok.com/@same/video/${i}`, i % 2 === 0 ? 0 : 9))
      return selectCohort(rows, 8).length === 1
    }],
    // ⚖️ THE 51 MUST NOT BE ROUNDED AWAY BY THE 281.
    ['gives the thin band real slots, not proportional ones', () => {
      const rows = [...many(6, 0, 'z'), ...many(200, 40, 't')]
      const got = selectCohort(rows, 8).filter((r) => r.transcript_chars === 0).length
      return got >= 3
    }],
    ['falls back to the other band when one runs dry', () => {
      const rows = [...many(2, 0, 'z'), ...many(50, 40, 't')]
      return selectCohort(rows, 8).length === 8
    }],
    ['keeps a url with no creator handle rather than dropping it',
      () => selectCohort([row('https://example.com/v/1', 0)], 4).length === 1],
    ['bands split at exactly zero, not at the speech floor',
      () => bandOf(0) === 'chars_zero' && bandOf(1) === 'chars_tiny' && bandOf(119) === 'chars_tiny'],
    ['an empty library draws nothing rather than throwing',
      () => selectCohort([], 8).length === 0],
  ]
  for (const [name, fn] of cases) {
    let ok = false
    try { ok = fn() === true } catch (e) { console.error(`  ${name}: threw ${e.message}`) }
    if (!ok) { console.error(`selftest: ${name} — FAILED`); failed++ } else console.log(`  ok: ${name}`)
  }
  if (failed) process.exit(1)
  console.log('frame-pilot-cohort selftest: all cases passed')
  process.exit(0)
}

// ⚠️ LAZY, SO THE SELFTEST NEEDS NO CREDENTIALS — the same reason
// frame-pilot.mjs defers its client. A check that cannot run without the most
// dangerous secret in the system will not run in CI, which is the only place it
// would catch anything.
const { createClient } = await import('@supabase/supabase-js')
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required'); process.exit(2) }
const db = createClient(url, key, { auth: { persistSession: false } })

const { data: rows, error } = await db.from('reference_content_profiles')
  .select('url, transcript_chars, visual_profile, frames_sampled, visual_failure_code')
  .like('error', 'no_speech%')
if (error) { console.error(error.message); process.exit(1) }

if (flag('report')) {
  const looked = rows.filter((r) => r.frames_sampled !== null)
  const withClaims = looked.filter((r) => r.visual_profile !== null)
  const failed = rows.filter((r) => r.visual_failure_code !== null)
  // ⚠️ WHY IT FAILED, BROKEN OUT. "8 references yielded nothing" has at least
  // three causes with three different next actions: FFMPEG_MISSING is a broken
  // box, an IP_BLOCKED is a download route, and NO_FRAMES_SAMPLED is a genuine
  // property of the video. Reporting one total would send somebody to fix the
  // wrong thing, or worse, to conclude the visual pass cannot read this library.
  const byCode = {}
  for (const r of failed) byCode[r.visual_failure_code] = (byCode[r.visual_failure_code] ?? 0) + 1
  console.log(JSON.stringify({
    no_speech_population: rows.length,
    // ⚖️ FOUR NUMBERS, NOT ONE RATE. Cost is not yield, and a pass that ran and
    // saw nothing is a different fact from one that tried and could not, which
    // is a different fact again from one that never ran.
    looked_at: looked.length,
    produced_claims: withClaims.length,
    produced_nothing: looked.length - withClaims.length,
    tried_and_failed: failed.length,
    failures_by_code: byCode,
    // ⚠️ THE REMAINDER IS NOT A RESULT. Everything neither looked at nor failed
    // is simply un-attempted, and naming it stops it being read as a yield.
    never_attempted: rows.length - looked.length - failed.length,
  }, null, 2))
  process.exit(0)
}

const cohort = selectCohort(rows, arg('size', DEFAULT_SIZE))
console.log(JSON.stringify({
  drawn: cohort.length,
  chars_zero: cohort.filter((r) => bandOf(r.transcript_chars) === 'chars_zero').length,
  chars_tiny: cohort.filter((r) => bandOf(r.transcript_chars) === 'chars_tiny').length,
  creators: new Set(cohort.map((r) => handleOf(r.url))).size,
  urls: cohort.map((r) => r.url),
}, null, 2))

if (!flag('go')) {
  console.log('\ndry run. --go enqueues these and SPENDS about two downloads each.')
  process.exit(0)
}

// ⚠️ frames: true IS THE WHOLE REQUEST, and EXACTLY true. The handler tests
// `p.frames === true`; anything else silently skips the pass and the pilot
// would report an absence it caused itself. Without it assessReference marks the
// row visual_route and returns, which is what the 332 have been getting.
//
// ⚖️ force: true COSTS MORE THAN IT LOOKS, AND IS STILL RIGHT. Without it the
// handler skips an already-assessed reference and the cohort enqueues no-ops.
// With it the transcript cache is bypassed too, so each reference pays a fresh
// acquisition AND the frames download -- roughly two downloads per reference,
// not one. That is the honest price of re-checking a no-speech verdict against
// the transcript we would get today rather than the one we remember, which is
// the same lesson 0159 was written for.
const jobs = cohort.map((r) => ({
  type: 'assess_reference',
  priority: PILOT_PRIORITY,
  payload: { url: r.url, platform: 'tiktok', frames: true, force: true },
}))
const { error: qErr } = await db.from('jobs').insert(jobs)
if (qErr) { console.error(qErr.message); process.exit(1) }
console.log(`enqueued ${jobs.length} at priority ${PILOT_PRIORITY}`)
