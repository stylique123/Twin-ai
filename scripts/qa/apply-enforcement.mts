// WHAT WOULD PRODUCTION HAVE DONE TO THIS RUN?
//
// ⚠️ THE CAVEAT THAT INVALIDATED HALF THIS SESSION'S NUMBERS. `run-eval.mjs`
// shapes the prompt and captures what the writer returned. It has NO entitlement
// stage — the edge has fourteen references to one, the harness has zero. So
// every "leak" measured from a matrix run is a leak the writer produced, not one
// a creator ever saw, and the corpus systematically OVERSTATES what ships.
//
// `needs_user = 0` across all 8 creators in the cohort-1 run is the clearest
// symptom: 31 first-person history beats, zero experience-level evidence to
// license any of them, and not one escalation — because nothing in the harness
// escalates.
//
// ⚖️ THIS APPLIES THE REAL RULE RATHER THAN A THIRD COPY OF IT.
// `enforceEntitlement` is imported from @twinai/shared, which is the same
// function the edge mirrors. A reimplementation here would be a fourth copy of
// the claim rule — the exact failure that let 16 purchase CTAs ship while three
// copies agreed with each other and with nothing that ran.
//
// ⚖️ AND IT IS A POST-PROCESSOR, NOT A CHANGE TO THE HARNESS. Rerunning 112 live
// generations to answer "what would enforcement have done" costs money and
// changes the sample; applying the rule to output already recorded costs
// nothing and answers it against the EXACT beats that were measured.
import { readFileSync } from 'node:fs'
import { enforceEntitlement } from '../../packages/shared/src/claimEntitlement.ts'
import { readKnowledge } from '../../packages/shared/src/creatorKnowledge.ts'

type Row = { case: any; blueprint: any; supplied?: any }

const file = process.argv[2]
if (!file) { console.error('usage: apply-enforcement.mts <run.json>'); process.exit(1) }
const rows: Row[] = JSON.parse(readFileSync(file, 'utf8'))

let beats = 0, escalated = 0, blockedScripts = 0, scripts = 0, noSupplied = 0
const perCreator: Record<string, { beats: number; esc: number; blocked: number; scripts: number }> = {}
const examples: string[] = []

for (const r of rows) {
  if (!r.supplied) { noSupplied++; continue }
  const supplied = readKnowledge({ items: r.supplied.knowledge ?? [] }).items
  const lines = (r.blueprint?.script ?? [])
    .map((b: any) => String(b?.line ?? '')).filter(Boolean)
  if (!lines.length) continue
  scripts++
  const c = r.case.creator
  const P = perCreator[c] ?? (perCreator[c] = { beats: 0, esc: 0, blocked: 0, scripts: 0 })
  P.scripts++

  const res = enforceEntitlement(lines, supplied)
  beats += lines.length
  P.beats += lines.length
  escalated += res.mustRegenerate
  P.esc += res.mustRegenerate
  if (res.blocked) { blockedScripts++; P.blocked++ }

  for (const b of res.beats) {
    if (b.mustRegenerate && examples.length < 10) {
      examples.push(`[${b.verdict.strength} needs ${b.verdict.requires}, have ${b.verdict.available ?? 'nothing'}] ${b.line.slice(0, 84)}`)
    }
  }
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a')
console.log(`\n${file}`)
if (noSupplied) {
  console.log(`⚠️  ${noSupplied}/${rows.length} cases have no recorded knowledge and were SKIPPED.`)
  console.log('    Enforcement cannot be applied without knowing what the prompt carried;')
  console.log('    assuming "nothing supplied" would escalate every beat and report a')
  console.log('    catastrophe that is an artifact of the missing field.')
}
console.log(`scripts=${scripts}  beats=${beats}`)
console.log(`\nWHAT PRODUCTION WOULD ESCALATE`)
console.log(`  beats needing regeneration   ${escalated} (${pct(escalated, beats)})`)
console.log(`  scripts blocked at least once ${blockedScripts} (${pct(blockedScripts, scripts)})`)
console.log(`\nPER CREATOR`)
console.log('  creator     scripts  beats  escalated  blocked')
for (const [c, P] of Object.entries(perCreator)) {
  console.log(`  ${c.padEnd(11)} ${String(P.scripts).padStart(6)} ${String(P.beats).padStart(6)} ` +
    `${(String(P.esc) + ' (' + pct(P.esc, P.beats) + ')').padStart(13)} ${(String(P.blocked) + '/' + P.scripts).padStart(8)}`)
}
if (examples.length) {
  console.log(`\nBEATS THE WRITER SHIPPED AND PRODUCTION WOULD NOT`)
  for (const e of examples) console.log('  - ' + e)
}
