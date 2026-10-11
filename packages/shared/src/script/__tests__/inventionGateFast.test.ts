// THE GATE'S FAST PATH (owner decision 13 Oct): rules prefilter, chunks with a
// per-chunk ledger, parallel calls, and the read→extract cascade. Fictional
// fixtures only; the judges are fakes that answer from a table.
import { describe, it, expect } from 'vitest'
import {
  buildLedger, extractSentences, ruleRead, judgeSentences, chunk, chunkLedger, decidedByRule, runInventionGate,
  JUDGE_CHUNK_SIZE, JUDGE_CONCURRENCY, JUDGE_THINKING_BUDGET, INVENTION_JUDGE_CASCADE, JUDGE_SCHEMA,
  type GateBlueprint, type GateProgress, type LedgerItem,
} from '../inventionGate.js'

const HARBOR = 'prod-harbor'
const NIGHT = 'prod-nightowl'
const products = [{ id: HARBOR, name: 'Harbor Blend' }, { id: NIGHT, name: 'Night Owl Espresso' }]

function ledger(): LedgerItem[] {
  return buildLedger({
    knowledge: [
      { id: 'k-roast', kind: 'fact', text: 'I roast every batch of Harbor Blend myself on Tuesday mornings' },
      { id: 'k-garage', kind: 'experience', text: 'I started roasting in my garage with a popcorn popper' },
    ],
    products: [
      { id: HARBOR, name: 'Harbor Blend', knowledge: [
        { id: 'f-notes', field: 'feature', value: 'Harbor Blend tastes like dark chocolate and orange peel' },
        { id: 'f-grind', field: 'feature', value: 'Grind it medium-fine for a pour over' },
      ] },
      { id: NIGHT, name: 'Night Owl Espresso', knowledge: [
        { id: 'f-night', field: 'process_step', value: 'Night Owl Espresso is roasted in small batches' },
      ] },
    ],
    targetProductId: HARBOR,
    outside: [{ id: 'w1', kind: 'research', text: 'Specialty roasters rest beans for a few days' }],
    now: 0,
  })
}

/** Fake judge from a table; `uncertain` marks rows the fast model is unsure of. */
function fake(table: Array<[RegExp, 'S' | 'E' | 'I' | 'N', string[]?, boolean?]>, fallback: ['S' | 'I', string[]] = ['S', ['k-roast']]) {
  const calls: string[] = []
  let inFlight = 0
  let maxInFlight = 0
  const fn = async (prompt: string) => {
    calls.push(prompt)
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise((r) => setTimeout(r, 2))
    inFlight--
    const block = prompt.split('SENTENCES:')[1] ?? ''
    const rows = [...block.matchAll(/^(\d+)\. \([a-z_]+\) (.*)$/gm)]
    return JSON.stringify({ sentences: rows.map((m) => {
      const hit = table.find(([re]) => re.test(m[2]!))
      return hit
        ? { i: Number(m[1]), class: hit[1], item_ids: hit[2] ?? [], ...(hit[3] ? { uncertain: true } : {}) }
        : { i: Number(m[1]), class: fallback[0], item_ids: fallback[1] }
    }) })
  }
  return Object.assign(fn, { calls, max: () => maxInFlight })
}
const sentIn = (prompt: string) => [...(prompt.split('SENTENCES:')[1] ?? '').matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]))

const WORDS = ['bright', 'smooth', 'rich', 'mellow', 'bold', 'deep', 'soft', 'warm', 'round', 'clean']
const plain = (n: number) => Array.from({ length: n }, (_, k) => `Harbor Blend tastes like dark chocolate, ${WORDS[k % WORDS.length]} cup ${WORDS[Math.floor(k / WORDS.length) % WORDS.length]}`)
const bp = (...lines: string[]): GateBlueprint => ({ script: lines.map((line, n) => ({ section: n === 0 ? 'Hook' : 'Body', line })) })

describe('constants and schema', () => {
  it('chunks of ~6, concurrency 4, thinking off, cascade read→extract, uncertain in the schema', () => {
    expect(JUDGE_CHUNK_SIZE).toBe(6)
    expect(JUDGE_CONCURRENCY).toBe(4)
    expect(JUDGE_THINKING_BUDGET).toBe(0)
    expect(INVENTION_JUDGE_CASCADE).toEqual({ fast: 'read', strong: 'extract' })
    expect(JUDGE_SCHEMA.properties.sentences.items.properties).toHaveProperty('uncertain')
  })
  it('chunk splits into groups of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])).toEqual([[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12], [13]])
    expect(chunk([], 6)).toEqual([])
  })
})

