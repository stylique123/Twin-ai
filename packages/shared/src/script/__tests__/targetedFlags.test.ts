// Plan v5.4 §20: TARGETED check-this-line and no bare-fact hooks in GENERATION.
// Trial only; kills TARGETED_FLAGS=false (worker) and HOOK_BARE_FACT_GEN=false
// (edge). Every fixture is MADE UP (a fictional bike-repair creator with a
// newsletter "Spoke Notes"); no model is called.
import { describe, it, expect } from 'vitest'
import {
  targetedRisk, buildTargetedCheckLines, isVerbatimHers, verbatimScore, targetedFlagsOn, VERBATIM_MIN, type TargetedItem,
} from '../checkLines.js'
import { runHookEngine, renderHookCandidateRule, isBareSpecLine, BARE_FACT_PROMPT_RULE } from '../hooks/hookEngine.js'
import { parseNumbers, type LedgerItem } from '../inventionGate.js'

const her = (text: string): TargetedItem => ({ text, first_party: true, live: false })
const SPOKE = 'p-spoke'
// Her material: a story, a product fact and her ONBOARDING answers (niche, profile).
const items: TargetedItem[] = [
  her('My first commute ended with a snapped chain halfway up the bridge because I never oiled it.'),
  her('Spoke Notes: One email every Friday with one repair walked through'),
  her('Spoke Notes: $4 per month'),
  her('I talk about commuting, rain gear and flat fixes, not racing.'),
  her('I fix bikes in a shared garage and explain it to people who ride to work.'),
]

describe('targetedRisk: only a deterministic risk is flagged', () => {
  const cases: Array<[string, string]> = [
    ['absolute_efficacy', 'A waxed chain stops squeaks completely without any extra tools.'],
    ['absolute_efficacy', 'One clean rag changes everything on a wet ride.'],
    ['absolute_efficacy', 'This guaranteed fix keeps your gears quiet.'],
    ['absolute_efficacy', 'Wax eliminates grit on the drivetrain.'],
    ['invented_team', 'Every Friday our team picks one repair to walk through.'],
    ['invented_origin', 'Saving riders from that bridge is why I run Spoke Notes.'],
    ['invented_habit', 'Every weekday morning I check my tyre pressure twice.'],
    ['scarcity_unbacked', 'Spoke Notes spots are almost gone this month.'],
    ['unbacked_number', 'Spoke Notes is $9 per month.'],
    ['unbacked_name', 'I learned this trick from Marco at the shop.'],
  ]
  for (const [reason, line] of cases) it(`${reason}: ${line}`, () => expect(targetedRisk(line, items)).toBe(reason))

  it('generic advice and embellishment are no longer flagged', () => {
    for (const line of [
      'Wipe the chain before you oil it.',
      'A quiet chain makes the commute feel shorter.',
      'Do you check your brakes before a rainy ride?',
      'Stop oiling a dirty chain if the grit is still on it entirely.',
      'Two riders, one pump.',
      'Spoke Notes is $4 per month.',
      'Grab Spoke Notes, link in bio.',
    ]) expect(targetedRisk(line, items)).toBeNull()
  })
  it('evidence on file clears the habit, team and origin rules', () => {
    expect(targetedRisk('One email every Friday walks you through a repair, and I write it.', items)).toBeNull()
    expect(targetedRisk('Our team tests each fix.', [...items, her('Our team of three tests each fix in the garage.')])).toBeNull()
    expect(targetedRisk('That is how I started Spoke Notes.', [...items, her('I started Spoke Notes after a winter of flat tyres.')])).toBeNull()
  })
  it('scarcity passes only with a live fact', () => {
    expect(targetedRisk('Spoke Notes spots are almost gone this month.', [...items, { text: 'urgency: 10 spots left', first_party: true, live: true }])).toBeNull()
  })
  it('Title Case and ALL CAPS overlays are not read as names', () => {
    expect(targetedRisk('Why Your Chain Squeaks', items)).toBeNull()
    expect(targetedRisk('BRIDGE DISASTER', items)).toBeNull()
  })
})

describe('a line verbatim hers is never flagged (onboarding answers included)', () => {
  it('her niche answer said back is hers', () => {
    const line = 'Here is the thing, I talk about commuting, rain gear and flat fixes, not racing.'
    expect(verbatimScore(line, items[3]!.text)).toBeGreaterThanOrEqual(VERBATIM_MIN)
    expect(isVerbatimHers(line, items)).toBe(true)
  })
  it('a verbatim line wins over every rule, an outside item does not', () => {
    const always = her('I always carry a spare tube on every single ride.')
    expect(targetedRisk('I always carry a spare tube on every single ride.', [...items, always])).toBeNull()
    expect(targetedRisk('I always carry a spare tube on every single ride.', [...items, { ...always, first_party: false }])).not.toBeNull()
  })
})

