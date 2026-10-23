// POLISH CHECK v2 + VOICE ON BARE LINES (panel 11). Fictional fixtures only.
import { describe, expect, it } from 'vitest'
import { polishCheckV2, wrongProductScoped, blockWrongProductLines, voiceBareLine, voiceRegister, polishCheckV2On, voiceBareLinesOn, type TargetedItemV2 } from '../checkLines.js'
import { polishCheck, applyPolish, sourcedLine, type PlanBSource } from '../planner/planBAssembly.js'

const items: TargetedItemV2[] = [
  { text: 'I once burned a whole tray of rolls because I forgot the oven timer.', first_party: true, live: false, origin: 'her_story', product_id: null },
  { text: 'Baked fresh every Friday morning and delivered the same day.', first_party: true, live: false, origin: 'product_fact', product_id: 'prod-a' },
  { text: '$9 for a box of six', first_party: true, live: false, origin: 'product_fact', product_id: 'prod-a' },
  { text: 'A rye loaf proofed overnight in a cold cellar for sour depth', first_party: true, live: false, origin: 'product_fact', product_id: 'prod-b' },
]
const products = [{ id: 'prod-a', name: 'Sunny Buns' }, { id: 'prod-b', name: 'Cellar Rye' }]
const scope = { items, products, productId: 'prod-a', voiceText: "Warm, says 'honestly' and 'here's the thing'." }

describe('polishCheckV2', () => {
  it('rejects an invented first-person claim', () => {
    const before = 'Here is the catch. Fresh bread matters.'
    const after = 'Here is the catch. A stale loaf costs me more money than baking twice myself. Fresh bread matters.'
    expect(polishCheckV2(before, after, scope)).toEqual({ ok: false, reason: 'new_first_person' })
  })
  it('keeps a first-person line her item backs', () => {
    expect(polishCheckV2('Fresh bread matters.', 'Honestly, I once burned a whole tray of rolls because I forgot the timer.', scope).ok).toBe(true)
  })
  it('rejects another product fact on a line that names no product (source-scoped)', () => {
    const r = polishCheckV2('Baked fresh every Friday morning and delivered the same day.', "Here's the thing, it's a rye loaf proofed overnight in a cold cellar for sour depth.", scope)
    expect(r).toEqual({ ok: false, reason: 'wrong_product' })
    expect(wrongProductScoped('It is proofed overnight in a cold cellar for sour depth.', items, products, 'prod-a')).toBe('prod-b')
    expect(wrongProductScoped('It is proofed overnight in a cold cellar for sour depth.', items, products, 'prod-b')).toBeNull()
  })
  it('rejects a new number, a new name and a new scene detail', () => {
    expect(polishCheckV2('$9 for a box of six.', '$12 for a box of six.', scope).reason).toBe('new_number')
    expect(polishCheckV2('Baked fresh every Friday.', 'Baked fresh every Friday by Marco.', scope).reason).toBe('new_name')
    expect(polishCheckV2('Baked fresh every Friday.', 'Baked fresh every Friday beside the harbour lighthouse at dawn.', scope).reason).toBe('new_detail')
  })
  it('accepts a voice-only rewrite', () => {
    expect(polishCheckV2('$9 for a box of six.', "Honestly, $9 for a box of six.", scope).ok).toBe(true)
  })
  it('flags default off', () => {
    expect(polishCheckV2On(undefined)).toBe(false); expect(polishCheckV2On('on')).toBe(true)
    expect(voiceBareLinesOn('')).toBe(false); expect(voiceBareLinesOn('on')).toBe(true)
  })
})

describe('wiring is byte-identical with the flag off', () => {
  it('applyPolish without a checker and blockWrongProductLines without a scope behave as before', () => {
    const src = new Map<string, PlanBSource>([['p:a:0', { id: 'p:a:0', text: 'x', kind: 'product_fact' }]])
    const lines = [sourcedLine(src, 'fact', 'Baked fresh every Friday morning.', 'p:a:0')]
    const cand = ['Honestly, baked fresh every Friday morning.']
    expect(applyPolish(lines, cand, src)).toEqual(applyPolish(lines, cand, src, undefined))
    expect(applyPolish(lines, cand, src, () => false).polished).toBe(0)
    const bp = { script: [{ section: 'body', line: 'It is proofed overnight in a cold cellar for sour depth.' }] }
    expect(blockWrongProductLines(bp as never, items, products).blocked).toEqual([])
    expect(blockWrongProductLines(bp as never, items, products, 'prod-a').blocked).toEqual([{ line_index: 0, product_id: 'prod-b' }])
  })
})

describe('voiceBareLine', () => {
  const coach = "High-energy coach, short punchy imperatives, lots of exclamations, 'you've got this'."
  const calm = "Calm, careful, full sentences, hedged ('in my experience', 'gently'), no exclamations."
  const clipped = "Clipped founder talk, very short sentences, numbers, 'look', 'ship it'."
  const slow = "Slow, long winding sentences, 'mind you', mostly 'I'."
  it('picks the register from the style note', () => {
    expect([voiceRegister(coach), voiceRegister(calm), voiceRegister(clipped), voiceRegister(slow)]).toEqual(['energetic', 'calm', 'clipped', 'plain'])
  })
  const cases: Array<[string, string, string, string]> = [
    [coach, 'cta', 'Share this with a friend who wants to start.', "Share this with a friend who wants to start! You've got this!"],
    [calm, 'hook', 'Stop buying soap for the smell.', 'If it helps, gently, stop buying soap for the smell.'],
    [calm, 'fact', '$14 for a 100 ml bottle.', '$14 for a 100 ml bottle, if that helps.'],
    [clipped, 'fact', '$5 per month, two seats.', 'Look. $5 per month, two seats.'],
    [slow, 'cta', 'Tell me your story in the comments.', 'Mind you, tell me your story in the comments.'],
  ]
  it.each(cases)('voices a bare line and keeps every fact (%#)', (note, section, line, want) => {
    const got = voiceBareLine(line, section, note)
    expect(got).toBe(want)
    expect(polishCheck(line, got).ok).toBe(true)
  })
  it('leaves a full middle line alone', () => {
    expect(voiceBareLine('I once burned a whole tray of rolls because I forgot the timer.', 'story', coach)).toBe('I once burned a whole tray of rolls because I forgot the timer.')
  })
})
