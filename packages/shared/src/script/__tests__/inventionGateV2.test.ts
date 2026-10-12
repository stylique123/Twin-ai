// THE ZERO-INVENTION GATE v2 (owner gate tuning on the fictional panel).
// Fixtures are MADE UP (a fictional soap maker "Fern & Pine", product "Moss
// Bar"; a fictional app "TaskPond"). The judge is a fake answering from a
// table, so these pin the rules, not a model.
import { describe, it, expect } from 'vitest'
import {
  buildLedger, extractSentences, classifySentences, ruleRead, runInventionGate, checkStatusFor, decideOutcome,
  countClasses, listCounts, listDelivery, linkParents, buildJudgePrompt, judgeSentences, isSoftGeneral, summarizeGateRecords,
  INVENTION_GATE_VERSION, inheritable, errorClass, pendingForJudge, GateTimeout,
  type GateBlueprint, type GateClass, type GateSentence, type LedgerItem, type InventionGateRecord,
} from '../inventionGate.js'
import { dropInventedEvents, narratesEvent } from '../noStoryEvents.js'

const MOSS = 'prod-moss'
const products = [{ id: MOSS, name: 'Moss Bar' }]

function fernLedger(extra: Array<{ id: string; kind: string; text: string }> = []): LedgerItem[] {
  return buildLedger({
    knowledge: [{ id: 'k-cure', kind: 'fact', text: 'I cure every Moss Bar for six weeks on a pine rack' }, ...extra],
    products: [{ id: MOSS, name: 'Moss Bar', knowledge: [{ id: 'f-size', field: 'size', value: 'Moss Bar is a 4 oz bar' }] }],
    targetProductId: MOSS,
    now: 0,
  })
}

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

const verdicts = (sentences: GateSentence[], table: Array<[RegExp, GateClass, string[]?, string[]?]>) =>
  new Map(sentences.map((s) => {
    const hit = table.find(([re]) => re.test(s.text))
    return [s.i, { i: s.i, cls: hit ? hit[1] : 'S' as GateClass, item_ids: hit ? hit[2] ?? [] : ['k-cure'], claim_types: (hit?.[3] ?? []) as never[], reason: '' }]
  }))

const classify = (bp: GateBlueprint, table: Array<[RegExp, GateClass, string[]?, string[]?]>, ledger = fernLedger()) => {
  const sentences = extractSentences(bp)
  return { sentences, cs: classifySentences({ sentences, ledger, products, targetProductId: MOSS, judge: verdicts(sentences, table) }) }
}