describe('prefilter', () => {
  it('a sentence N by rule and a sentence I by a hard rule never reach the judge', async () => {
    const L = ledger()
    const b = bp(
      'Harbor Blend tastes like dark chocolate and orange peel.', // judged
      'What do you drink in the morning?', // N by rule (pure question)
      'It sells out every single week.', // I by hard rule (scarcity, not live)
      'I roast it in a 450 degree drum.', // I by hard rule (number unmatched)
      'Link in bio.', // N by rule
    )
    const sentences = extractSentences(b)
    const reads = sentences.map((s) => ruleRead(s, L, products, HARBOR))
    expect(sentences.map((s, k) => decidedByRule(s, reads[k]!))).toEqual([false, true, true, true, true])
    const judge = fake([])
    const out = await judgeSentences({ sentences, ledger: L, products, targetProductId: HARBOR }, { judge })
    expect(judge.calls).toHaveLength(1)
    expect(sentIn(judge.calls[0]!)).toEqual([0])
    expect(out.perf).toMatchObject({ prefiltered: 4, judged: 1, judge_calls: 1, escalations: 0 })
    // The gate still classifies the skipped sentences by rule: N stays N, hard I stays I.
    const r = await runInventionGate({ blueprint: b, ledger: L, products, targetProductId: HARBOR, measureOnly: true }, { judge: fake([]), rewrite: async () => '{"rewrites":[]}' })
    expect(r.record.sentences.map((s) => s.class)).toEqual(['S', 'N', 'I', 'I', 'N'])
    expect(r.record.sentences.map((s) => s.reason)).toEqual(['entailed', 'pure_question', 'scarcity_not_live', 'number_unmatched', 'cta'])
  })
  it('a script the rules decide entirely makes no judge call', async () => {
    const judge = fake([])
    const out = await judgeSentences({ sentences: extractSentences(bp('What do you drink?', 'Link in bio.')), ledger: ledger(), products, targetProductId: HARBOR }, { judge })
    expect(judge.calls).toHaveLength(0)
    expect(out.perf.judge_calls).toBe(0)
  })
})

describe('chunking', () => {
  it('13 judged sentences go out as 3 chunks of ≤ 6, each sentence exactly once, at most 4 in flight', async () => {
    const lines = plain(13)
    const judge = fake([])
    const sentences = extractSentences(bp(...lines))
    const out = await judgeSentences({ sentences, ledger: ledger(), products, targetProductId: HARBOR }, { judge })
    expect(judge.calls).toHaveLength(3)
    const seen = judge.calls.flatMap(sentIn).sort((a, b) => a - b)
    expect(seen).toEqual(sentences.map((s) => s.i))
    for (const p of judge.calls) expect(sentIn(p).length).toBeLessThanOrEqual(6)
    expect(out.verdicts.size).toBe(13)
    expect(out.perf.chunk_ms).toHaveLength(3)
    const many = fake([])
    await judgeSentences({ sentences: extractSentences(bp(...plain(40))), ledger: ledger(), products, targetProductId: HARBOR }, { judge: many })
    expect(many.calls).toHaveLength(7)
    expect(many.max()).toBeLessThanOrEqual(JUDGE_CONCURRENCY)
    expect(many.max()).toBeGreaterThan(1)
  })
  it("a chunk's prompt carries only relevant in-scope items, plus first-party items for a gated claim", () => {
    const L = ledger()
    const [s] = extractSentences(bp('Harbor Blend tastes like dark chocolate and orange peel.'))
    const items = chunkLedger([{ s: s!, r: ruleRead(s!, L, products, HARBOR) }], L).map((it) => it.id)
    expect(items).toContain('f-notes')
    expect(items).not.toContain('f-night') // another product
    expect(items).not.toContain('w1') // nothing in common
    expect(items).not.toContain('k-garage')
    // A gated/her-own claim carries every first-party item, so her story can back it.
    const [g] = extractSentences(bp('I started in my kitchen years ago.'))
    const gi = chunkLedger([{ s: g!, r: ruleRead(g!, L, products, HARBOR) }], L).map((it) => it.id)
    expect(gi).toEqual(expect.arrayContaining(['k-roast', 'k-garage']))
    expect(gi).not.toContain('w1')
  })
})

