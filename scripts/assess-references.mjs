#!/usr/bin/env node
// ENQUEUE THE TRANSCRIPT PASS OVER THE GALLERY, PILOT FIRST.
//
// ⚠️ THIS IS THE THING WHOSE ABSENCE DELETED `transcribe`. That job type was
// registered, claimable, and enqueued by nothing at all — so it sat in the
// registry looking like a capability while doing nothing, until somebody
// noticed and removed it. `assess_reference` exists because this script drives
// it.
//
// ⚖️ AND IT DEFAULTS TO THE PILOT, NOT THE LIBRARY. The whole argument for
// running 400 before 3,946 is that industrialising the wrong schema is the
// expensive mistake; a driver whose easiest invocation is "do everything" makes
// that mistake the default.
//
// ⚠️ NEEDS `--experimental-strip-types` (Node 22+), because it imports the
// shared TypeScript source directly. There is no build step to run first.
//
//   node --experimental-strip-types scripts/assess-references.mjs           # dry run, 400
//   node --experimental-strip-types scripts/assess-references.mjs --go      # enqueue
//   node --experimental-strip-types scripts/assess-references.mjs --report  # results
//   node --experimental-strip-types scripts/assess-references.mjs --size 500 --go
//   node --experimental-strip-types scripts/assess-references.mjs --all --go
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from '@supabase/supabase-js'
// ⚠️ THE TYPESCRIPT SOURCE, NOT A BUILD OUTPUT. `@twinai/shared` is consumed as
// source everywhere (`"exports": "./src/index.ts"`) and has no build script, so
// an import of `dist/` was a path that could never exist — it sent somebody to
// run `npm run build -w @twinai/shared`, which fails with "Missing script".
//
// ⚖️ RUN THIS FILE WITH `node --experimental-strip-types`, which Node 22 supports
// natively. Copying `pilotSample` in here instead would have been the other way
// out, and it would put the selection rules in two places — the drift this repo
// keeps paying to remove.
import { pilotSample } from '../packages/shared/src/pilotSample.ts'

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`)
  return i < 0 ? fallback : (process.argv[i + 1] ?? true)
}
const flag = (name) => process.argv.includes(`--${name}`)

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(2)
}
const db = createClient(url, key, { auth: { persistSession: false } })

/** Page through every gallery row. `.select()` caps at 1,000, and a driver that
 *  silently read the first page would sample from a quarter of the library while
 *  reporting a full draw. */
async function allCandidates() {
  const out = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from('gallery_items')
      .select('url, platform, niche').range(from, from + PAGE - 1)
    if (error) throw new Error(`gallery_items read failed: ${error.message}`)
    out.push(...data)
    if (data.length < PAGE) return out
  }
}

async function report() {
  const { data, error } = await db.from('reference_content_profiles')
    .select('url, platform, fields_accepted, rejections, transcript_source, paid_because, transcript_chars, error')
  if (error) throw new Error(error.message)
  const done = data.filter((r) => !r.error)
  const failed = data.filter((r) => r.error)

  // ⚠️ PER-FIELD, BECAUSE "SOME REJECTIONS" CANNOT TELL YOU THE SCHEMA IS WRONG.
  // The pilot's real output is which fields the model cannot answer — that is
  // what says whether a field is worth keeping before 3,546 more calls.
  const byField = new Map()
  for (const r of done) {
    for (const rej of r.rejections ?? []) {
      const k = `${rej.field} (${rej.reason})`
      byField.set(k, (byField.get(k) ?? 0) + 1)
    }
  }
  const bySource = new Map()
  for (const r of done) bySource.set(r.transcript_source, (bySource.get(r.transcript_source) ?? 0) + 1)
  const paid = done.filter((r) => r.paid_because).length

  console.log(`\nassessed ${done.length}, failed ${failed.length}`)
  console.log(`mean fields accepted: ${done.length ? (done.reduce((a, r) => a + r.fields_accepted, 0) / done.length).toFixed(1) : 0} of 17`)
  console.log('\ntranscript source:')
  for (const [k, v] of [...bySource].sort((a, b) => b[1] - a[1])) console.log(`  ${k ?? 'unrecorded'}: ${v}`)
  console.log(`  billed routes: ${paid} (${done.length ? ((paid / done.length) * 100).toFixed(1) : 0}%)`)
  console.log('\nrejections by field:')
  for (const [k, v] of [...byField].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${v}\t${k}`)
  if (failed.length) {
    console.log('\nfailure reasons:')
    const why = new Map()
    for (const r of failed) {
      const k = String(r.error).slice(0, 60)
      why.set(k, (why.get(k) ?? 0) + 1)
    }
    for (const [k, v] of [...why].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${v}\t${k}`)
  }
}

async function main() {
  if (flag('report')) return report()

  const rows = await allCandidates()
  console.log(`gallery rows: ${rows.length}`)

  // ⚖️ ALREADY-ASSESSED VIDEOS ARE DROPPED HERE AS WELL AS IN THE HANDLER.
  // The handler's skip protects against paying twice; this one keeps the QUEUE
  // from filling with thousands of no-ops that hide the real work behind them.
  const { data: existing } = await db.from('reference_content_profiles')
    .select('url').is('error', null)
  const done = new Set((existing ?? []).map((r) => r.url))

  let chosen
  if (flag('all')) {
    // ⚠️ STILL EXCLUDES WHAT CANNOT BE TRANSCRIBED. `pilotSample` at full size
    // reuses one rule for "is this a video", so `--all` cannot quietly enqueue
    // the 689 hashtag pages that `--go` correctly skips.
    chosen = pilotSample(rows, rows.length, { minPerPlatform: 0 })
  } else {
    chosen = pilotSample(rows, Number(arg('size', 400)))
  }

  const queue = chosen.urls.filter((u) => !done.has(u))
  const platformOf = new Map(rows.map((r) => [r.url, r.platform]))

  console.log(`selected ${chosen.urls.length}, already assessed ${chosen.urls.length - queue.length}, to enqueue ${queue.length}`)
  console.log('by platform:', JSON.stringify(chosen.byPlatform))
  console.log('niches covered:', chosen.nichesCovered)
  console.log('excluded:', JSON.stringify(chosen.excluded))
  if (chosen.shortfalls.length) console.log('SHORTFALLS:', JSON.stringify(chosen.shortfalls))

  if (!flag('go')) {
    console.log('\ndry run — pass --go to enqueue')
    return
  }

  // Chunked so one oversized insert cannot fail the whole enqueue.
  let queued = 0
  for (let i = 0; i < queue.length; i += 200) {
    const chunk = queue.slice(i, i + 200).map((u) => ({
      type: 'assess_reference',
      payload: { url: u, platform: platformOf.get(u) ?? 'unknown' },
    }))
    const { error } = await db.from('jobs').insert(chunk)
    if (error) throw new Error(`enqueue failed at ${i}: ${error.message}`)
    queued += chunk.length
    console.log(`queued ${queued}/${queue.length}`)
  }
  console.log(`\nenqueued ${queued}. Run with --report once the worker has drained them.`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
