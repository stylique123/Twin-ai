// SCRIPT BATCH PART 4 (2026-10-04): beats lost between claim_checks and
// unanswered_asks, sentences cut after the extension, and a product never
// said by name. Built from the real rows named in each case.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { boundAskBeats, type BoundableBeat } from '../beatAsk'
import { keepLateSafe, lateGuardCuts, spokenWords, type LateGuardContext } from '../lateGuards'
import { foreignOfferFigures } from '../offerScope'
import { arcFor, arcCheck, nameTheProduct, productNameSaid } from '../arcShape'

const EDGE = readFileSync(resolve(__dirname, '../../../../../supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('A: a line that passed the claim checks is never blanked or dropped for its flag', () => {
  // c9400b67 (entertain, course): 4 beats / 123 words at claim_checks → 2 / 37.
  // Log: product_claim_escalated beats:2 → ask_beats_bounded omitted:2.
  const c9400b67 = (): BoundableBeat[] => [
    { line: 'Do not buy my coffee cart course yet.', substance: 'general' },
    { line: 'Everyone wants the clean formula for a cart, and I wanted it too when I started out.', substance: 'needs_user', ask: 'This beat needs a real detail about your product. What does it actually do, in one sentence?', ask_reason: 'product_detail' },
    { line: 'The course walks through what a first cart actually costs before you sign anything.', substance: 'needs_user', ask: 'This beat describes your product in a way nothing supplied supports.', ask_reason: 'product_detail' },
    { line: "There's no clean formula, it's messy, and your best first step is to start small from home.", substance: 'general' },
  ]
  it('an optional (product_detail) ask on a spoken line keeps the line and drops the ask', () => {
    const r = boundAskBeats(c9400b67())
    expect(r.omitted).toBe(0)
    expect(r.beats).toHaveLength(4)
    expect(r.beats.every((b) => typeof b.ask === 'undefined' && b.substance !== 'needs_user')).toBe(true)
    expect(spokenWords(r.beats)).toBe(spokenWords(c9400b67()))
  })
  it('the writer\'s own needs_user flag beyond the cap does not cost the line either', () => {
    const own = (t: string): BoundableBeat => ({ line: t, substance: 'needs_user', ask: 'What happened the day you opened?', ask_reason: 'personal_fact' })
    const r = boundAskBeats([own('One.'), own('Two.'), own('Three is a real spoken line.')])
    expect(r.beats).toHaveLength(3)
    expect(r.beats[2]).toMatchObject({ line: 'Three is a real spoken line.', substance: 'general' })
    expect(r.beats[2]!.ask).toBeUndefined()
  })
  it('a truly empty optional ask beat may still drop', () => {
    const r = boundAskBeats([{ line: '', substance: 'needs_user', ask: 'What does it do?', ask_reason: 'product_detail' }])
    expect(r.omitted).toBe(1)
    expect(r.beats).toHaveLength(0)
  })
  it('the product-claim escalation keeps a spoken line (only the false declaration goes)', () => {
    const at = EDGE.indexOf('const productFails = issues.filter')
    const block = EDGE.slice(at, EDGE.indexOf("event: 'product_claim_escalated'", at))
    const keep = block.indexOf("b.line.trim() !== ''")
    const blank = block.indexOf("b.line = ''")
    expect(keep).toBeGreaterThan(0)
    expect(keep).toBeLessThan(blank)
  })
})