describe('cascade', () => {
  it('only the sentences the fast judge marks uncertain go to the strong judge; its verdict wins', async () => {
    const L = ledger()
    const lines = [...plain(5), 'Grind it medium-fine, it works for every brewer.']
    const sentences = extractSentences(bp(...lines))
    const fastJ = fake([[/every brewer/, 'S', ['f-grind'], true]])
    const strong = fake([[/every brewer/, 'E', ['f-grind']]])
    const out = await judgeSentences({ sentences, ledger: L, products, targetProductId: HARBOR }, { judge: fastJ, judgeStrong: strong })
    expect(fastJ.calls).toHaveLength(1)
    expect(strong.calls).toHaveLength(1)
    expect(sentIn(strong.calls[0]!)).toEqual([5])
    expect(out.verdicts.get(5)).toMatchObject({ cls: 'E' })
    expect(out.verdicts.get(0)).toMatchObject({ cls: 'S' })
    expect(out.perf).toMatchObject({ escalations: 1, judge_calls: 2 })
  })
  it('no uncertain sentence → the strong judge is never called', async () => {
    const strong = fake([])
    const out = await judgeSentences({ sentences: extractSentences(bp(...plain(4))), ledger: ledger(), products, targetProductId: HARBOR }, { judge: fake([]), judgeStrong: strong })
    expect(strong.calls).toHaveLength(0)
    expect(out.perf.escalations).toBe(0)
  })
  it('a fast chunk that fails goes to the strong judge whole; without a cascade the failure propagates', async () => {
    const sentences = extractSentences(bp(...plain(3)))
    const strong = fake([])
    const out = await judgeSentences({ sentences, ledger: ledger(), products, targetProductId: HARBOR }, { judge: async () => { throw new Error('rate limited') }, judgeStrong: strong })
    expect(strong.calls).toHaveLength(1)
    expect(out.verdicts.size).toBe(3)
    expect(out.perf.escalations).toBe(3)
    await expect(judgeSentences({ sentences, ledger: ledger(), products, targetProductId: HARBOR }, { judge: async () => { throw new Error('rate limited') } })).rejects.toThrow(/rate limited/)
  })
})

describe('the gate run', () => {
  it('records ms total, per-chunk ms, judge calls and escalations, and emits judging/repairing steps', async () => {
    const steps: GateProgress[] = []
    const lines = [...plain(7), 'It sells out every single week.']
    const r = await runInventionGate({ blueprint: bp(...lines), ledger: ledger(), products, targetProductId: HARBOR }, {
      judge: fake([[/smooth|rich/, 'S', ['f-notes'], true]]),
      judgeStrong: fake([]),
      rewrite: async () => '{"rewrites":[]}',
      onProgress: (p) => steps.push(p),
    })
    const perf = r.record.perf!
    expect(perf.judge_calls).toBeGreaterThanOrEqual(3) // 2 fast chunks + 1 strong
    expect(perf.chunk_ms).toHaveLength(perf.judge_calls)
    expect(perf.escalations).toBe(2)
    expect(perf.prefiltered).toBeGreaterThanOrEqual(1)
    expect(typeof perf.ms_total).toBe('number')
    expect(steps[0]).toMatchObject({ step: 'judging', chunks_done: 0 })
    expect(steps.some((s) => s.step === 'judging' && s.chunks_done === 3 && s.chunks_total === 3)).toBe(true)
    expect(steps.every((s) => typeof s.at === 'string')).toBe(true)
    expect(JSON.stringify(r.blueprint.script)).not.toMatch(/sells out/)
  })
  it('a rewrite round re-judges only the new text (unchanged sentences come from the cache)', async () => {
    const judge = fake([[/vanilla/, 'I']], ['S', ['f-notes']])
    const r = await runInventionGate({ blueprint: bp(...plain(3), 'Harbor Blend tastes like vanilla and caramel.'), ledger: ledger(), products, targetProductId: HARBOR }, {
      judge,
      rewrite: async () => JSON.stringify({ rewrites: [{ index: '3', line: 'Harbor Blend tastes like dark chocolate and orange peel.' }] }),
    })
    expect(judge.calls).toHaveLength(2)
    expect(sentIn(judge.calls[1]!)).toEqual([3])
    expect(r.record.outcome).toBe('final')
  })
})
