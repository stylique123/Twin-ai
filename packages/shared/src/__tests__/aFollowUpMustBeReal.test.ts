import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { concreteness } from '../concreteAnswer'

describe('a product follow-up answer must be real (menu redesign, Part 4)', () => {
  it('refuses empty and stock phrases', () => {
    for (const t of ['', '   ', "it's great", 'Good quality.', 'people love it', 'not sure', 'idk', 'really nice']) {
      expect(concreteness(t), t).not.toBe('concrete')
    }
    expect(concreteness('')).toBe('empty')
  })
  it('accepts a number, a quote, a measurement, a name, or a real sentence', () => {
    expect(concreteness('it takes 2 hours per mug')).toBe('concrete')
    expect(concreteness('a customer said "it holds heat forever"')).toBe('concrete')
    expect(concreteness('three weeks of glaze tests')).toBe('concrete')
    expect(concreteness('the Toronto market sold out')).toBe('concrete')
    expect(concreteness('I nearly quit because the kiln kept cracking the rims and I could not work out why for ages')).toBe('concrete')
  })
  it('blocks the build until it is concrete or she says she has none', () => {
    const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
    const b = readFileSync(join(repo, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')
    expect(b).toMatch(/answerBlocked = onAnswerStep && answerConcreteness !== 'concrete' && !noDetail/)
    expect(b).toMatch(/\.trim\(\)\) \|\| answerBlocked\}/)
  })
})
