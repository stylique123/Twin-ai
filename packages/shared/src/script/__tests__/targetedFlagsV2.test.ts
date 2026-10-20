// Targeted flags v2 (trial only; kills TARGETED_FLAGS_V2=false, WRONG_PRODUCT_BLOCK=false,
// HOOK_CLAIM_GATE=false). Every fixture is MADE UP (a fictional candle maker,
// "Ember & Wick", with two candles); no model is called.
import { describe, it, expect } from 'vitest'
import {
  targetedRiskV2, timeframesOf, wrongProductOf, blockWrongProductLines, buildTargetedCheckLinesV2, hookClaimRisk,
  targetedFlagsV2On, wrongProductBlockOn, hookClaimGateOn, type TargetedItemV2, type TargetedProduct,
} from '../checkLines.js'
import { runHookEngine } from '../hooks/hookEngine.js'
import { buildLedger, type LedgerItem } from '../inventionGate.js'

const her = (text: string): TargetedItemV2 => ({ text, first_party: true, live: false })
const fact = (product_id: string, text: string): TargetedItemV2 => ({ text, first_party: true, live: false, product_id, origin: 'product_fact' })
const products: TargetedProduct[] = [{ id: 'p-cedar', name: 'Cedar Candle' }, { id: 'p-fig', name: 'Fig Night' }]
const items: TargetedItemV2[] = [
  her('My first pour cracked down the middle because I cooled the jars by an open window.'),
  her('A neighbour told me the candle tunnelled after a week, and she was burning it for twenty minutes at a time.'),
  her('I talk about soy wax, wick sizes and slow evenings, not home decor.'),
  fact('p-cedar', '$24 for a 220 g jar'),
  fact('p-cedar', 'Poured on Mondays and cured for two weeks before shipping'),
  fact('p-fig', 'A double cotton wick that burns cleaner in a wide tin'),
  fact('p-fig', '$26 for a 300 g tin'),
]

describe('targetedRiskV2: the panel-10 misses', () => {
  const cases: Array<[string, string]> = [
    ['wrong_product', 'It was Cedar Candle, a double cotton wick that burns cleaner in a wide tin.'],
    ['invented_inner_state', 'A customer emailed, and my first instinct was to assume the wax was bad.'],
    ['invented_inner_state', 'I realized the window was the problem.'],
    ['absolute_efficacy', 'Trim the wick first, and you never fight tunnelling again.'],
    ['absolute_efficacy', 'Every single candle burns even this way.'],
    ['unbacked_timeframe', 'Most candles tunnel in week two.'],
    ['unbacked_timeframe', 'Candles tunnel every week.'],
    ['unbacked_timeframe', 'It cracked in five seconds.'],
    ['unsourced_generalisation', 'A lot of advice says burn it for an hour.'],
  ]
  for (const [reason, line] of cases) it(`${reason}: ${line}`, () => expect(targetedRiskV2(line, items, products)).toBe(reason))
})

describe('tolerant number normalisation', () => {
  it('"one week" = "a week" ≈ "seven days"; "ten" = "10"', () => {
    expect(timeframesOf('after one week')[0]!.days).toBe(7)
    expect(timeframesOf('after a week')[0]!.days).toBe(7)
    expect(timeframesOf('after seven days')[0]!.days).toBe(7)
    expect(timeframesOf('a 14-day trial')[0]!.days).toBe(14)
    expect(timeframesOf('in week two')[0]).toEqual({ days: 14, ordinal: true })
    for (const line of [
      'Why does your candle tunnel after one week?',
      'Why does your candle tunnel after seven days?',
      'Cedar Candle cures for two weeks before it ships.',
      'Cedar Candle is $24 for a 220 g jar.',
    ]) expect(targetedRiskV2(line, items, products)).toBeNull()
    expect(targetedRiskV2('It burned for ten minutes.', [...items, her('I burned it for 10 minutes.')], products)).toBeNull()
  })
  it('an unbacked duration still flags', () => {
    expect(targetedRiskV2('It tunnelled after three months.', items, products)).toBe('unbacked_timeframe')
  })
})