describe('v2 rule 1: I-HARD vs G-SOFT', () => {
  it('unsupported low-risk general knowledge is G, not I', () => {
    const { cs } = classify({ script: [{ line: 'Cold water closes your pores less than people think.' }, { line: 'Cold process soap needs several weeks of air drying before the lye finishes reacting with the oils.' }] },
      [[/lye finishes/, 'I']])
    expect(cs[1]!.class).toBe('G')
    expect(cs[1]!.reason).toBe('general_unsourced')
  })
  it('personal, product, number, result, people, high-risk claims stay I', () => {
    const lines = [
      'I sold every bar at my first fair.',
      'It lasts twice as long as store soap.',
      'This bar clears eczema in a week.',
      'Customers say it changed their skin.',
      'Goat milk soap is safe for newborns.',
    ]
    const { cs } = classify({ script: lines.map((line) => ({ line })) }, [[/./, 'I']])
    for (const c of cs) expect(c.class, lines[c.i]).toBe('I')
  })
  it('a judge-named result or audience type keeps an unsupported claim hard', () => {
    const { cs } = classify({ script: [{ line: 'Switching bars turned a dull routine into real joy.' }] }, [[/./, 'I', [], ['result']]])
    expect(cs[0]!.class).toBe('I')
  })
  it('isSoftGeneral: quantified, comparative and pronoun-subject lines are hard', () => {
    expect(isSoftGeneral('Lye soap needs curing before use.', [], [], MOSS, MOSS, products)).toBe(true)
    expect(isSoftGeneral('Every handmade soap needs curing.', [], [], MOSS, MOSS, products)).toBe(false)
    expect(isSoftGeneral('Bar soap lasts longer than liquid soap.', [], [], MOSS, MOSS, products)).toBe(false)
    expect(isSoftGeneral('It needs curing before use.', [], [], MOSS, MOSS, products)).toBe(false)
    expect(isSoftGeneral('Moss Bar needs curing.', [], [], MOSS, MOSS, products)).toBe(false)
  })
  it('G never blocks: the outcome is final and check status checked', () => {
    const counts = countClasses([{ i: 0, surface: 'script', at: 0, k: 0, class: 'G', claim_types: [], item_ids: [], reason: 'general_unsourced', near: [], judged: true }])
    expect(counts.G).toBe(1)
    expect(decideOutcome([{ i: 0, surface: 'script', at: 0, k: 0, class: 'G', claim_types: [], item_ids: [], reason: 'general_unsourced', near: [], judged: true }], 0, 0)).toBe('final')
    expect(checkStatusFor({ outcome: 'final', timed_out: false }).status).toBe('checked')
  })
  it('a G line is neither repaired nor asked about', async () => {
    const bp: GateBlueprint = { script: [{ section: 'Hook', line: 'I cure every Moss Bar for six weeks.' }, { section: 'Body', line: 'Cold process soap needs several weeks of air drying before the lye finishes reacting with the oils.' }, { section: 'Close', line: 'Grab a Moss Bar, link in bio.' }] }
    const r = await runInventionGate({ blueprint: bp, ledger: fernLedger(), products, targetProductId: MOSS }, {
      judge: fakeJudge([[/lye finishes/, 'I']]), rewrite: async () => '{"rewrites":[]}',
    })
    expect(r.record.version).toBe(INVENTION_GATE_VERSION)
    expect(r.record.before.G).toBe(1)
    expect(r.record.outcome).toBe('final')
    expect(r.questions).toEqual([])
    expect(JSON.stringify(r.blueprint.script)).toMatch(/lye finishes/)
  })
  it('old records without G still summarise', () => {
    const old = { version: 'invention-gate-v1', before: { S: 1, E: 0, I: 1, N: 0 }, after: { S: 1, E: 0, I: 0, N: 0 }, repaired: { replaced: 0, asked: 0, dropped: 1 }, outcome: 'final', ms: 1, timed_out: false } as unknown as InventionGateRecord
    expect(summarizeGateRecords([old]).invented_rate_before).toBe(0.5)
  })
})

describe('v2 rule 2: fragments inherit their script line', () => {
  const bp: GateBlueprint = {
    script: [{ line: 'I started Fern & Pine in my aunt\'s kitchen during a long winter.' }, { line: 'Cold process soap needs several weeks of air drying before the lye finishes reacting with the oils.' }],
    captions: ['in my aunt\'s kitchen', 'during a long winter', 'lye finishes reacting with the oils'],
    packaging: { titles: ['Moss Bar cures for six weeks'] },
  }
  it('captions point at the line they paraphrase', () => {
    const s = extractSentences(bp)
    const caps = s.filter((x) => x.surface === 'caption')
    expect(caps.map((c) => c.parent)).toEqual([0, 0, 1])
  })
  it('a fragment of an invented story is I even though it says no event itself', () => {
    const { cs } = classify(bp, [[/lye finishes/, 'I']])
    const caps = cs.filter((c) => c.surface === 'caption')
    expect(caps[0]!.class).toBe('I')
    expect(caps[1]!.class).toBe('I')
    expect(caps[1]!.reason).toBe('inherited')
    // v4: a no-claim fragment of a non-story line keeps its own N.
    expect(caps[2]!.class).toBe('N')
  })
  it('a fragment that adds a claim is judged alone, and the judge sees the parent line', async () => {
    const bp2: GateBlueprint = { script: [{ line: 'Lye soap needs curing before use.' }], captions: ['lye soap needs curing so it feels milder'] }
    const s = extractSentences(bp2)
    expect(s[1]!.parent).toBe(0)
    const judge = fakeJudge([])
    await judgeSentences({ sentences: s, ledger: fernLedger(), products, targetProductId: MOSS }, { judge })
    expect(judge.calls.join('\n')).toMatch(/paraphrases script line: Lye soap needs curing before use\./)
  })
  it('hook options are alternatives, judged alone', () => {
    const s = linkParents([{ i: 0, surface: 'script', at: 0, k: 0, text: 'Soap is fat plus lye.' }, { i: 1, surface: 'hook_option', at: 0, k: 0, text: 'Soap is fat plus lye.' }])
    expect(s[1]!.parent).toBeUndefined()
  })
  it('a caption without a number does not inherit its line\'s unmatched number', () => {
    const { cs } = classify({ script: [{ line: 'The bar weighs 9 oz and lathers fast.' }], captions: ['lathers fast'] }, [[/lathers fast$/, 'S', ['f-size']]])
    expect(cs[0]!.class).toBe('I')
    expect(cs[1]!.reason).not.toBe('inherited')
  })
})

