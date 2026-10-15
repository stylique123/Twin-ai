// GATE RE-CALIBRATION (trial only): rule-only event/habit I lines are REVIEW,
// not BLOCK, when `ruleReview` is on. Off, nothing changes. Fixtures are MADE UP
// (a fictional candle maker, product "Dune Jar"); the judges are fakes.
import { describe, it, expect } from 'vitest'
import {
  buildLedger, extractSentences, classifyTwoJudges, softenRuleBlocks, runInventionGate, RULE_REVIEW_REASONS,
  type ClassifiedSentence, type GateBlueprint, type LedgerItem,
} from '../inventionGate.js'

const DUNE = 'prod-dune'
const products = [{ id: DUNE, name: 'Dune Jar' }]
const ledger = (): LedgerItem[] => buildLedger({
  knowledge: [{ id: 'k-wick', kind: 'fact', text: 'I trim every Dune Jar wick to a quarter inch before it ships' }],
  products: [{ id: DUNE, name: 'Dune Jar', knowledge: [{ id: 'f-size', field: 'size', value: 'Dune Jar is an 8 oz candle' }] }],
  targetProductId: DUNE, now: 0,
})
// Every judged sentence reads S against the wick fact; rule-decided lines never reach it.
const judge = async (prompt: string) => {
  const block = prompt.split('SENTENCES:')[1] ?? ''
  const rows = [...block.matchAll(/^(\d+)\. \([a-z_]+[^)]*\) .*$/gm)]
  return JSON.stringify({ sentences: rows.map((m) => ({ i: Number(m[1]), class: 'S', item_ids: ['k-wick'] })) })
}
const rewrite = async () => JSON.stringify({ rewrites: [] })

const row = (o: Partial<ClassifiedSentence>): ClassifiedSentence => ({
  i: 0, surface: 'script', class: 'I', claim_types: [], item_ids: [], reason: 'no_item', near: [], judged: false,
  fast_class: 'I', strong_class: 'I', verdict: 'block', ...o,
} as ClassifiedSentence)

describe('softenRuleBlocks', () => {
  it('only the overlap-threshold rule reasons are softened', () => {
    expect([...RULE_REVIEW_REASONS].sort()).toEqual(['event_unbacked', 'habit_unbacked'])
  })
  it('a rule-only event/habit block becomes a G review line, reason kept', () => {
    const out = softenRuleBlocks([row({ reason: 'event_unbacked' }), row({ i: 1, reason: 'habit_unbacked' })])
    for (const c of out) expect(c).toMatchObject({ class: 'G', verdict: 'review' })
    expect(out.map((c) => c.reason)).toEqual(['event_unbacked', 'habit_unbacked'])
  })
  it('other rule blocks, judged blocks and non-blocks are untouched', () => {
    const cs = [
      row({ reason: 'number_unmatched' }),
      row({ i: 1, reason: 'scarcity_not_live' }),
      row({ i: 2, reason: 'event_unbacked', judged: true }),
      row({ i: 3, reason: 'no_item', judged: true }),
      row({ i: 4, class: 'S', reason: 'entailed', verdict: 'pass', fast_class: 'S', strong_class: 'S' }),
    ]
    expect(softenRuleBlocks(cs)).toEqual(cs)
  })
})

describe('ruleReview in the two-judge classify', () => {
  const bp: GateBlueprint = { script: [
    { line: 'Last spring I drove to the coast and poured my first Dune Jar in a rented cabin.' },
    { line: 'I trim every Dune Jar wick to a quarter inch before it ships.' },
  ] }
  it('the invented story line is a rule block before softening and review after', () => {
    const sentences = extractSentences(bp)
    const cs = classifyTwoJudges({ sentences, ledger: ledger(), products, targetProductId: DUNE, fast: new Map(), strong: new Map() })
    const story = cs.find((c) => c.i === 0)!
    expect(story).toMatchObject({ class: 'I', verdict: 'block', reason: 'event_unbacked' })
    expect(softenRuleBlocks(cs).find((c) => c.i === 0)).toMatchObject({ class: 'G', verdict: 'review', reason: 'event_unbacked' })
  })
  it('off by default: the gate blocks and repairs the story line', async () => {
    const r = await runInventionGate({ blueprint: bp, ledger: ledger(), products, targetProductId: DUNE, measureOnly: true }, { judge, rewrite })
    expect(r.record.sentences.find((c) => c.i === 0)).toMatchObject({ verdict: 'block', class: 'I' })
    expect(r.record.verdicts).toMatchObject({ block: 1 })
  })
  it('on: the story line ships as a review line, never repaired, still flagged', async () => {
    const r = await runInventionGate({ blueprint: bp, ledger: ledger(), products, targetProductId: DUNE, ruleReview: true }, { judge, rewrite })
    expect(r.record.sentences.find((c) => c.i === 0)).toMatchObject({ verdict: 'review', class: 'G', reason: 'event_unbacked' })
    expect(r.record.verdicts).toEqual({ review: 1, block: 0 })
    expect(r.record.review_lines).toContainEqual({ i: 0, surface: 'script' })
    expect(r.record.repaired).toEqual({ replaced: 0, asked: 0, dropped: 0 })
    expect(r.record.outcome).toBe('final')
    expect(r.blueprint).toEqual(bp)
  })
})
