#!/usr/bin/env node
// WHAT HAVE CREATORS ACTUALLY CHANGED? — the reader for `script_edits`.
//
// ⚠️ THIS EXISTS SO THE CLASSIFIER IS NOT WRITE-ONLY. A taxonomy with no reader
// is the defect this repo has now found in `product_entities`, in six expiring
// counters and in `generations.capability_flags`. The classifier ships with the
// thing that reads it, or it does not ship.
//
// ⚖️ IT REFUSES TO REPORT A LESSON THE SAMPLE CANNOT CARRY. Twenty pairs for one
// creator, a hundred overall — below that it prints the counts and says plainly
// that they are counts, not preferences. The alternative is the failure this
// whole programme is a reaction to: a number quoted later as though it meant
// something.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/qa/read-edit-pairs.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

// Lifted from packages/shared/src/editClassification.ts rather than retyped —
// a harness that carries its own copy of a rule measures a product nobody ships,
// which this repo has recorded six times.
const REWRITE_KEPT_SHARE = 0.3
const LENGTH_DELTA_MIN = 3
const MIN_PAIRS_PER_CREATOR = 20
const MIN_PAIRS_GLOBAL = 100

const classify = (f) => {
  if ((f?.keptShare ?? 1) < REWRITE_KEPT_SHARE) return 'rewritten'
  if (f?.addedFigure) return 'made_concrete'
  if (f?.addedFirstPerson) return 'made_personal'
  if ((f?.wordDelta ?? 0) <= -LENGTH_DELTA_MIN) return 'tightened'
  if ((f?.wordDelta ?? 0) >= LENGTH_DELTA_MIN) return 'expanded'
  return 'unclassified'
}

const db = createClient(url, key)
const { data, error } = await db
  .from('script_edits')
  .select('owner_id, target, scene_number, before_text, after_text, facts, created_at')
  .order('created_at', { ascending: false })
  .limit(2000)
if (error) { console.error('read failed:', error.message); process.exit(1) }

const rows = data ?? []
console.log(`edit pairs stored: ${rows.length}`)
if (!rows.length) {
  console.log('\nNothing to read yet. The capture is live; a creator has to rewrite a line.')
  process.exit(0)
}

const tally = (list) => list.reduce((a, r) => {
  const t = classify(r.facts); a[t] = (a[t] ?? 0) + 1; return a
}, {})

const global_ = tally(rows)
console.log('\nGLOBAL')
console.log(JSON.stringify(global_, null, 1))
console.log(rows.length >= MIN_PAIRS_GLOBAL
  ? 'reportable: these are directions.'
  : `NOT REPORTABLE (${rows.length}/${MIN_PAIRS_GLOBAL}) — counts, not preferences.`)

const byOwner = {}
for (const r of rows) (byOwner[r.owner_id] ??= []).push(r)
console.log('\nPER CREATOR')
for (const [owner, list] of Object.entries(byOwner)) {
  const ok = list.length >= MIN_PAIRS_PER_CREATOR
  console.log(`  ${owner.slice(0, 8)} · ${list.length} pairs · ${ok ? 'reportable' : 'below threshold'}`)
  if (ok) console.log(`    ${JSON.stringify(tally(list))}`)
}

// ⚠️ THE PAIRS THEMSELVES ARE THE POINT, and the counts are only an index into
// them. Every conclusion this session got wrong came from trusting a metric over
// the text it was computed from.
console.log('\nMOST RECENT PAIRS (read these before believing any count above)')
for (const r of rows.slice(0, 10)) {
  console.log(`\n  [${r.target}${r.scene_number ? ` ${r.scene_number}` : ''}] ${classify(r.facts)}  kept ${r.facts?.keptShare ?? '?'}`)
  console.log(`  before: ${String(r.before_text).slice(0, 160)}`)
  console.log(`  after : ${String(r.after_text).slice(0, 160)}`)
}
