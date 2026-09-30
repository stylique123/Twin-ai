// Audit 2026-09-29, the espresso run: an unsourced precise method is removed.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isInventedMethod } from '../lineSources.js'

const EDGE = readFileSync(new URL('../../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url), 'utf8')
const t = (sentence: string, sourced = false) => ({ beat: 0, sentence, from: sourced ? [{ kind: 'fact' as const, label: 'x' }] : [] })

describe('invented method', () => {
  it('catches the espresso run\'s invented steps', () => {
    expect(isInventedMethod(t('Keeping your tamp completely flat stops water from channeling.'))).toBe(true)
    expect(isInventedMethod(t('Look for that steady honey stream pouring down smoothly.'))).toBe(true)
    expect(isInventedMethod(t('Dust a pinch of cinnamon into the warm espresso.'))).toBe(true)
    expect(isInventedMethod(t('Use 18 grams in a 36 second shot.'))).toBe(true)
  })
  it('leaves sourced lines and plain wording alone', () => {
    expect(isInventedMethod(t('Keep your tamp flat.', true))).toBe(false)
    expect(isInventedMethod(t('This is my favourite part of the morning.'))).toBe(false)
  })
  it('runs after tracing, before the script is stored, and discloses', () => {
    const at = EDGE.indexOf('traced.filter(isInventedMethod)')
    expect(at).toBeGreaterThan(EDGE.indexOf('traceLines(bp.script'))
    expect(at).toBeLessThan(EDGE.indexOf(".from('generations')\n      .insert({"))
    expect(EDGE).toMatch(/reason: 'invented_method'/)
  })
})
