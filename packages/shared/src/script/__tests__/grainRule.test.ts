import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GRAIN_EXAMPLES, grainKept, grainWeight, rawPhrases, renderGrainRule } from '../grainRule'

describe('the grain rule (owner addendum)', () => {
  it('weighs heavier for raw tone and craft niches', () => {
    expect(grainWeight('candid, a little chaos', 'finance')).toBe('strong')
    expect(grainWeight('warm', 'handmade ceramics')).toBe('strong')
    expect(grainWeight('professional', 'saas marketing')).toBe('standard')
  })
  it('the rule forbids smoothing and keeps every fact rule', () => {
    const r = renderGrainRule('raw', 'pottery')
    expect(r).toMatch(/Never smooth, upgrade or professionalize/)
    expect(r).toMatch(/OUTRANKS POLISH/)
    expect(r).toMatch(/Never invent a detail/)
    expect(renderGrainRule('professional', 'saas')).not.toMatch(/OUTRANKS POLISH/)
  })
  it('measures how many of her raw words survived', () => {
    const note = 'It was genuinely terrifying to hit publish and the first bowl came out wonky.'
    expect(rawPhrases(note).length).toBe(3)
    expect(grainKept(note, ['Hitting publish was genuinely terrifying.', 'I was a bit nervous.'])).toEqual({ raw: 3, kept: 2 })
    expect(grainKept('', ['x'])).toEqual({ raw: 0, kept: 0 })
  })
  it('reaches the writer and is measured on every script', () => {
    const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
    const gb = readFileSync(join(repo, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
    expect(gb.match(/\$\{brainBlock\}\$\{grainBlock\}/g)?.length).toBe(2)
    expect(gb).toMatch(/beatAudit\.grain = g/)
  })
  it('shows the two real maker scripts as the bar, with no one else\'s facts', () => {
    expect(renderGrainRule('raw', 'pottery')).toMatch(/THE BAR TO HIT/)
    expect(renderGrainRule('professional', 'saas')).not.toMatch(/THE BAR TO HIT/)
    const all = GRAIN_EXAMPLES.flatMap((e) => e.lines).join(' ')
    expect(all).not.toMatch(/\d|Sort Of|Toronto|\bpercent\b|\$/)
    expect(all).toMatch(/genuinely terrifying/)
  })
})
