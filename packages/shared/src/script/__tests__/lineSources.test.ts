import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { traceLines } from '../lineSources.js'

const EDGE = readFileSync(new URL('../../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url), 'utf8')

describe('where each line came from', () => {
  const sources = [
    { kind: 'fact' as const, id: 'k1', label: 'Roasts every batch by hand', text: 'She roasts every batch by hand in a small drum roaster.' },
    { kind: 'her_words' as const, label: 'Your idea for this video', text: 'A video about my first farmers market with the cart.' },
    { kind: 'product' as const, label: 'House Blend', text: 'House Blend 12oz bag, chocolate and cherry notes.' },
  ]
  const traced = traceLines([
    { line: 'I roast every batch by hand. My first farmers market was chaos.' },
    { line: 'This 12oz bag tastes like chocolate. You will love it forever.' },
    { line: '' },
  ], sources)

  it('traces each sentence to the fact, her words or the product', () => {
    expect(traced).toHaveLength(4)
    expect(traced[0].from.map((f) => f.id)).toContain('k1')
    expect(traced[1].from.map((f) => f.kind)).toContain('her_words')
    expect(traced[2].from.map((f) => f.kind)).toContain('product')
  })
  it('marks a sentence resting on nothing as unsourced', () => {
    expect(traced[3].sentence).toMatch(/love it forever/)
    expect(traced[3].from).toEqual([])
  })
  it('runs after the privacy guard and before the generation is stored', () => {
    const at = EDGE.indexOf('traceLines(bp.script')
    expect(at).toBeGreaterThan(EDGE.indexOf('guardScript(bp.script'))
    expect(at).toBeLessThan(EDGE.indexOf(".from('generations')\n      .insert({"))
  })
})
