// Twin plan v5.1 items C (repair calibration) and H (spine fill). Trial only;
// off, nothing changes. Every fixture is MADE UP (a fictional candle maker,
// product "Dune Jar"); the judges are fakes. No model is called.
import { describe, it, expect } from 'vitest'
import {
  buildLedger, calibrateRepairs, repairAllowed, runInventionGate, extractSentences, REPAIR_CALIBRATION, REPAIR_MAX_FALSE_DROP, SAFETY_PROMISE_RE,
  type ClassifiedSentence, type GateBlueprint, type GateReason, type LedgerItem,
} from '../inventionGate.js'
import { planSpine } from '../planner/spinePlanner.js'
import { planSpineBeats, fillSpineBeats, renderSpineBeatsBlock, isAudienceObjection, CTA_ASK_RE } from '../planner/spineContract.js'

const DUNE = 'prod-dune'
const products = [{ id: DUNE, name: 'Dune Jar' }]
const ledger = (): LedgerItem[] => buildLedger({
  knowledge: [{ id: 'k-wick', kind: 'fact', text: 'I trim every Dune Jar wick to a quarter inch before it ships' }],
  products: [{ id: DUNE, name: 'Dune Jar', knowledge: [{ id: 'f-size', field: 'size', value: 'Dune Jar is an 8 oz candle' }] }],
  targetProductId: DUNE, now: 0,
})
// Both judges say I for every judged sentence (the over-flagging case).
const judgeAllI = async (prompt: string) => {
  const block = prompt.split('SENTENCES:')[1] ?? ''
  const rows = [...block.matchAll(/^(\d+)\. \([a-z_]+[^)]*\) .*$/gm)]
  return JSON.stringify({ sentences: rows.map((m) => ({ i: Number(m[1]), class: 'I', item_ids: [], claim_types: ['result'] })) })
}
const rewrite = async () => JSON.stringify({ rewrites: [] })
const row = (o: Partial<ClassifiedSentence>): ClassifiedSentence => ({
  i: 0, surface: 'script', class: 'I', claim_types: [], item_ids: [], reason: 'no_item', near: [], judged: true,
  fast_class: 'I', strong_class: 'I', verdict: 'block', at: 0, k: 0, ...o,
} as ClassifiedSentence)

describe('repair calibration (item C)', () => {
  it('no measured class is above the false-drop bar and allowed; unmeasured classes are never repaired', () => {
    for (const [reason, m] of Object.entries(REPAIR_CALIBRATION)) {
      expect(repairAllowed(reason as GateReason)).toBe(m!.false_drops / m!.n <= REPAIR_MAX_FALSE_DROP)
    }
    expect(repairAllowed('scarcity_not_live')).toBe(false)
    expect(repairAllowed('no_item')).toBe(false)
  })
  it('a block becomes a review line (G), reason kept; S, N and existing reviews are untouched', () => {
    const cs = [row({}), row({ i: 1, class: 'S', verdict: 'pass', reason: 'entailed' }), row({ i: 2, class: 'G', verdict: 'review', reason: 'general_unsourced' })]
    const sentences = cs.map((c) => ({ i: c.i, surface: 'script' as const, at: c.i, k: 0, text: 'A made-up line.' }))
    const out = calibrateRepairs(cs, sentences)
    expect(out[0]).toMatchObject({ class: 'G', verdict: 'review', reason: 'no_item' })
    expect(out.slice(1)).toEqual(cs.slice(1))
  })
  it('an unbacked safety promise is never a passing truism under calibration', () => {
    expect(SAFETY_PROMISE_RE.test('Hold the jar by the base and your fingers stay totally safe.')).toBe(true)
    expect(SAFETY_PROMISE_RE.test("It holds about 8 oz, and it's dishwasher safe.")).toBe(false)
    const cs = [row({ class: 'N', verdict: 'pass', reason: 'truism', judged: false })]
    const out = calibrateRepairs(cs, [{ i: 0, surface: 'script', at: 0, k: 0, text: 'Light it this way and your table stays completely safe.' }])
    expect(out[0]).toMatchObject({ class: 'G', verdict: 'review', reason: 'safety_promise' })
  })

  const bp: GateBlueprint = { script: [
    { line: 'Dune Jar doubled my sales overnight.' },
    { line: 'I trim every Dune Jar wick to a quarter inch before it ships.' },
  ] }
  it('off: the judged I line is blocked and repaired', async () => {
    const r = await runInventionGate({ blueprint: bp, ledger: ledger(), products, targetProductId: DUNE }, { judge: judgeAllI, rewrite })
    expect(r.record.verdicts!.block).toBeGreaterThan(0)
    expect(r.record.repaired.dropped + r.record.repaired.asked + r.record.repaired.replaced).toBeGreaterThan(0)
  })
  it('on: nothing is deleted; every flag ships as a CHECK THIS LINE review line', async () => {
    const r = await runInventionGate({ blueprint: bp, ledger: ledger(), products, targetProductId: DUNE, repairCalibrated: true, checkLines: true }, { judge: judgeAllI, rewrite })
    expect(r.record.repaired).toEqual({ replaced: 0, asked: 0, dropped: 0 })
    expect(r.blueprint.script).toEqual(bp.script)
    expect(r.record.verdicts!.block).toBe(0)
    const scriptReview = (r.record.review_lines ?? []).filter((x) => x.surface === 'script')
    // Recall kept: every line both judges flagged is still flagged.
    expect(scriptReview.length).toBeGreaterThanOrEqual(1)
    expect(extractSentences(r.blueprint).filter((s) => s.surface === 'script').length).toBe(2)
  })
})

