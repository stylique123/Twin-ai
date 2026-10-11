import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveNicheLabels, nicheKeyOf } from '../nicheLabels.js'

// Made-up profiles only (Maya's Coffee, Glow Lab).
const bucketOf = (n: unknown) => {
  const t = String(n ?? '').toLowerCase()
  if (/coffee|bak|food/.test(t)) return 'food'
  if (/fitness|postpartum/.test(t)) return 'health'
  return t ? 'business' : null
}
const isSensitive = (t: string) => /postpartum|sobriety/i.test(t)

describe('niche labels after the privacy scrub (owner 13 Oct)', () => {
  it('a label the scrub blanked is still used for lookups, never for the prompt', () => {
    const r = resolveNicheLabels({
      scrubbedVoice: { niche: '', sub_niche: '' },
      scrubbedDna: {},
      rawVoice: { niche: 'micro coffee roasting', sub_niche: 'home coffee roasting' },
      rawDna: null, bucketOf, isSensitive,
    })
    expect(r.lookupNiche).toBe('micro coffee roasting')
    expect(r.lookupKey).toBe('home coffee roasting')
    expect(r.lookupBucket).toBe('food')
    expect(r.lookupFromRaw).toBe(true)
    expect(r.promptNiche).toBe('unspecified')
    expect(r.promptSubNiche).toBe('')
  })

  it('a blank voice niche falls back to the onboarding niche (the ?? bug)', () => {
    const r = resolveNicheLabels({
      scrubbedVoice: { niche: '' }, scrubbedDna: { niche: 'specialty coffee' },
      rawVoice: { niche: '' }, rawDna: { niche: 'specialty coffee' }, bucketOf, isSensitive,
    })
    expect(r.promptNiche).toBe('specialty coffee')
    expect(r.lookupNiche).toBe('specialty coffee')
  })

  it('a private label becomes its generic parent category in prompt text', () => {
    const r = resolveNicheLabels({
      scrubbedVoice: { niche: '' }, scrubbedDna: {},
      rawVoice: { niche: 'postpartum fitness' }, rawDna: null, bucketOf, isSensitive,
    })
    expect(r.promptNiche).toBe('health and fitness')
    expect(r.promptNiche).not.toMatch(/postpartum/)
    expect(r.lookupNiche).toBe('postpartum fitness')
  })

  it('an unscrubbed account is unchanged', () => {
    const r = resolveNicheLabels({
      scrubbedVoice: { niche: 'skincare', sub_niche: 'clean skincare' }, scrubbedDna: {},
      rawVoice: { niche: 'skincare', sub_niche: 'clean skincare' }, rawDna: null, bucketOf, isSensitive,
    })
    expect(r).toMatchObject({ promptNiche: 'skincare', promptSubNiche: 'clean skincare', lookupKey: 'clean skincare', lookupFromRaw: false })
  })

  it('"unspecified" is never a lookup key, and no niche at all gives empty lookups', () => {
    const r = resolveNicheLabels({ scrubbedVoice: { niche: 'unspecified' }, scrubbedDna: {}, rawVoice: null, rawDna: null, bucketOf, isSensitive })
    expect(r.lookupKey).toBe('')
    expect(r.promptNiche).toBe('unspecified')
    expect(nicheKeyOf('  Home  Coffee-Roasting!! ')).toBe('home coffee roasting')
  })

  it('is wired: the writer reads prompt and lookup values from resolveNicheLabels for every account', () => {
    const edge = readFileSync(new URL('../../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url), 'utf8')
    expect(edge).toMatch(/const niche = nicheLabels\.promptNiche/)
    expect(edge).toMatch(/const subNiche = nicheLabels\.promptSubNiche/)
    expect(edge).toMatch(/const lookupKey = nicheLabels\.lookupKey/)
    expect(edge).not.toMatch(/vp\?\.niche \?\? dna\.niche/)
    expect(edge).not.toMatch(/trialOn \? rawLabel/)
  })
})
