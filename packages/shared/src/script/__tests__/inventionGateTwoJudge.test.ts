// TWO JUDGES (owner Reply 13; rules frozen). The fast and the strong judge each
// classify every sentence the rules send on; their classes combine into
// pass / review / block. Fixtures are MADE UP (fictional soap maker, product
// "Moss Bar"); the judges are fakes answering from a table.
import { describe, it, expect } from 'vitest'
import {
  buildLedger, extractSentences, combineVerdict, classifyTwoJudges, runInventionGate, checkStatusFor,
  type GateBlueprint, type GateClass, type GateSentence, type LedgerItem,
} from '../inventionGate.js'

const MOSS = 'prod-moss'
const products = [{ id: MOSS, name: 'Moss Bar' }]
const ledger = (): LedgerItem[] => buildLedger({
  knowledge: [{ id: 'k-cure', kind: 'fact', text: 'I cure every Moss Bar for six weeks on a pine rack' }],
  products: [{ id: MOSS, name: 'Moss Bar', knowledge: [{ id: 'f-size', field: 'size', value: 'Moss Bar is a 4 oz bar' }] }],
  targetProductId: MOSS, now: 0,
})

function fakeJudge(table: Array<[RegExp, GateClass, string[]?]>) {
  const calls: string[] = []
  const fn = async (prompt: string) => {
    calls.push(prompt)
    const block = prompt.split('SENTENCES:')[1] ?? ''
    const rows = [...block.matchAll(/^(\d+)\. \(([a-z_]+)[^)]*\) (.*)$/gm)]
    return JSON.stringify({ sentences: rows.map((m) => {
      const hit = table.find(([re]) => re.test(m[3]!))
      return { i: Number(m[1]), class: hit ? hit[1] : 'S', item_ids: hit ? hit[2] ?? [] : ['k-cure'] }
    }) })
  }
  return Object.assign(fn, { calls })
}
const verdicts = (sentences: GateSentence[], table: Array<[RegExp, GateClass]>) =>
  new Map(sentences.map((s) => {
    const hit = table.find(([re]) => re.test(s.text))
    return [s.i, { i: s.i, cls: hit ? hit[1] : 'S' as GateClass, item_ids: hit ? [] : ['k-cure'], claim_types: [], reason: '' }]
  }))

describe('the combine rule', () => {
  it('both I → block; one I → review; any G → review; else pass', () => {
    expect(combineVerdict('I', 'I')).toBe('block')
    expect(combineVerdict('I', 'S')).toBe('review')
    expect(combineVerdict('S', 'I')).toBe('review')
    expect(combineVerdict('N', 'I')).toBe('review')
    expect(combineVerdict('G', 'S')).toBe('review')
    expect(combineVerdict('S', 'G')).toBe('review')
    expect(combineVerdict('G', 'I')).toBe('review')
    expect(combineVerdict('S', 'S')).toBe('pass')
    expect(combineVerdict('E', 'S')).toBe('pass')
    expect(combineVerdict('N', 'N')).toBe('pass')
  })
  it('a review line is never I (never repaired); a block line is I; rule-decided N stays pass', () => {
    const bp: GateBlueprint = { script: [
      { line: 'It rinses clean in hard water.' },
      { line: 'It foams up thick in cold water.' },
      { line: 'It dries hard in a day on any dish.' },
      { line: 'Follow for more.' },
    ] }
    const sentences = extractSentences(bp)
    const fast = verdicts(sentences, [[/rinses|dries/, 'I']])
    const strong = verdicts(sentences, [[/dries|foams/, 'I']])
    const cs = classifyTwoJudges({ sentences, ledger: ledger(), products, targetProductId: MOSS, fast, strong })
    expect(cs.map((c) => c.verdict)).toEqual(['review', 'review', 'block', 'pass'])
    expect(cs[0]!).toMatchObject({ fast_class: 'I', strong_class: 'S' })
    expect(cs[0]!.class).not.toBe('I')
    expect(cs[1]!.class).not.toBe('I')
    expect(cs[2]!.class).toBe('I')
    expect(cs[3]!).toMatchObject({ class: 'N', fast_class: 'N', strong_class: 'N' })
  })
})

