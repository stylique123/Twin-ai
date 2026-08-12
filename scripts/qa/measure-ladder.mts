// WHAT WOULD STRICT ENFORCEMENT ACTUALLY DO?
//
// ⚠️ THIS COULD NOT BE ASKED BEFORE. Result files stored `{case, blueprint}`,
// so `grounded` was uncomputable and the resolution ladder's distribution was
// unknown. Turning strict on without it would have been shipping a rewrite rule
// blind: 5-6% of beats are strict, but if most of those land on UNRESOLVED then
// every script quietly loses its concrete assertions and gets blander — the
// exact failure the mechanism exists to prevent, arriving through the mechanism.
//
// ⚖️ TWO CLASSES OF METRIC, AND MIXING THEM WOULD LIE. Line-only measures
// (traceability level, claim strength) are computable on ANY run and are what
// the old-vs-new comparison rests on. Ladder measures need `supplied` and exist
// only for runs recorded after that landed. A run without `supplied` reports
// `ladder: null` rather than a zero, because "not recorded" is not "none".
import { readFileSync } from 'node:fs'
import { traceabilityLevel, resolveStrictBeat } from '../../packages/shared/src/traceability.ts'
import { claimStrength } from '../../packages/shared/src/claimStrength.ts'
import { groundingDepth } from '../../packages/shared/src/knowledgeResolver.ts'
import { readKnowledge } from '../../packages/shared/src/creatorKnowledge.ts'

type Row = { case: any; blueprint: any; supplied?: any }

const file = process.argv[2]
if (!file) { console.error('usage: measure-ladder.mts <run.json>'); process.exit(1) }
const rows: Row[] = JSON.parse(readFileSync(file, 'utf8'))

const lvl: Record<string, number> = { strict: 0, standard: 0, light: 0 }
const str: Record<string, number> = { discussion: 0, position: 0, history: 0 }
const ladder: Record<string, number> = {
  GROUNDED: 0, RESOLVABLE: 0, USER_KNOWLEDGE_REQUIRED: 0, UNRESOLVED: 0,
}
const depth: Record<string, number> = { proposition: 0, subject: 0, none: 0 }
let beats = 0, withSupplied = 0
const unresolvedExamples: string[] = []

for (const r of rows) {
  const supplied = r.supplied
    ? readKnowledge({ items: r.supplied.knowledge ?? [] }).items
    : null
  if (supplied) withSupplied++
  for (const b of (r.blueprint?.script ?? [])) {
    const line = String(b?.line ?? '')
    if (!line) continue
    beats++
    const L = traceabilityLevel(b)
    lvl[L]++
    str[claimStrength(line)]++

    const cited = typeof b?.substance_evidence === 'string' ? b.substance_evidence.trim() : ''
    if (supplied && b?.substance === 'creator_knowledge') {
      depth[groundingDepth(cited, supplied)]++
    }
    // ⚖️ ONLY strict beats reach the ladder. Running it over everything is the
    // compliance hearing this design exists to avoid.
    if (L === 'strict' && supplied) {
      const grounded = cited !== '' && groundingDepth(cited, supplied) !== 'none'
      const personal = claimStrength(line) === 'history'
      // ⚠️ THE FIRST VERSION OF THIS LINE MADE `UNRESOLVED` UNREACHABLE, and it
      // reported a clean 0% that read like a green light to enforce. It passed
      // `externallyAnswerable: !personal`, so every ungrounded beat routed to
      // ASK (personal) or RESOLVABLE (not personal) and the rewrite path could
      // never be counted. A measurement whose answer is fixed by its own wiring
      // is worse than no measurement, because it looks like evidence.
      //
      // ⚖️ WHAT ACTUALLY MAKES A CLAIM EXTERNALLY ANSWERABLE: it is about the
      // world. A spec, a public product, a general statistic — research can
      // settle it. A claim about the creator's OWN product or business cannot be
      // researched; only Product DNA answers it, and when none was carried the
      // claim is genuinely UNRESOLVED.
      const ownBusiness = /\b(?:my|our)\s+(?:app|product|tool|course|service|company|business|startup|agency|program|software|platform|brand)\b/i.test(line)
        || /\b(?:we|I)\s+(?:built|made|created|launched|designed|offer|charge|price)\b/i.test(line)
      const res = resolveStrictBeat({
        grounded,
        personalToCreator: personal,
        externallyAnswerable: !personal && !ownBusiness,
        // The pack carries none, and the run records that as `[]` — KNOWN empty.
        productFactsAvailable: (r.supplied.productFacts ?? []).length > 0,
      })
      ladder[res]++
      if (res === 'UNRESOLVED' && unresolvedExamples.length < 8) {
        unresolvedExamples.push(line.slice(0, 100))
      }
    }
  }
}

const pct = (n: number, d: number) => d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a'
console.log(`\n${file}`)
console.log(`beats=${beats}  cases=${rows.length}  with recorded knowledge=${withSupplied}/${rows.length}`)
console.log('\nTRACEABILITY   ' + Object.entries(lvl).map(([k, v]) => `${k}=${v} (${pct(v, beats)})`).join('  '))
console.log('CLAIM STRENGTH ' + Object.entries(str).map(([k, v]) => `${k}=${v} (${pct(v, beats)})`).join('  '))

if (!withSupplied) {
  console.log('\nLADDER         null — this run predates knowledge recording, so `grounded`')
  console.log('               is not computable. NOT reported as zero: unrecorded is not none.')
} else {
  const tot = Object.values(ladder).reduce((a, b) => a + b, 0)
  console.log(`\nSTRICT LADDER  (${tot} strict beats)`)
  for (const [k, v] of Object.entries(ladder)) console.log(`  ${k.padEnd(24)} ${v} (${pct(v, tot)})`)
  console.log('\nCREATOR-KNOWLEDGE DEPTH')
  const dt = Object.values(depth).reduce((a, b) => a + b, 0)
  for (const [k, v] of Object.entries(depth)) console.log(`  ${k.padEnd(24)} ${v} (${pct(v, dt)})`)
  if (unresolvedExamples.length) {
    console.log('\nWOULD BE REWRITTEN (claim removed, script kept):')
    for (const e of unresolvedExamples) console.log('  - ' + e)
  }
}