describe('v2 rule 3: list-count promises are checked against delivery', () => {
  it('reads the promised count', () => {
    expect(listCounts('Two weird things nobody tells you about soap.')).toEqual([2])
    expect(listCounts('3 quick tips for a longer-lasting bar')).toEqual([3])
    expect(listCounts('Moss Bar is a 4 oz bar')).toEqual([])
  })
  const s = (lines: string[]) => extractSentences({ script: lines.map((line) => ({ line })) })
  it('a promise the script delivers is not an unmatched number', () => {
    const sentences = s(['Three things ruin a soap bar.', 'First, standing water.', 'Second, hot showers.', 'Third, no air.', 'Fix all three.'])
    expect(listDelivery(sentences)).toBe(3)
    const r = ruleRead(sentences[0]!, fernLedger(), products, MOSS, { delivered: listDelivery(sentences) })
    expect(r.hard).toBeNull()
    expect(r.claim_types).toContain('list_count')
  })
  it('a promise the script does not deliver is I', () => {
    const sentences = s(['Five things ruin a soap bar.', 'Standing water is one.', 'That is it.'])
    const r = ruleRead(sentences[0]!, fernLedger(), products, MOSS, { delivered: listDelivery(sentences) })
    expect(r.hard?.reason).toBe('list_count_undelivered')
  })
  it('a factual number is still matched digit to field', () => {
    const sentences = s(['Moss Bar is a 6 oz bar.'])
    expect(ruleRead(sentences[0]!, fernLedger(), products, MOSS, { delivered: 0 }).hard?.reason).toBe('number_unmatched')
    expect(ruleRead(s(['Moss Bar is a 4 oz bar.'])[0]!, fernLedger(), products, MOSS).hard).toBeNull()
  })
})

describe('v2 rule 4: no N leakage', () => {
  it('a risky line is never a truism', () => {
    const r = ruleRead({ i: 0, surface: 'script', at: 1, k: 0, text: 'Plain soap calms inflammation.' }, fernLedger(), products, MOSS)
    expect(r.soft).toBeNull()
    expect(r.claim_types).toContain('risk')
  })
  it('a title or caption that states an outcome is a result claim, not N', () => {
    const t = ruleRead({ i: 3, surface: 'title', at: 0, k: 0, text: 'The pricing mistake that built real trust' }, fernLedger(), products, MOSS)
    expect(t.claim_types).toContain('result')
    expect(t.hard?.reason).toBe('gated_no_first_party')
    const c = ruleRead({ i: 4, surface: 'caption', at: 0, k: 0, text: 'Smooth skin protection' }, fernLedger(), products, MOSS)
    expect(c.soft).toBeNull()
  })
  it('a harmless truism is still N', () => {
    const r = ruleRead({ i: 0, surface: 'script', at: 1, k: 0, text: 'Good soap takes time.' }, fernLedger(), products, MOSS)
    expect(r.soft?.cls).toBe('N')
  })
})

describe('v2 rule 5: empty ledger and invented origin stories', () => {
  const origin = 'I built the first version of TaskPond over a winter because my partner and I kept missing deadlines.'
  it('the gate still runs on an empty ledger and an origin story is I-HARD', async () => {
    const bp: GateBlueprint = { script: [{ line: 'Why do small teams miss deadlines?' }, { line: origin }, { line: 'Assign one owner per task.' }], captions: ['over one winter'] }
    const r = await runInventionGate({ blueprint: bp, ledger: [], products: [], targetProductId: null, measureOnly: true }, { judge: fakeJudge([[/./, 'I']]), rewrite: async () => '{}' })
    const byI = new Map(r.record.sentences.map((x) => [x.i, x]))
    expect(byI.get(1)!.class).toBe('I')
    expect(byI.get(1)!.reason).toBe('event_unbacked')
    expect(byI.get(3)!.class).toBe('I')
  })
  it('"we built X to fix this" (a purpose) is not an origin event', () => {
    const r = ruleRead({ i: 0, surface: 'script', at: 1, k: 0, text: 'We built TaskPond to fix this by turning tasks into cards.' }, [], [], null)
    expect(r.claim_types).not.toContain('event')
  })
  it('the writer guard drops a first-person origin story when no story was given', () => {
    expect(narratesEvent(origin)).toBe(true)
    expect(narratesEvent('We built TaskPond to turn every email into a card.')).toBe(false)
    const beats = [{ line: 'Why do small teams miss deadlines?' }, { line: origin }, { line: 'Assign one owner per task.' }, { line: 'Try TaskPond, link in bio.' }]
    const out = dropInventedEvents(beats, { hasStory: false })
    expect(out.dropped).toBe(1)
    expect(JSON.stringify(out.beats)).not.toMatch(/winter/)
  })
})

