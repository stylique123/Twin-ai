// The spine contract (A6). Every fixture here is made up (fictional creators and products).
import { describe, it, expect } from 'vitest'
import { contentWords, type LedgerItem } from '../inventionGate.js'
import { planSpine } from '../planner/spinePlanner.js'
import {
  planSpineBeats, renderSpineBeatsBlock, checkSpineBeatAdherence, spineBeatsRecord, isObjectionItem,
  checkTitlePromise, titleFromHook, enforceTitlePromise, CREATOR_TRUTH_QUESTION,
} from '../planner/spineContract.js'

const item = (o: Partial<LedgerItem> & Pick<LedgerItem, 'id' | 'origin'>): LedgerItem => ({
  product_id: null, field: null, text: 'a made-up line', numbers: [], first_party: true, live: false, source_label: o.origin, ...o,
})

// Fictional candle maker "Wickwood", made up.
const base: LedgerItem[] = [
  item({ id: 'k1', origin: 'her_story', text: 'I burned through ten soy candle batches before the wick stopped tunneling.' }),
  item({ id: 'p1', origin: 'product_fact', product_id: 'c1', field: 'process_step', text: 'Each soy candle wick is trimmed and tested before shipping.' }),
  item({ id: 'offer', origin: 'offer', product_id: 'c1', text: 'The soy candles are in my shop.' }),
]
const hesitation = item({ id: 'p:c1:main_hesitation:0', origin: 'product_fact', product_id: 'c1', field: 'main_hesitation', text: 'People worry soy candle wicks tunnel and waste the wax.' })
const request = { goal: 'educate', angle: 'teach_list', note: 'why my soy candle wick tunnels' }

describe('spine beats', () => {
  it('orders Hook → Reality check → Creator truth → CTA and draws truth only from her material', () => {
    const plan = planSpine({ request, ledger: base, targetProductId: 'c1' })
    const sb = planSpineBeats({ plan, ledger: base, targetProductId: 'c1' })
    expect(sb.beats.map((b) => b.role)).toEqual(['hook', 'reality_check', 'creator_truth', 'cta'])
    const truth = sb.beats.find((b) => b.role === 'creator_truth')!
    expect(truth.item_ids).toEqual(['k1'])
    expect(sb.beats.find((b) => b.role === 'cta')!.item_ids).toEqual(['offer'])
    expect(sb.creator_truth_missing).toBe(false)
    expect(sb.questions).toEqual([])
  })

  it('turns a missing creator truth into a Need Check question, never invented', () => {
    const only = [base[1]!, base[2]!, item({ id: 'r1', origin: 'outside_research', first_party: false, text: 'Soy candle wicks tunnel when burned briefly.' })]
    const plan = planSpine({ request, ledger: only, targetProductId: 'c1' })
    const sb = planSpineBeats({ plan, ledger: only, targetProductId: 'c1' })
    expect(sb.creator_truth_missing).toBe(true)
    expect(sb.beats.find((b) => b.role === 'creator_truth')!.item_ids).toEqual([])
    expect(sb.questions.map((q) => q.writes_to)).toContain(CREATOR_TRUTH_QUESTION.writes_to)
    expect(renderSpineBeatsBlock(sb)).toMatch(/do not write her stance/)
  })
})

describe('objection move', () => {
  it('is used only when her material holds a hesitation item, and records its id', () => {
    const ledger = [...base, hesitation]
    const plan = planSpine({ request, ledger, targetProductId: 'c1' })
    const sb = planSpineBeats({ plan, ledger, targetProductId: 'c1' })
    expect(sb.objection_used).toBe(true)
    expect(sb.objection_item_id).toBe(hesitation.id)
    expect(sb.beats.map((b) => b.role)).toEqual(['hook', 'reality_check', 'creator_truth', 'objection', 'cta'])
    const rec = spineBeatsRecord(sb)
    expect(rec.objection_used).toBe(true)
    expect(JSON.stringify(rec)).not.toMatch(/worry/)
  })
  it('is skipped otherwise', () => {
    const plan = planSpine({ request, ledger: base, targetProductId: 'c1' })
    const sb = planSpineBeats({ plan, ledger: base, targetProductId: 'c1' })
    expect(sb.objection_used).toBe(false)
    expect(sb.objection_item_id).toBeNull()
    expect(renderSpineBeatsBlock(sb)).toMatch(/No objection move/)
  })
  it('ignores unconfirmed, other-product or empty hesitation items', () => {
    expect(isObjectionItem({ ...hesitation, first_party: false })).toBe(false)
    expect(isObjectionItem({ ...hesitation, text: 'skip' })).toBe(false)
    const other = { ...hesitation, product_id: 'other' }
    const plan = planSpine({ request, ledger: [...base, other], targetProductId: 'c1' })
    expect(planSpineBeats({ plan, ledger: [...base, other], targetProductId: 'c1' }).objection_used).toBe(false)
    expect(isObjectionItem(item({ id: 'answer:hesitation', origin: 'her_answer', field: 'hesitation', text: 'They think it is too fiddly.' }))).toBe(true)
  })
})

describe('per-beat adherence', () => {
  it('marks each beat met or missing with a reason', () => {
    const ledger = [...base, hesitation]
    const plan = planSpine({ request, ledger, targetProductId: 'c1' })
    const sb = planSpineBeats({ plan, ledger, targetProductId: 'c1' })
    const script = [
      { line: 'Your soy candle wick keeps tunneling?' },
      { line: 'You probably think it is the wax.' }, // viewer framing; "most people …" no longer counts (panel-current-5)
      { line: 'I burned through ten soy candle batches before the wick stopped tunneling.' },
      { line: 'Worried the wicks tunnel and waste wax? Trim before every burn.' },
      { line: 'The soy candles are in my shop, link in bio.' },
    ]
    const adh = checkSpineBeatAdherence(script, sb, ledger, plan.spine?.claim)
    expect(adh.every((a) => a.met)).toBe(true)
    const thin = checkSpineBeatAdherence([{ line: 'Hello there everyone today.' }], sb, ledger, plan.spine?.claim)
    expect(thin.find((a) => a.role === 'creator_truth')!.met).toBe(false)
  })
})

describe('title inherits the hook', () => {
  const hook = 'Your soy candle wick tunnels because you blow it out too early.'
  it('passes a title with the same promise', () => {
    expect(checkTitlePromise('Why your soy candle wick tunnels', hook).match).toBe(true)
  })
  it('fails on a new claim, a new number, or no shared key words', () => {
    expect(checkTitlePromise('The best soy candle wick secret', hook).reasons).toContain('new_claim_word')
    expect(checkTitlePromise('3 soy candle wick fixes', hook).reasons).toContain('new_number')
    expect(checkTitlePromise('My morning studio routine', hook).reasons).toContain('no_shared_key_words')
    expect(checkTitlePromise('', hook).reasons).toEqual(['no_title'])
  })
  it('rewrites from the hook deterministically, or flags', () => {
    const r = enforceTitlePromise(['My morning studio routine', 'other'], hook)
    expect(r.record.action).toBe('rewritten')
    expect(r.titles[0]).toBe(titleFromHook(hook))
    expect(r.titles[1]).toBe('other')
    for (const w of contentWords(String(r.titles[0]))) expect(contentWords(hook).has(w)).toBe(true)
    expect(enforceTitlePromise(['Anything'], '').record.action).toBe('flagged')
    expect(enforceTitlePromise(['Why your soy candle wick tunnels'], hook).record).toEqual({ match: true, reasons: [], action: 'kept' })
  })
})