// ── H: spine fill ──
const item = (o: Partial<LedgerItem> & Pick<LedgerItem, 'id' | 'origin'>): LedgerItem => ({
  product_id: null, field: null, text: 'a made-up line', numbers: [], first_party: true, live: false, source_label: o.origin, ...o,
})
// Fictional candle maker "Wickwood".
const base: LedgerItem[] = [
  item({ id: 'k1', origin: 'her_story', text: 'I burned through ten soy candle batches before the wick stopped tunneling.' }),
  item({ id: 'r1', origin: 'outside_research', first_party: false, text: 'Soy candle wicks tunnel when the first burn is shorter than two hours.' }),
  item({ id: 'a1', origin: 'audience_question', first_party: false, text: 'Is a soy candle really worth it if the wick keeps tunneling?' }),
  item({ id: 'offer', origin: 'offer', product_id: 'c1', text: 'The soy candles are in my shop.' }),
]
const request = { goal: 'educate', angle: 'teach_list', note: 'why my soy candle wick tunnels' }

describe('spine fill (item H)', () => {
  it('off: no outside reality check and no audience objection', () => {
    const plan = planSpine({ request, ledger: base, targetProductId: 'c1' })
    const sb = planSpineBeats({ plan, ledger: base, targetProductId: 'c1' })
    expect(sb.beats.find((b) => b.role === 'reality_check')!.item_ids).toEqual([])
    expect(sb.objection_used).toBe(false)
  })
  it('on: the reality check takes the sourced outside fact and a real audience doubt becomes the objection', () => {
    const plan = planSpine({ request, ledger: base, targetProductId: 'c1' })
    const sb = planSpineBeats({ plan, ledger: base, targetProductId: 'c1', fill: true })
    expect(sb.beats.find((b) => b.role === 'reality_check')!.item_ids).toEqual(['r1'])
    expect(sb.reality_source).toBe('outside')
    expect(sb.objection_item_id).toBe('a1')
    expect(isAudienceObjection(base[2]!)).toBe(true)
    expect(renderSpineBeatsBlock(sb)).toMatch(/reality_check \[r1\].*keeping its key words/)
  })
  it('never invents: with no material on file the reality check stays empty', () => {
    const only = [base[0]!, base[3]!]
    const plan = planSpine({ request, ledger: only, targetProductId: 'c1' })
    const sb = planSpineBeats({ plan, ledger: only, targetProductId: 'c1', fill: true })
    expect(sb.beats.find((b) => b.role === 'reality_check')!.item_ids).toEqual([])
    expect(sb.reality_source).toBeNull()
    expect(sb.objection_used).toBe(false)
  })
  it('fills a missing item-backed reality check verbatim and keeps exactly one CTA', () => {
    const plan = planSpine({ request, ledger: base, targetProductId: 'c1' })
    const sb = planSpineBeats({ plan, ledger: base, targetProductId: 'c1', fill: true })
    const script = [
      { section: 'Hook', line: 'Here is my fix. Save this for later.' },
      { section: 'CTA', line: 'Find them in my shop, link in bio.' },
    ]
    const f = fillSpineBeats(script, sb, base, '')
    expect(f.record.filled).toEqual(['reality_check', 'creator_truth'])
    expect(f.script[1]).toEqual({ section: 'Reality Check', line: base[1]!.text })
    expect(f.script[2]).toEqual({ section: 'Creator Truth', line: base[0]!.text })
    expect(f.record.cta_before).toBe(2)
    expect(f.record.cta_after).toBe(1)
    expect(f.script[0]!.line).toBe('Here is my fix.')
    expect(f.script[f.script.length - 1]!.line).toBe('Find them in my shop, link in bio.')
    expect(f.script.filter((b) => CTA_ASK_RE.test(String(b.line))).length).toBe(1)
  })
})
