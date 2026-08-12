// WHERE SUBSTANCE SHOULD HAVE COME FROM, MEASURED ON THE CORPUS WE ALREADY HAVE.
//
// The shadow logging added to the edge answers this in production, eventually.
// Cohort 1 can answer it NOW: 224 real scripts with the exact knowledge each run
// was supplied. That is what `supplied` was added to the harness for.
//
// ⚠️ THIS IS A COMPARISON, NOT A VERDICT. `externallyAnswerable` is the WRITER'S
// own declaration that a beat rests on general knowledge, so agreement between
// route and declaration partly measures the writer agreeing with itself. It is
// still the number that matters: a route that never disagrees cannot improve
// anything, and one that disagrees everywhere would be unshippable.
//
//   npx tsx scripts/qa/measure-routing.mts scripts/qa/results/cohort1-*.json
import { readFileSync } from 'node:fs'
import { creatorDepth } from '../../packages/shared/src/knowledgeResolver'
import { routeSubstance } from '../../packages/shared/src/traceability'
import { creatorStateClaim } from '../../packages/shared/src/creatorState'
import type { KnowledgeItem } from '../../packages/shared/src/creatorKnowledge'

const files = process.argv.slice(2)
if (!files.length) throw new Error('give me one or more matrix result files')

const routes: Record<string, number> = {}
const vsDeclared: Record<string, number> = {}
const depths: Record<string, number> = {}
let beats = 0
let scripts = 0
let skipped = 0

for (const f of files) {
  for (const run of JSON.parse(readFileSync(f, 'utf8')) as Array<Record<string, unknown>>) {
    const supplied = ((run.supplied as { knowledge?: KnowledgeItem[] })?.knowledge ?? []) as KnowledgeItem[]
    // ⚠️ IT IS `script`, NOT `beats`. The first version of this read
    // `blueprint.beats`, found nothing, and printed a clean "0 scripts, 0
    // beats" — the same shape as the rigged ladder measurement that reported a
    // flawless 0% because its own precondition made the failing case
    // unreachable. A zero that arrives without a single beat examined is a bug
    // report, not a result.
    const declared = (run.blueprint as { script?: Array<Record<string, unknown>> })?.script ?? []
    if (!Array.isArray(declared) || !declared.length) { skipped++; continue }
    scripts++
    const depth = creatorDepth(supplied)
    depths[depth] = (depths[depth] ?? 0) + 1
    for (const b of declared) {
      const line = typeof b.line === 'string' ? b.line : ''
      const src = typeof b.substance === 'string' ? b.substance : 'undeclared'
      const route = routeSubstance({
        depth,
        aboutOwnProduct: src === 'product_dna',
        externallyAnswerable: src === 'general',
        personalToCreator: creatorStateClaim(line) !== null,
      })
      beats++
      routes[route] = (routes[route] ?? 0) + 1
      vsDeclared[`${route} <- ${src}`] = (vsDeclared[`${route} <- ${src}`] ?? 0) + 1
    }
  }
}

const pct = (n: number) => `${((n / beats) * 100).toFixed(1)}%`
if (!beats) throw new Error('0 beats examined — the corpus shape changed; fix the reader rather than reporting a clean zero')
console.log(`${scripts} scripts, ${beats} beats${skipped ? `, ${skipped} runs with no script (errors/refusals)` : ''}`)
console.log('\ncreator depth (per script):')
for (const [d, n] of Object.entries(depths).sort((a, b) => b[1] - a[1])) console.log(`  ${d.padEnd(8)} ${n}`)
console.log('\nroute:')
for (const [r, n] of Object.entries(routes).sort((a, b) => b[1] - a[1])) console.log(`  ${r.padEnd(18)} ${String(n).padStart(5)}  ${pct(n)}`)
console.log('\nroute <- what the writer declared:')
for (const [k, n] of Object.entries(vsDeclared).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(40)} ${String(n).padStart(5)}  ${pct(n)}`)

// ── FIRST READING, 2026-08-12, cohort 1 (222 scripts, 1421 beats) ───────────
//
//   creator depth      low on ALL 222 scripts
//   route              ASK_CREATOR 61.9%  RESEARCH 29.3%  PRODUCT_DNA 8.9%
//   route <- declared  ASK_CREATOR <- creator_knowledge  42.3%
//                      RESEARCH    <- general            29.3%
//                      ASK_CREATOR <- none               18.9%
//                      PRODUCT_DNA <- product_dna         8.9%
//
// ⚠️ THE 42.3% IS THE FOUNDING DEFECT, STATED UPSTREAM. Those beats say "this
// came from the creator" about a creator the router says is not a sufficient
// source. Post-generation enforcement can only ask whether each sentence traces;
// this says the SOURCING DECISION was wrong before a word was written.
//
// ⚠️ AND IT IS UNSHIPPABLE AS ENFORCEMENT TODAY — deliberately recorded, because
// the number flatters the routing idea and the caveat is what makes it usable.
// Acting on it would put ~6 questions in front of every script. `CREATOR_KNOWLEDGE`
// is unreachable at `low` depth, and all 222 scripts are low because cohort 1 is
// caption-only: extraction is clamped to `demonstrated`, and no profile of titles
// can reach `high` however large. So this run cannot distinguish "the router is
// right" from "the router has one input and it is pinned". The measurement that
// decides deployment is the same one re-run after transcripts reach the
// knowledge table — which is exactly the upstream fix, and is why routing is
// shadow-only until then.