describe('buildTargetedCheckLines', () => {
  it('reads every script sentence and records index, reason and offsets', () => {
    const bp = { script: [
      { line: 'My first commute ended with a snapped chain halfway up the bridge because I never oiled it.' },
      { line: 'Wipe the chain first. Wax stops squeaks completely.' },
      { line: 'Grab Spoke Notes, link in bio.' },
    ], hook_options: ['Wax stops squeaks completely.'] }
    const out = buildTargetedCheckLines(bp, items)
    expect(out).toHaveLength(1)
    expect(out[0]!.line_index).toBe(1)
    expect(out[0]!.reason).toBe('absolute_efficacy')
    expect(bp.script[1]!.line.slice(out[0]!.span.start, out[0]!.span.end)).toBe('Wax stops squeaks completely.')
  })
  it('kill switch: on unless TARGETED_FLAGS is false', () => {
    expect(targetedFlagsOn(undefined)).toBe(true)
    expect(targetedFlagsOn('true')).toBe(true)
    expect(targetedFlagsOn('false')).toBe(false)
    expect(targetedFlagsOn(' FALSE ')).toBe(false)
  })
})

// ── bare-fact hooks leave GENERATION ──
const item = (o: Partial<LedgerItem> & Pick<LedgerItem, 'id' | 'origin' | 'text'>): LedgerItem => ({
  product_id: null, field: null, numbers: parseNumbers(o.text, o.field ?? null), first_party: true, live: false, source_label: o.origin, ...o,
})
const ledger: LedgerItem[] = [
  item({ id: 'h1', origin: 'her_story', text: 'My first commute ended with a snapped chain halfway up the bridge because I never oiled it.' }),
  item({ id: 'p1', origin: 'product_fact', product_id: SPOKE, field: 'price', text: '$4 per month for one repair email every Friday, never more than that' }),
  item({ id: 'p2', origin: 'product_fact', product_id: SPOKE, field: 'includes', text: 'Written, tested and photographed in the garage before it ships' }),
]
const products = [{ id: SPOKE, name: 'Spoke Notes' }]

describe('bare-fact hooks are never generated (HOOK_BARE_FACT_GEN)', () => {
  it('isBareSpecLine: a price, size or process list with no person in it', () => {
    expect(isBareSpecLine('$4 for one repair email a week.')).toBe(true)
    expect(isBareSpecLine('Hand-built, trued and tested twice.')).toBe(true)
    expect(isBareSpecLine('Written and tested in a shared garage.')).toBe(false)
    expect(isBareSpecLine('Stop oiling a dirty chain.')).toBe(false)
    expect(isBareSpecLine('Is $4 too much for a quiet chain?')).toBe(false)
    expect(isBareSpecLine('$4 a month gets you my best repair.')).toBe(false)
  })
  it('the writer prompt does not ask for price_or_proof and says why', () => {
    const on = renderHookCandidateRule(ledger, { noBareFact: true })
    const off = renderHookCandidateRule(ledger)
    expect(off).toContain('price_or_proof')
    expect(on).not.toContain('price_or_proof')
    expect(on).toContain(BARE_FACT_PROMPT_RULE)
    expect(off).not.toContain(BARE_FACT_PROMPT_RULE)
  })
  it('the engine produces no fact_open, price_or_proof or bare spec candidate; off, it does', () => {
    const cands = [
      { shape: 'price_or_proof', text: 'Spoke Notes is $4 per month.' },
      { shape: 'stop_doing', text: 'Hand-built, trued and tested twice.' },
      { shape: 'stop_doing', text: 'Stop oiling a dirty chain before your commute.' },
    ]
    const opts = { trial: true, products, targetProductId: SPOKE, request: 'chain repair email' }
    const on = runHookEngine(cands, ledger, { ...opts, noBareFactGen: true })
    expect(on.record.candidates.map((c) => c.source)).not.toContain('fact_open')
    expect(on.record.candidates.map((c) => c.shape)).not.toContain('price_or_proof')
    expect(on.pick.hooks).not.toContain('Hand-built, trued and tested twice.')
    expect(on.record.candidates.length).toBeLessThan(cands.length + 2)
    const off = runHookEngine(cands, ledger, opts)
    expect(off.record.candidates.map((c) => c.shape)).toContain('price_or_proof')
    expect(off.record.candidates.length).toBeGreaterThan(on.record.candidates.length)
  })
})
