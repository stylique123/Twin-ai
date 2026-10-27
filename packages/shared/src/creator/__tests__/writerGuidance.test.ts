import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  normalizeCreatorType, creatorTypeHookBlock, pickNichePack, nichePackBlock, bannedClaimHits, CREATOR_TYPE_VALUES,
} from '../writerGuidance'
import { NICHE_PACK_REGISTRY } from '../nichePackRegistry'
import { loadCreatorTypeRules, rulesForCreator } from '../creatorTypeRules'
import { validateNichePack } from '../nichePack'

const repo = join(__dirname, '..', '..', '..', '..', '..')
const rules = loadCreatorTypeRules()
const pack = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures/nichePacks/fictional-hand-poured-candles.json'), 'utf8'))

describe('legacy creator type names map onto the W12.2 types', () => {
  it('maps the names used in the repo', () => {
    expect(normalizeCreatorType('physical_product')).toBe('maker')
    expect(normalizeCreatorType('software')).toBe('maker')
    expect(normalizeCreatorType('service_coach')).toBe('coach')
    expect(normalizeCreatorType('coach_consultant')).toBe('coach')
    expect(normalizeCreatorType('Local Business')).toBe('local_business')
    for (const t of CREATOR_TYPE_VALUES) expect(normalizeCreatorType(t)).toBe(t)
    expect(normalizeCreatorType('wizard')).toBeNull()
    expect(normalizeCreatorType(7)).toBeNull()
  })
  it('every creator_type value in the repo fixtures maps to a type', () => {
    const panel = readFileSync(join(repo, 'scripts/ops/fixtures/fictional-panel.json'), 'utf8')
    const run = readFileSync(join(repo, 'eval/fixtures/live-runs/run-a.json'), 'utf8')
    const values = [...`${panel}\n${run}`.matchAll(/"creator_type":\s*"([^"]+)"/g)].map((m) => m[1])
    expect(values.length).toBeGreaterThan(5)
    for (const v of values) expect(normalizeCreatorType(v), v).not.toBeNull()
  })
  it('rulesForCreator accepts a legacy name when the flag is on', () => {
    expect(rulesForCreator('coach_consultant', { CREATOR_TYPE_RULES: 'on' })?.label).toBe('Coach or consultant')
  })
})

describe('creator type hook block (CREATOR_TYPE_RULES)', () => {
  it('is empty with the flag off, for an unknown type, or with bad rules', () => {
    expect(creatorTypeHookBlock('coach', undefined, rules)).toBe('')
    expect(creatorTypeHookBlock('coach', 'true', rules)).toBe('')
    expect(creatorTypeHookBlock('wizard', 'on', rules)).toBe('')
    expect(creatorTypeHookBlock('coach', 'on', { types: { coach: { label: 'x' } } })).toBe('')
    expect(creatorTypeHookBlock('coach', 'on', null)).toBe('')
  })
  it('renders the data for the type when on', () => {
    const b = creatorTypeHookBlock('physical_product', 'on', rules)
    expect(b).toMatch(/^CREATOR TYPE: Maker or product seller/)
    expect(b).toContain('visual_reveal_verdict')
    expect(b).toContain('hook -> show_it -> specific_reason -> where_to_get_it')
    expect(b).toContain('Default close: where to buy.')
  })
})

describe('niche pack in the writer (NICHE_PACKS)', () => {
  it('the production registry is empty and holds only valid packs', () => {
    for (const p of NICHE_PACK_REGISTRY) expect(validateNichePack(p)).toEqual([])
  })
  it('never picks a fictional pack for a real creator', () => {
    expect(pickNichePack([pack], 'hand-poured candles for gifts', 'maker')).toBeNull()
  })
  it('picks by niche words and type when fictional is allowed (tests only)', () => {
    expect(pickNichePack([pack], 'Hand-poured candles for gifts', 'maker', true)?.id).toBe(pack.id)
    expect(pickNichePack([pack], 'Hand-poured candles', 'entertainer', true)).toBeNull()
    expect(pickNichePack([pack], 'sourdough bread', 'maker', true)).toBeNull()
    expect(pickNichePack([pack], '', 'maker', true)).toBeNull()
  })
  it('renders the block only with the flag on', () => {
    expect(nichePackBlock(pack, undefined)).toBe('')
    expect(nichePackBlock(null, 'on')).toBe('')
    const b = nichePackBlock(pack, 'on')
    expect(b).toContain('Niche words to use: pour, cure time')
    expect(b).toContain('Never make these kinds of claim: health claim')
  })
  it('finds banned claims in written lines', () => {
    expect(bannedClaimHits(pack, ['A calm evening', 'This candle heals you'])).toEqual([{ line: 1, reason: 'health claim' }])
    expect(bannedClaimHits(null, ['heals'])).toEqual([])
  })
})