describe('titles / captions inherit their script line', () => {
  it('a caption restating an invented story line takes the line\'s verdict', () => {
    const bp: GateBlueprint = {
      script: [{ line: 'I started Fern & Pine in my aunt\'s kitchen during a long winter.' }],
      captions: ['during a long winter'],
    }
    const sentences = extractSentences(bp)
    const none = verdicts(sentences, [])
    const cs = classifyTwoJudges({ sentences, ledger: ledger(), products, targetProductId: MOSS, fast: none, strong: none })
    const cap = cs.find((c) => c.surface === 'caption')!
    const line = cs.find((c) => c.surface === 'script')!
    expect(line.verdict).toBe('block')
    expect(cap.verdict).toBe(line.verdict)
    expect(cap.reason).toBe('inherited')
  })
})

describe('the run', () => {
  const bp: GateBlueprint = { script: [
    { line: 'It rinses clean in hard water.' },
    { line: 'It foams up thick in cold water.' },
    { line: 'It dries hard in a day on any dish.' },
    { line: 'I cure every Moss Bar for six weeks.' },
  ] }
  it('review lines ship as written; review alone keeps check_status checked', async () => {
    const r = await runInventionGate({ blueprint: bp, ledger: ledger(), products, targetProductId: MOSS }, {
      judge: fakeJudge([[/rinses/, 'I']]),
      judgeStrong: fakeJudge([[/foams/, 'I']]),
      rewrite: async () => '{"rewrites":[]}',
    })
    const out = JSON.stringify(r.blueprint.script)
    expect(out).toMatch(/rinses clean/)
    expect(out).toMatch(/foams/)
    expect(r.record.verdicts).toEqual({ review: 2, block: 0 })
    expect(r.record.review_lines).toEqual([{ i: 0, surface: 'script' }, { i: 1, surface: 'script' }])
    expect(r.record.outcome).toBe('final')
    expect(checkStatusFor(r.record).status).toBe('checked')
    expect(JSON.stringify(r.record)).not.toMatch(/rinses|foams/)
  })
  it('both judges I → the line is repaired (block)', async () => {
    const r = await runInventionGate({ blueprint: bp, ledger: ledger(), products, targetProductId: MOSS }, {
      judge: fakeJudge([[/dries/, 'I']]),
      judgeStrong: fakeJudge([[/dries/, 'I']]),
      rewrite: async () => '{"rewrites":[]}',
    })
    expect(r.record.verdicts).toEqual({ review: 0, block: 1 })
    expect(r.record.sentences[2]).toMatchObject({ verdict: 'block', fast_class: 'I', strong_class: 'I' })
    expect(JSON.stringify(r.blueprint.script)).not.toMatch(/dries/)
  })
  it('measure only: verdicts recorded per sentence, nothing repaired', async () => {
    const r = await runInventionGate({ blueprint: bp, ledger: ledger(), products, targetProductId: MOSS, measureOnly: true }, {
      judge: fakeJudge([[/dries|rinses/, 'I']]),
      judgeStrong: fakeJudge([[/dries/, 'I']]),
      rewrite: async () => { throw new Error('never called') },
    })
    expect(r.blueprint).toBe(bp)
    expect(r.record.outcome).toBe('measure_only')
    expect(r.record.verdicts).toEqual({ review: 1, block: 1 })
    expect(r.record.sentences.map((s) => s.verdict)).toEqual(['review', 'pass', 'block', 'pass'])
  })
  it('one judge failing on a chunk turns its lines into review, not a lost script or a block', async () => {
    const r = await runInventionGate({ blueprint: bp, ledger: ledger(), products, targetProductId: MOSS, measureOnly: true }, {
      judge: fakeJudge([]),
      judgeStrong: async () => { throw new Error('model 503: busy') },
      rewrite: async () => '{}',
    })
    expect(r.record.error).toBeUndefined()
    expect(r.record.perf!.strong_failed).toBe(1)
    expect(r.record.sentences.filter((s) => s.verdict === 'review').length).toBeGreaterThan(0)
    expect(r.record.sentences.some((s) => s.verdict === 'block')).toBe(false)
  })
})