describe('never a line verbatim hers; evidence clears a rule', () => {
  it('her story or onboarding answer said back is hers', () => {
    expect(targetedRiskV2('A neighbour told me the candle tunnelled after a week, and she was burning it for twenty minutes at a time.', items, products)).toBeNull()
    expect(targetedRiskV2('Here is the thing, I talk about soy wax, wick sizes and slow evenings, not home decor.', items, products)).toBeNull()
  })
  it('an item of hers that says it clears inner state, absolutes and frequency', () => {
    expect(targetedRiskV2('I realized the window was the problem.', [...items, her('I realized the open window was cracking my jars.')], products)).toBeNull()
    expect(targetedRiskV2('Every single jar gets a hand-cut label.', [...items, her('Every jar gets a hand-cut label.')], products)).toBeNull()
    expect(targetedRiskV2('I pour every Monday.', items, products)).toBeNull()
  })
  it('the thought is hers when only the framing is new', () => {
    expect(targetedRiskV2('I learned that cooling jars by an open window cracks the pour.', items, products)).toBeNull()
  })
  it('a product fact said under its OWN name is fine', () => {
    expect(targetedRiskV2('Fig Night has a double cotton wick that burns cleaner in a wide tin.', items, products)).toBeNull()
    expect(wrongProductOf('Fig Night has a double cotton wick that burns cleaner in a wide tin.', items, products)).toBeNull()
  })
  it('generic advice is still not flagged', () => {
    for (const line of ['Trim the wick before you light it.', 'Do you burn candles on weeknights?', 'Grab Cedar Candle, link in bio.']) {
      expect(targetedRiskV2(line, items, products)).toBeNull()
    }
  })
})

describe('wrong-product attribution is BLOCKED', () => {
  it('drops the sentence (an emptied beat is removed), keeps ids, never text', () => {
    const bp = { script: [
      { line: 'My first pour cracked down the middle because I cooled the jars by an open window.' },
      { line: 'Trim the wick first. It was Cedar Candle, a double cotton wick that burns cleaner in a wide tin.' },
      { line: 'Cedar Candle, a double cotton wick that burns cleaner in a wide tin.' },
    ] }
    const out = blockWrongProductLines(bp, items, products)
    expect(out.blocked).toEqual([{ line_index: 1, product_id: 'p-fig' }, { line_index: 2, product_id: 'p-fig' }])
    expect((out.blueprint.script as Array<{ line: string }>).map((b) => b.line)).toEqual([bp.script[0]!.line, 'Trim the wick first.'])
    expect(bp.script).toHaveLength(3)
  })
  it('the ledger keeps product ids on product facts (product_entities)', () => {
    const ledger = buildLedger({ products: [{ id: 'p-fig', name: 'Fig Night', knowledge: [{ field: 'includes', value: 'A double cotton wick' }] }] })
    expect(ledger.find((it) => it.origin === 'product_fact')?.product_id).toBe('p-fig')
  })
})

describe('buildTargetedCheckLinesV2', () => {
  it('records index, reason and offsets', () => {
    const bp = { script: [{ line: 'Trim the wick. I realized the window was the problem.' }] }
    expect(buildTargetedCheckLinesV2(bp, items, products)).toEqual([
      { line_index: 0, reason: 'invented_inner_state', span: { start: 15, end: 53 } },
    ])
  })
})

describe('HOOK CLAIM GATE', () => {
  it('reads hooks for generalisations too', () => {
    expect(hookClaimRisk('Most people burn candles wrong.', items, products)).toBe('unsourced_generalisation')
    expect(hookClaimRisk('Why do so many candles tunnel?', items, products)).toBe('unsourced_generalisation')
    expect(hookClaimRisk('Why does your candle tunnel after one week?', items, products)).toBeNull()
  })
  it('drops a matching candidate before the pick; off restores it', () => {
    const ledger: LedgerItem[] = buildLedger({ knowledge: [{ id: 'k1', kind: 'experience', text: items[0]!.text }] })
    const cands = [{ text: 'Why do candles tunnel every single week?', shape: 'question' }, { text: 'Do you trim your wick before lighting it?', shape: 'question' }]
    const on = runHookEngine(cands, ledger, { trial: true, claimGate: true })
    const off = runHookEngine(cands, ledger, { trial: true, claimGate: false })
    expect(on.record.candidates.length).toBe(off.record.candidates.length - 1)
  })
  it('kill switches are on unless exactly false', () => {
    for (const fn of [targetedFlagsV2On, wrongProductBlockOn, hookClaimGateOn]) {
      expect(fn(undefined)).toBe(true)
      expect(fn('false')).toBe(false)
    }
  })
})
