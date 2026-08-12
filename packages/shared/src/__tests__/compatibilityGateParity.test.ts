// THE TRANSFER RULE EXISTS TWICE, AND THE ONE THAT RUNS IS THE EDGE'S.
//
// ⚠️ AND UNTIL NOW IT RAN NOWHERE. `compatibilityVerdicts` decides which
// dimensions of a reference may transfer to a creator. It was written, tested,
// and had no production caller for as long as it existed, because `observed`
// was produced by nothing anywhere. This file pins the inlined copy now that
// one exists.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const SHARED = readFileSync(join(REPO, 'packages/shared/src/compatibilityGate.ts'), 'utf8')

/** The DECISIONS of a function: its lines, with comments and blanks removed and
 *  the shared TYPE NAMES rewritten to the edge's structural equivalents.
 *
 *  ⚠️ THE RENAMES ARE ENUMERATED, NOT PATTERN-MATCHED. A first version claimed
 *  to "strip annotations" and stripped none, so all 78 lines compared unequal
 *  over four type names. Listing them means a NEW divergence — a renamed field,
 *  a changed union — still fails, which is the only reason this test is worth
 *  running. A regex that erased every `: T` would have hidden exactly that. */
const SAME_TYPE: ReadonlyArray<[RegExp, string]> = [
  [/\bReferenceDimension\[\]/g, 'string[]'],
  [/\bDimensionVerdict\[\]/g, 'Array<{ dimension: string; verdict: string; reason: string }>'],
  [/\bCompatibilityInput\b/g, 'CompatInput'],
  [/\bStoredReferenceStructure\b/g, 'StoredRefStructure'],
  [/\bTransferVerdict\b/g, 'string'],
  [/dimension: ReferenceDimension/g, 'dimension: string'],
  // ⚠️ ORDER MATTERS AND BIT ONCE. `CompatibilityInput` → `CompatInput` fires
  // first and turns `CompatibilityInput['entity']` into `CompatInput['entity']`,
  // which then matches nothing. The indexed form is listed in BOTH shapes rather
  // than reordered, so a future insertion cannot silently break it again.
  [/CompatibilityInput\['entity'\]/g, 'CompatEntity'],
  [/CompatInput\['entity'\]/g, 'CompatEntity'],
]
function decisions(src: string, marker: string): string[] {
  const at = src.indexOf(marker)
  if (at < 0) throw new Error(`could not find \`${marker}\` — fix the marker, do not retype the rule`)
  const rest = src.slice(at)
  const end = rest.indexOf('\n}\n')
  return rest.slice(0, end).split('\n')
    .map((l) => {
      let x = l.replace(/\/\/.*$/, '').trim()
      for (const [re, to] of SAME_TYPE) x = x.replace(re, to)
      return x
    })
    .filter((l) => l !== '' && !l.startsWith('*') && !l.startsWith('/*'))
    .slice(1)
}

describe('edge ↔ shared transfer parity', () => {
  it('every verdict and its reason is identical, in the same order', () => {
    // ⚖️ THE REASONS ARE PART OF THE RULE, not commentary. Each one is what an
    // operator reads when asking why a dimension was refused, and a paraphrase
    // on one side means two different answers to the same question.
    expect(decisions(EDGE, 'function compatibilityVerdicts('))
      .toEqual(decisions(SHARED, 'export function compatibilityVerdicts('))
  })

  it('the dimension list matches, because an unlisted dimension is ruled on by nobody', () => {
    const list = (s: string) => s.match(/REFERENCE_DIMENSIONS = \[([\s\S]*?)\]/)?.[1].replace(/\s+/g, '')
    expect(list(EDGE)).toBe(list(SHARED))
  })

  it('the reader that produces `observed` matches too', () => {
    expect(decisions(EDGE, 'function readReferenceObservations('))
      .toEqual(decisions(SHARED, 'export function readReferenceObservations('))
  })
})

describe('the gate observes and refuses nothing', () => {
  it('no prompt line is built from the verdicts', () => {
    // ⚠️ `compatibilityPromptLine` IS THE ENFORCEMENT SWITCH. It puts "DO NOT
    // USE" in front of the writer. Inlining it would turn a first measurement
    // into a behaviour change in the same commit — the exact thing the
    // creator-state rollout was staged to avoid.
    // ⚠️ ON CODE LINES ONLY. The comment above the inlined block NAMES
    // `compatibilityPromptLine` to explain why it is absent — and a first
    // version failed on its own explanation, the same self-reference that made
    // the unwired guard report `routeSubstance` as called.
    const code = EDGE.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
    expect(code).not.toContain('compatibilityPromptLine')
    // ⚠️ AND THE EDGE ALREADY HAS A HAND-WRITTEN "DO NOT USE" BLOCK, live in
    // production, covering three of this gate's rules (no product, cannot show,
    // reference identity + claims). That is a SECOND AUTHORITY on the same
    // decision — the exact thing `doNotUse` in shared was written to prevent by
    // deriving the list from the verdicts.
    //
    // It is deliberately left alone here: replacing it is a behaviour change and
    // belongs in the commit that turns enforcement on, not in the one that first
    // measures. This assertion pins that the SHADOW adds no second block, and
    // names the existing one so the duplication cannot be forgotten.
    const derived = code.slice(code.indexOf('const verdicts = compatibilityVerdicts(compat)'))
    expect(derived.slice(0, derived.indexOf("event: 'substance_route_shadow'"))).not.toContain('DO NOT USE')
    expect(code.match(/DO NOT USE —/g) ?? []).toHaveLength(1)
  })

  it('a shadow failure never breaks a paid generation', () => {
    const block = EDGE.slice(EDGE.indexOf('const compat = readReferenceObservations('))
    expect(block.slice(0, block.indexOf("event: 'substance_route_shadow'")))
      .toMatch(/catch \(err\) \{[\s\S]{0,200}reference_transfer_shadow_failed/)
  })

  it('records whether the reference was read before observations existed', () => {
    // Otherwise a run reporting four observed dimensions is indistinguishable
    // from one where the ingest change has not taken effect yet.
    expect(EDGE).toMatch(/has_observations: Boolean/)
  })
})
