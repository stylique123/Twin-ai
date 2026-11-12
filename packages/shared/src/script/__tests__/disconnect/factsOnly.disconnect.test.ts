// FACTS_ONLY_WRITER disconnect (default OFF): every new branch on the edge and
// in the worker is behind the flag, and the worker runs the trace pass last.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
const EDGE = readFileSync(new URL('../../../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url), 'utf8')
const WORKER = readFileSync(new URL('../../../../../../worker/src/jobs/inventionRecheck.ts', import.meta.url), 'utf8')

describe('FACTS_ONLY_WRITER wiring', () => {
  it('the switch reads only the env value, through factsOnlyWriterOn, for trial accounts', () => {
    expect(EDGE).toContain("const factsOnlyNow = (): boolean => factsOnlyWriterOn(Deno.env.get('FACTS_ONLY_WRITER'), trialOn)")
  })
  it('every facts-only step on the edge sits behind factsOnlyNow()', () => {
    for (const needle of [
      'if (factsOnlyNow()) return factsOnlyKeepsRow(row as never, excludedIds)',
      "if (trialOn && !factsOnlyNow() && (ownedEntity || String(reference_note ?? '').trim())) {",
      'const factsOnlyAll = factsOnlyNow() && !chosenRows',
      'const uncapped = factsOnlyNow()',
      "if ((step === 'late_extend' || step === 'extension' || step === 'payoff_repair') && factsOnlyNow()) {",
      'if (Array.isArray(bpw.script) && !factsOnlyNow()) {',
      'if (trialOn && !factsOnlyNow() && spoken.length < floor',
      "if (factsOnlyNow() && blueprint && typeof blueprint === 'object' && Array.isArray((blueprint as { script?: unknown }).script)) {",
    ]) expect(EDGE).toContain(needle)
    // The stop-and-ask and the layers block.
    expect(EDGE.match(/if \(factsOnlyNow\(\)\) \{/g)?.length).toBeGreaterThanOrEqual(3)
  })
  it('the schema gains layer_tag and source_ids only when the facts-only block is in the brief, reset every request', () => {
    expect(EDGE).toContain('const schema = schema0 === blueprintSchema && factsOnlySchemaOn ? blueprintSchemaFactsOnly : schema0')
    expect(EDGE).toContain("factsOnlySchemaOn = factsOnlyBlock !== ''")
    expect(EDGE).toMatch(/setUrlSafeSplitting\(cleanupV1\)\n  factsOnlySchemaOn = false/)
  })
  it('both worker enqueues carry the facts-only extras, empty when off', () => {
    expect(EDGE.match(/Object\.assign\((?:inventionRecheck|rescueRecheck)\.ledger, factsOnlyGateExtras\(\)\)/g)).toHaveLength(2)
    expect(EDGE).toMatch(/const factsOnlyGateExtras = \(\): Record<string, unknown> => \(factsOnlyNow\(\)\n[\s\S]{0,300}: \{\}\)/)
  })
  it('the worker runs the trace pass last, only when the job says facts_only', () => {
    expect(WORKER).toContain("if (extra.facts_only !== true || !Array.isArray(bp.script)) return")
    expect(WORKER.match(/applyScriptCleanupV1\(bp, extra, ledger, products, generationId\)\n\s*applyFactsOnly\(bp, extra, ledger, generationId\)/g)).toHaveLength(2)
  })
})
