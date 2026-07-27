import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * §9.2 / §10.4: THE EDITOR DIRECTOR IS NOT THE TRANSFER REASONING LAYER.
 *
 * `CreativeTransferPlanV1` is the sole transfer authority. The Director consumes
 * a plan that was already decided and hash-pinned; it must never decide, infer,
 * re-derive or override what transfers from a reference.
 *
 * This is a STRUCTURAL guard, in the same spirit as no-legacy-editor.test.ts.
 * A type that describes the rule without constraining it is exactly the defect
 * the Batch A audit found in `VoiceProfile`: the shared type said one thing and
 * `dna-poll` did another, because nothing was on the write path. So the rule is
 * enforced against the source text, which is on every path.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: forbid the Director from READING a plan.
 * Batch C wires the pinned plan into blueprint generation, and Batch D into the
 * editor. Reading a decided plan is the intended direction of travel; making a
 * decision is not. The guard therefore targets the decision-making surface —
 * the scoring, selection and prohibition vocabulary — and not the plan type.
 */

const EDITOR_DIR = new URL('../editor/', import.meta.url).pathname

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) {
      if (entry === '__tests__') continue
      out.push(...sourceFiles(p))
      continue
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) out.push(p)
  }
  return out
}

/**
 * Symbols that only a transfer DECISION-MAKER would need. Importing the plan
 * type is fine; importing the machinery that decides is not.
 */
const DECISION_SYMBOLS = [
  'buildCandidatePool',
  'poolContains',
  'PROHIBITED_EVIDENCE_TYPES',
  'CONFIDENCE_THRESHOLD_MILLI',
  'finalizeTransferPlan',
  'computePlanSha256',
  // §7 Step 6. Resolving which reference wins a dimension IS the transfer
  // decision; a Director that can call this has become a second authority.
  'resolveConflicts',
  'resolveDimension',
  'conflictRecords',
  'assertWinnersAreEvidenced',
]

describe('CreativeTransferPlan is the SOLE transfer authority', () => {
  const files = sourceFiles(EDITOR_DIR)

  it('the editor source set is non-empty — the guard is not vacuous', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('no editor/Director module imports the transfer decision machinery', () => {
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      for (const sym of DECISION_SYMBOLS) {
        if (new RegExp(`\\b${sym}\\b`).test(src)) offenders.push(`${f}: ${sym}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('no editor/Director module imports the transfer modules at all', () => {
    const offenders = files.filter((f) =>
      /from\s+['"].*(transferCandidates|transferConflicts)['"]/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  // A Director that re-derives which reference wins a dimension has become a
  // second authority even if it never touches the plan type.
  it('no editor/Director module scores or selects references per dimension', () => {
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      if (/\btransferDimension\b|\bTRANSFER_DIMENSIONS\b/.test(src)) offenders.push(`${f}: dimension vocabulary`)
      if (/\bprimaryReferenceId\b|\bsecondaryReferenceId\b/.test(src)) offenders.push(`${f}: reference selection`)
    }
    expect(offenders).toEqual([])
  })

  // CONTROL: the guard can actually fail. Without this, the assertions above
  // would pass on an empty regex or an empty file list, and would keep passing
  // forever while meaning nothing.
  it.each(['../transferCandidates.ts', '../transferConflicts.ts'])(
    'CONTROL: the same check FIRES on %s, which does decide transfer',
    (rel) => {
      const src = readFileSync(new URL(rel, import.meta.url).pathname, 'utf8')
      const hits = DECISION_SYMBOLS.filter((sym) => new RegExp(`\\b${sym}\\b`).test(src))
      expect(hits.length).toBeGreaterThan(0)
    },
  )
})
