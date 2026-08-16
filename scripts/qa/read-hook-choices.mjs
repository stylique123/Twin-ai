#!/usr/bin/env node
// WHICH HOOKS DID CREATORS ACTUALLY CHOOSE? — the reader for `hook_choice`.
//
// ⚠️ THE COUNT THAT LOOKS RIGHT IS THE WRONG ONE. `select count(*) from
// generations where selected_hook is not null` returns 23, and 23 is not the
// number of hook preferences this product has ever observed. The recommended
// hook is written on page load so the teleprompter has a line, and 14 of those
// rows equal option[0] — indistinguishable from that write. The preference
// count is 8.
//
// ⚖️ SO THIS READER REFUSES THE AGGREGATE THAT FLATTERS. It reports choices,
// defaults, freeform and unattributable rows separately, and it will not sum
// them. A number quoted later as though it meant something is the failure this
// whole programme is a reaction to.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/qa/read-hook-choices.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

// ⚠️ THE THRESHOLD IS NOT A ROUND NUMBER PICKED FOR COMFORT. Five options means
// chance alone puts 20% of picks on any position; separating a preference from
// that needs tens of observations, not a handful. `read-edit-pairs.mjs` uses 100
// globally for the same reason and this matches it deliberately.
const MIN_PICKS_TO_RANK = 100

const db = createClient(url, key)
const { data, error } = await db
  .from('generations')
  .select('id, selected_hook, hook_choice, blueprint, created_at')
  .not('selected_hook', 'is', null)
  .order('created_at', { ascending: false })
  .limit(2000)
if (error) { console.error('read failed:', error.message); process.exit(1) }

const rows = data ?? []
const buckets = { creator: [], default: [], freeform: [], unattributable: [] }
for (const r of rows) {
  const s = r.hook_choice?.source
  if (s === 'creator' || s === 'default' || s === 'freeform') buckets[s].push(r)
  // ⚠️ NULL IS ITS OWN BUCKET, NOT A DEFAULT. A row written before 0134 is one
  // we cannot interpret — which is a different claim from "nobody chose".
  else buckets.unattributable.push(r)
}

console.log(`rows with a stored hook: ${rows.length}`)
console.log(`  creator picks   : ${buckets.creator.length}   <- the only preference signal`)
console.log(`  our defaults    : ${buckets.default.length}`)
console.log(`  freeform text   : ${buckets.freeform.length}`)
console.log(`  unattributable  : ${buckets.unattributable.length}  (predates 0134 — not "no choice")`)

if (buckets.creator.length < MIN_PICKS_TO_RANK) {
  console.log(`\nNOT RANKABLE (${buckets.creator.length}/${MIN_PICKS_TO_RANK}).`)
  console.log('Position counts below are counts. They are not evidence that any position wins.')
}

const byIndex = {}
for (const r of buckets.creator) byIndex[r.hook_choice.index] = (byIndex[r.hook_choice.index] ?? 0) + 1
console.log('\nCHOSEN POSITION (creator picks only)')
console.log(JSON.stringify(byIndex, null, 1))

// ⚠️ THE ONE ROW THAT USED THE FIELD AS A MESSAGE. Worth reading rather than
// cleaning: a creator typing an instruction into a hook field is telling us the
// product gave them no other channel.
if (buckets.freeform.length) {
  console.log('\nFREEFORM — the creator wrote something that was not a hook')
  for (const r of buckets.freeform) console.log(`  ${r.id.slice(0, 8)}: ${String(r.selected_hook).slice(0, 120)}`)
}

console.log('\nMOST RECENT CREATOR PICKS (read these before believing any count above)')
for (const r of buckets.creator.slice(0, 10)) {
  const opts = r.blueprint?.hook_options ?? []
  console.log(`\n  [#${r.hook_choice.index} of ${opts.length}] ${String(r.selected_hook).slice(0, 140)}`)
  console.log(`  passed over: ${opts.filter((_, i) => i !== r.hook_choice.index).length} options`)
}