describe('judge prompt', () => {
  it('names the fragment rule and the list-count rule', () => {
    const p = buildJudgePrompt([{ i: 1, surface: 'caption', at: 0, k: 0, text: 'x', parent: 0 }], [], [], new Map([[0, 'parent line']]))
    expect(p).toMatch(/paraphrases script line: parent line/)
    expect(p).toMatch(/list-count promise/)
  })
})

describe('v3: two judges, failures, one prefilter', () => {
  it('both judges answer every sentence; the strong verdict is the merged one (no escalation)', async () => {
    const bp: GateBlueprint = { script: [{ line: 'It lathers like whipped cream on wet skin every time.' }, { line: 'It smells like cedar and moss after rain.' }] }
    const sentences = extractSentences(bp)
    const fast = fakeJudge([[/lathers/, 'I']])
    const strong = fakeJudge([[/lathers/, 'S', ['k-cure']]])
    const r = await judgeSentences({ sentences, ledger: fernLedger(), products, targetProductId: MOSS }, { judge: fast, judgeStrong: strong })
    expect(r.perf.escalations).toBe(0)
    expect(r.fast.get(0)!.cls).toBe('I')
    expect(r.strong.get(0)!.cls).toBe('S')
    expect(r.verdicts.get(0)!.cls).toBe('S')
    expect(strong.calls.join('\n')).toMatch(/cedar/)
  })
  it('a failed run records an error class and the work it did', async () => {
    const bp: GateBlueprint = { script: [{ line: 'It lathers like whipped cream on wet skin every time.' }] }
    const r = await runInventionGate({ blueprint: bp, ledger: fernLedger(), products, targetProductId: MOSS, measureOnly: true }, {
      judge: async () => { throw new Error('model 429: quota') }, rewrite: async () => '{}',
    })
    expect(r.record.error).toBe('http_429')
    expect(r.record.perf!.judge_calls).toBe(1)
    expect(errorClass(new GateTimeout())).toBe('timeout')
    expect(errorClass(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe('abort')
  })
  it('pendingForJudge is exactly what the judge is sent', async () => {
    const bp: GateBlueprint = {
      script: [{ line: 'Two things ruin a soap bar.' }, { line: 'It lathers like whipped cream on wet skin every time.' }, { line: 'Good soap takes time.' }],
      captions: ['lathers like whipped cream'], packaging: { titles: ['Moss Bar is a 6 oz bar'] },
    }
    const sentences = extractSentences(bp)
    const judge = fakeJudge([])
    const r = await judgeSentences({ sentences, ledger: fernLedger(), products, targetProductId: MOSS }, { judge })
    expect(pendingForJudge(sentences, fernLedger(), products, MOSS).map((x) => x.s.i)).toEqual([...r.verdicts.keys()].sort((a, b) => a - b))
  })
})

describe('v4: degrade per chunk, bounded escalation', () => {
  const lines = Array.from({ length: 14 }, (_, k) => `It lathers like whipped cream number ${['one', 'two', 'three'][k % 3]} on wet skin, batch ${k}x.`)
  it('a strong chunk that fails keeps the fast verdicts; the script is never lost', async () => {
    const sentences = extractSentences({ script: [{ line: 'It lathers like whipped cream on wet skin every time.' }, { line: 'It smells like cedar and moss after rain.' }] })
    const r = await judgeSentences({ sentences, ledger: fernLedger(), products, targetProductId: MOSS }, {
      judge: fakeJudge([[/lathers/, 'I']]), judgeStrong: async () => { throw new Error('model 503: busy') },
    })
    expect(r.verdicts.get(0)!.cls).toBe('I')
    expect(r.verdicts.get(1)!.cls).toBe('S')
    expect(r.perf.errors).toEqual(['http_503'])
  })
  it('a fast chunk that fails with no cascade leaves only its sentences unjudged', async () => {
    const sentences = extractSentences({ script: Array.from({ length: 7 }, (_, k) => ({ line: `It smells like cedar ${"abcdefg"[k]}x after rain on the porch.` })) })
    let calls = 0
    const r = await judgeSentences({ sentences, ledger: fernLedger(), products, targetProductId: MOSS, chunkSize: 6 }, {
      judge: async (p) => { if (calls++ === 0) throw new Error('model 500: x'); return fakeJudge([])(p) },
    })
    expect(r.perf.unjudged).toBeGreaterThan(0)
    expect(r.verdicts.size).toBe(sentences.length - (r.perf.unjudged ?? 0))
  })
  it('no escalation cap any more: the strong judge sees every sentence the fast one sees', async () => {
    const sentences = extractSentences({ script: Array.from({ length: 20 }, (_, k) => ({ line: `It lathers like whipped cream on wet skin, try ${k + 10} times.` })) })
    const strong = fakeJudge([])
    const r = await judgeSentences({ sentences, ledger: fernLedger(), products, targetProductId: MOSS }, { judge: fakeJudge([[/./, 'I']]), judgeStrong: strong })
    expect(r.perf.escalations).toBe(0)
    expect(r.strong.size).toBe(r.fast.size)
    void lines
  })
})

describe('v4: inheritance only in the risk direction', () => {
  const soft = { claim_types: [], hard: null, soft: { cls: 'N' as const, reason: 'truism' as const }, near: [], subject_product: null }
  const hard = { ...soft, soft: null }
  it('S and N never flow down', () => {
    expect(inheritable({ class: 'S', claim_types: [], reason: 'entailed' }, hard)).toBe(false)
    expect(inheritable({ class: 'N', claim_types: [], reason: 'no_claim' }, hard)).toBe(false)
    expect(inheritable({ class: 'I', claim_types: [], reason: 'no_item' }, hard)).toBe(true)
  })
  it('a no-claim fragment keeps N unless its line is an invented story', () => {
    expect(inheritable({ class: 'I', claim_types: ['general'], reason: 'no_item' }, soft)).toBe(false)
    expect(inheritable({ class: 'I', claim_types: ['event'], reason: 'event_unbacked' }, soft)).toBe(true)
  })
  it('a caption of a line the judge called S is judged on its own', () => {
    const bp: GateBlueprint = { script: [{ line: 'I cure every Moss Bar for six weeks on a pine rack.' }], captions: ['every Moss Bar cures six weeks on pine'] }
    const sentences = extractSentences(bp)
    const cs = classifySentences({ sentences, ledger: fernLedger(), products, targetProductId: MOSS, judge: verdicts(sentences, [[/^every Moss/, 'I']]) })
    expect(cs[0]!.class).toBe('S')
    expect(cs[1]!.class).toBe('I')
    expect(cs[1]!.reason).not.toBe('inherited')
  })
})

describe('v4: rule bugs', () => {
  const rr = (text: string, surface: GateSentence['surface'] = 'script') => ruleRead({ i: 0, surface, at: 1, k: 0, text }, fernLedger(), products, MOSS)
  it('a small count in a hypothetical, instruction or question is not a factual number', () => {
    expect(rr('When two people share one inbox, replies collide.').hard).toBeNull()
    expect(rr('Stop letting two people answer the same email.').hard).toBeNull()
    expect(rr('How many times has your team sent two replies?').hard).toBeNull()
  })
  it('factual, personal and product numbers are still matched', () => {
    expect(rr('Two people asked me about it yesterday.').hard).not.toBeNull()
    expect(rr('If you buy Moss Bar, it is a 6 oz bar.').hard?.reason).toBe('number_unmatched')
    expect(rr('Five hundred people bought one.').hard).not.toBeNull()
  })
  it('one shared word is not another product', () => {
    const led = buildLedger({ products: [{ id: MOSS, name: 'Moss Bar', knowledge: [] }, { id: 'p2', name: 'Tide Balm', knowledge: [{ id: 'f2', field: 'feature', value: 'Tide Balm never stings dry hands' }] }], targetProductId: MOSS, now: 0 })
    const r = ruleRead({ i: 0, surface: 'thumbnail_text', at: 0, k: 0, text: 'WHY IT STINGS' }, led, [...products, { id: 'p2', name: 'Tide Balm' }], MOSS)
    expect(r.claim_types).not.toContain('cross_product')
  })
  it('common words of a product name do not make a line about the product', () => {
    const p2 = [{ id: 'calm', name: 'Calm Cream' }]
    expect(isSoftGeneral('Fragrance often irritates skin that is already calm.', [], [], 'calm', 'calm', p2)).toBe(true)
    expect(isSoftGeneral('Calm Cream soothes skin.', [], [], 'calm', 'calm', p2)).toBe(false)
  })
})