describe('B: what the extension accepts, the late guards accept', () => {
  // 8eaecdab (sell, Signature Blend's offer on another product): extension 94 → shipped 50.
  const ownOffer = '12oz bag — $18. Whole bean or ground, your choice at checkout.'
  const otherOffer = '5lb bulk bag — $65, whole bean only, roasted to order.'
  const ctx: LateGuardContext = {
    allowedText: ['House Espresso', 'every batch tastes slightly different depending on humidity and bean age', ownOffer].join('\n'),
    excludedTexts: [],
    unpicked: [],
    followAllowed: false,
    sources: [{ kind: 'product', label: 'House Espresso', text: `House Espresso ${ownOffer}` }],
    rejected: [],
    herWords: '',
    foreignOffer: foreignOfferFigures([otherOffer], [ownOffer]),
  }
  const before = [
    { section: 'Re-hook', line: 'That used to stress me out until I realized origin notes are the point.' },
  ]
  const extended = [
    { section: 'Hook', line: 'Why your home espresso tastes completely different two weeks in a row.' },
    { section: 'Setup', line: 'Every batch tastes slightly different depending on humidity and bean age. You can get a 5lb bulk bag for $65.' },
    before[0]!,
    { section: 'CTA', line: 'A 12oz bag is $18, whole bean or ground.' },
  ]
  it('the real cuts are found by the one late check', () => {
    const cuts = lateGuardCuts(extended, ctx)
    expect(cuts.find((c) => c.beat === 0)?.reason).toBe('unbacked_figure')
    expect(cuts.some((c) => c.beat === 1 && /5lb/.test(c.sentence))).toBe(true)
    expect(lateGuardCuts([{ line: 'You can get a 5lb bulk bag for $65.' }], { ...ctx, allowedText: `${ctx.allowedText}\n${otherOffer}` })
      .map((c) => c.reason)).toContain('other_product_offer')
  })
  it('the brief\'s own offer traces to the product, so it is not an invented method', () => {
    expect(lateGuardCuts([extended[3]!], ctx)).toEqual([])
  })
  it('keepLateSafe leaves nothing for the late guards to cut', () => {
    const safe = keepLateSafe(before, extended, ctx)
    expect(lateGuardCuts(safe.beats, ctx)).toEqual([])
    expect(safe.beats.map((b) => b.section)).toEqual(['Setup', 'Re-hook', 'CTA'])
    expect(safe.beats[0]!.line).toBe('Every batch tastes slightly different depending on humidity and bean age.')
  })
  it('a rewrite that fails entirely falls back to its original line', () => {
    const same = [{ line: 'Why your home espresso tastes completely different two weeks in a row.' }]
    const safe = keepLateSafe([{ line: 'Origin notes are the point.' }], same, ctx)
    expect(safe.beats).toEqual([{ line: 'Origin notes are the point.' }])
  })
  it('the edge wires both: one allowed text, and a late length step after the guards', () => {
    expect(EDGE).toMatch(/const knownText = lateAllowedText/)
    expect(EDGE).toMatch(/const allowedText = lateAllowedText/)
    expect(EDGE).toMatch(/const sources: LineSourceInput\[\] = \[\.\.\.lateSources\]/)
    expect(EDGE).toMatch(/keepLateSafe\(integrity\.beats, ext\.beats, lateCtx\)/)
    expect(EDGE).not.toMatch(/event: 'late_length_extended'/)
    expect(EDGE).toMatch(/const extendNow = lateExtend/)
    const late = EDGE.indexOf("event: 'script_length_extended_late'")
    expect(late).toBeGreaterThan(EDGE.indexOf("event: 'script_corrections_enforced'"))
    expect(late).toBeLessThan(EDGE.indexOf("traceBeats('shipped'"))
  })
})

describe('the chosen product is said by name', () => {
  const name = 'Baratza Encore Grinder'
  const lines = [
    'Your espresso is not the problem.',
    'The grind is, and most home setups cannot hold it steady.',
    'This grinder holds the same setting every morning.',
    'It is what I use at home, and the link is in my bio.',
  ]
  it('arcCheck alone is fooled by the generic noun', () => {
    expect(arcCheck(lines, ['Baratza', 'Encore', 'Grinder'], arcFor('teach')).fits).toBe(true)
    expect(productNameSaid(lines, name)).toBe(false)
  })
  it('one reference becomes the name, nothing else changes', () => {
    const r = nameTheProduct(lines, name, arcFor('sell'))
    expect(r.at).toBe(2)
    expect(r.lines[2]).toBe('The Baratza Encore Grinder holds the same setting every morning.')
    expect(productNameSaid(r.lines, name)).toBe(true)
    expect(r.lines.filter((l, i) => l !== lines[i])).toHaveLength(1)
  })
  it('"it" is replaced when there is no noun reference', () => {
    const r = nameTheProduct(['Hook line here.', "It's the only grinder I trust."], 'Baratza Encore', arcFor('sell'))
    expect(r.lines[1]).toBe('The Baratza Encore is the only grinder I trust.')
  })
  it('a script that already says the name is left alone', () => {
    const r = nameTheProduct(['I use the Baratza Encore Grinder.'], name, arcFor('sell'))
    expect(r.at).toBe(-1)
  })
  it('an optional-product arc that never refers to it is left alone', () => {
    const r = nameTheProduct(['A story about my first market.', 'What I learned.'], name, arcFor('entertain'))
    expect(r.at).toBe(-1)
  })
  it('the edge names the product before shipping', () => {
    const at = EDGE.indexOf('nameTheProduct(beatsNow.map')
    expect(at).toBeGreaterThan(EDGE.indexOf('ensureProductShown(bp.script'))
    expect(EDGE.split('nameTheProduct(').length).toBe(2)
    expect(at).toBeLessThan(EDGE.indexOf("traceBeats('shipped'"))
  })
})
