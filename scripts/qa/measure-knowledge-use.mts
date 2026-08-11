#!/usr/bin/env node
// IS THE WRITER PERMITTED TO SAY MORE, OR IS IT JUST NOT SAYING IT?
//
// ⚠️ THE QUESTION THIS SETTLED, AND THE ROADMAP IT REDIRECTED. "Transcripts are
// the big unlock" was the top item on the plan for weeks. It rested on an
// unmeasured premise: that the evidence ladder was blocking the lines that
// would have carried substance. Measured over 1,436 real beats, 97.8% of them
// are already `discussion` strength — which coverage-level evidence permits.
// Raising the ceiling would unlock about one beat in forty.
//
// What IS missing is use: 58% of beats touch none of the creator's substance,
// and only 12-36% of a creator's stored knowledge ever reaches a script.
//
//   npx tsx scripts/qa/measure-knowledge-use.mjs <run.json> [run2.json …]
//
// ⚖️ IT IMPORTS `claimStrength` FROM THE SHIPPED CONTRACT rather than restating
// it. A measurement of the ladder computed by a second copy of the ladder is a
// measurement of the copy.
import { readFileSync } from 'node:fs'
import { claimStrength } from '../../packages/shared/src/claimEntitlement.ts'

const files = process.argv.slice(2)
if (!files.length) { console.error('usage: npx tsx scripts/qa/measure-knowledge-use.mjs <run.json> …'); process.exit(1) }

const pack = JSON.parse(readFileSync('scripts/qa/creator-pack.json', 'utf8'))
const ALL = [...pack.creators, ...(pack.cohort2?.creators ?? []), ...(pack.cohort3?.creators ?? [])]
const runs = files.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')))

// Same stoplist as the substance checker, so "overlaps a supplied item" means
// here what it means there.
const STOP = new Set(['this', 'that', 'with', 'from', 'they', 'them', 'what', 'when',
  'have', 'about', 'video', 'thing', 'things', 'your', 'their', 'more', 'than'])
const terms = (s) => new Set(String(s).toLowerCase().split(/[^a-z0-9]+/)
  .filter((w) => w.length > 3 && !STOP.has(w)))

const strength = { discussion: 0, position: 0, history: 0 }
const usedPer = {}
let beats = 0, overlapping = 0
for (const r of runs) {
  const c = ALL.find((x) => x.key === r.case?.creator)
  if (!c) continue
  const items = c.knowledge?.items ?? []
  usedPer[c.key] ??= { used: new Set(), total: items.length }
  for (const b of r.blueprint?.script ?? []) {
    const line = String(b?.line ?? '')
    if (!line) continue
    beats++
    strength[claimStrength(line)]++
    const lt = terms(line)
    const hit = items.find((i) => {
      const it = terms(i.text ?? '')
      return [...it].filter((w) => lt.has(w)).length >= 2
    })
    if (hit) { overlapping++; usedPer[c.key].used.add(hit.text) }
  }
}

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '—')
console.log(`\n${beats} beats across ${runs.length} runs\n`)
console.log('CLAIM STRENGTH — what the ladder would permit on coverage-only evidence')
console.log(`  discussion (permitted)   ${String(strength.discussion).padStart(5)}  ${pct(strength.discussion, beats)}`)
console.log(`  position   (blocked)     ${String(strength.position).padStart(5)}  ${pct(strength.position, beats)}`)
console.log(`  history    (blocked)     ${String(strength.history).padStart(5)}  ${pct(strength.history, beats)}`)
console.log(`\n  => raising the evidence ceiling would affect ${pct(strength.position + strength.history, beats)} of beats.`)
console.log('\nUSE — beats whose words overlap something the creator actually knows')
console.log(`  ${overlapping} / ${beats} = ${pct(overlapping, beats)}`)
console.log('\nBREADTH — how much of each creator\'s knowledge ever reached a script')
for (const [k, v] of Object.entries(usedPer).sort()) {
  console.log(`  ${k.padEnd(12)}${String(v.used.size).padStart(3)} of ${String(v.total).padEnd(4)} ${pct(v.used.size, v.total)}`)
}
