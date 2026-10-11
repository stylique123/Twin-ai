// THE ZERO-INVENTION GATE, STAGE 1. Fixtures are FICTIONAL only (Maya's
// Coffee, FlowDesk). The judge is a fake: it answers from a table, so these
// tests pin the rules, the combiner, the repair planner and the wiring — not
// a model.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildLedger, parseNumbers, extractSentences, ruleRead, classifySentences, parseJudge, buildJudgePrompt,
  planRepairs, applyRepairs, runInventionGate, summarizeGateRecords, eBudget, overBudgetE, subjectProduct,
  INVENTION_JUDGE_TASKS, INVENTION_GATE_TIMEOUT_MS, MAX_ASKS,
  type GateBlueprint, type GateSentence, type LedgerItem, type GateClass, type ClassifiedSentence,
} from '../inventionGate.js'

const HARBOR = 'prod-harbor'
const NIGHT = 'prod-nightowl'
const products = [{ id: HARBOR, name: 'Harbor Blend' }, { id: NIGHT, name: 'Night Owl Espresso' }]
const NOW = Date.parse('2026-10-10T00:00:00Z')

function mayaLedger(extra: { knowledge?: Array<{ id: string; kind: string; text: string }>; harbor?: Array<Record<string, unknown>> } = {}): LedgerItem[] {
  return buildLedger({
    knowledge: [
      { id: 'k-roast', kind: 'fact', text: 'I roast every batch of Harbor Blend myself on Tuesday mornings' },
      { id: 'k-garage', kind: 'experience', text: 'I started roasting in my garage with a popcorn popper' },
      ...(extra.knowledge ?? []),
    ],
    answers: { offer: 'Harbor Blend, link in bio' },
    note: 'a video about how I roast Harbor Blend',
    products: [
      { id: HARBOR, name: 'Harbor Blend', knowledge: [
        { id: 'f-size', field: 'size', value: 'Harbor Blend comes in a two-pound bag' },
        { id: 'f-price', field: 'price', value: '$18 per bag' },
        { id: 'f-notes', field: 'feature', value: 'Harbor Blend tastes like dark chocolate and orange peel' },
        ...(extra.harbor ?? []),
      ] },
      { id: NIGHT, name: 'Night Owl Espresso', knowledge: [
        { id: 'f-night-batch', field: 'process_step', value: 'Night Owl Espresso is roasted in small batches of five pounds' },
      ] },
    ],
    targetProductId: HARBOR,
    offer: 'Harbor Blend two-pound bag, $18, link in bio',
    outside: [
      { id: 'r1', kind: 'audience', text: 'People on coffee forums always ask how to stop bitter coffee' },
      { id: 'w1', kind: 'research', text: 'Most specialty roasters rest beans for a few days after roasting' },
    ],
    now: NOW,
  })
}

/** The fake judge: a table of [pattern, class, item_ids]; everything else is `fallback`. */
function fakeJudge(table: Array<[RegExp, GateClass, string[]?]>, fallback: { cls: GateClass; ids?: string[] } = { cls: 'S', ids: ['k-roast'] }) {
  const calls: string[] = []
  const fn = async (prompt: string) => {
    calls.push(prompt)
    const block = prompt.split('SENTENCES:')[1] ?? ''
    const rows = [...block.matchAll(/^(\d+)\. \([a-z_]+\) (.*)$/gm)]
    return JSON.stringify({ sentences: rows.map((m) => {
      const hit = table.find(([re]) => re.test(m[2]!))
      return hit ? { i: Number(m[1]), class: hit[1], item_ids: hit[2] ?? [] } : { i: Number(m[1]), class: fallback.cls, item_ids: fallback.ids ?? [] }
    }) })
  }
  return Object.assign(fn, { calls })
}

const sent = (text: string, extra: Partial<GateSentence> = {}): GateSentence => ({ i: 0, surface: 'script', at: 1, k: 0, text, ...extra })
const classifyOne = (text: string, judge: Array<[RegExp, GateClass, string[]?]> | null, ledger = mayaLedger(), fallback?: { cls: GateClass; ids?: string[] }) => {
  const s = [sent(text)]
  const v = judge === null ? null : parseJudge(JSON.stringify({ sentences: [{ i: 0, class: (judge.find(([re]) => re.test(text))?.[1]) ?? fallback?.cls ?? 'S', item_ids: (judge.find(([re]) => re.test(text))?.[2]) ?? fallback?.ids ?? ['k-roast'] }] }), 1, new Set(ledger.map((x) => x.id))).verdicts
  return classifySentences({ sentences: s, ledger, products, targetProductId: HARBOR, judge: v })[0]!
}
const script = (...lines: string[]): GateBlueprint => ({
  script: lines.map((line, n) => ({ section: n === 0 ? 'Hook' : n === lines.length - 1 ? 'CTA' : 'Body', line })),
  shot_list: lines.map((line) => ({ shot: 'x', spoken_text: line })),
})

describe('ledger', () => {
  it('items carry id, origin, product scope, field, numbers, first_party, live', () => {
    const l = mayaLedger()
    const size = l.find((x) => x.id === 'f-size')!
    expect(size).toMatchObject({ origin: 'product_fact', product_id: HARBOR, field: 'size', first_party: true, live: false })
    expect(size.numbers).toEqual([{ value: 2, unit: 'weight', field: 'size' }])
    expect(l.find((x) => x.id === 'k-garage')!.origin).toBe('her_story')
    expect(l.find((x) => x.id === 'answer:offer')!.origin).toBe('her_answer')
    expect(l.find((x) => x.id === 'r1')).toMatchObject({ origin: 'audience_question', first_party: false })
    expect(l.find((x) => x.id === 'f-price')!.numbers).toEqual([{ value: 18, unit: 'money', field: 'price' }])
  })
  it('urgency is live only with a future expiry and a source', () => {
    const live = mayaLedger({ harbor: [{ id: 'u1', field: 'urgency', value: 'Only 20 bags of the holiday roast left', expires_at: '2026-10-20T00:00:00Z', source: 'her_answer' }] })
    expect(live.find((x) => x.id === 'u1')).toMatchObject({ origin: 'urgency', live: true })
    const stale = mayaLedger({ harbor: [{ id: 'u1', field: 'urgency', value: 'Only 20 bags left', expires_at: '2026-10-01T00:00:00Z', source: 'her_answer' }] })
    expect(stale.find((x) => x.id === 'u1')!.live).toBe(false)
  })
  it('numbers parse with unit and field', () => {
    expect(parseNumbers('two parts water to one part coffee')).toEqual([{ value: 2, unit: 'ratio', field: 'process_step' }, { value: 1, unit: 'ratio', field: 'process_step' }])
    expect(parseNumbers('a 12oz bag for $18')).toEqual([{ value: 12, unit: 'weight', field: 'size' }, { value: 18, unit: 'money', field: 'price' }])
    expect(parseNumbers('here are three things I learned')).toEqual([])
    expect(parseNumbers('one thing matters')).toEqual([])
  })
})

describe('the firewall test (10C)', () => {
  const invented = script(
    'Here is how I roast Harbor Blend every Tuesday morning.',
    'Last month I spilled a whole batch on the floor and cried.',
    'Every bag is roasted at 450 degrees.',
    'It sells out every single week.',
    'Grab a two-pound bag of Harbor Blend, link in bio.',
  )
  it('an invented experience, number and scarcity are three I — even with a judge that says S to everything', () => {
    const sentences = extractSentences(invented)
    const judge = parseJudge(JSON.stringify({ sentences: sentences.map((s) => ({ i: s.i, class: 'S', item_ids: ['k-roast'] })) }), sentences.length, new Set(mayaLedger().map((x) => x.id))).verdicts
    const cs = classifySentences({ sentences, ledger: mayaLedger(), products, targetProductId: HARBOR, judge })
    const iS = cs.filter((c) => c.class === 'I')
    expect(iS.map((c) => c.reason).sort()).toEqual(['event_unbacked', 'number_unmatched', 'scarcity_not_live'])
  })
  it('and none of them ships', async () => {
    const judge = fakeJudge([[/spilled|450|sells out/, 'I']])
    const r = await runInventionGate({ blueprint: invented, ledger: mayaLedger(), products, targetProductId: HARBOR, model: 'fake' }, { judge, rewrite: async () => '{"rewrites":[]}' })
    // The shot list is re-synced from the repaired script by the edge (wiring test below).
    const shipped = JSON.stringify({ ...r.blueprint, shot_list: undefined })
    expect(shipped).not.toMatch(/spilled|450|sells out/)
    expect(r.record.before.I).toBe(3)
    expect(r.record.after.I).toBe(0)
    expect(['needs_answers', 'final', 'general']).toContain(r.record.outcome)
    expect(r.record.repaired.asked + r.record.repaired.dropped + r.record.repaired.replaced).toBeGreaterThanOrEqual(3)
  })
  it('a clean script passes with zero repairs', async () => {
    const clean = script(
      'I roast every batch of Harbor Blend myself on Tuesday mornings.',
      'It tastes like dark chocolate and orange peel.',
      'It comes in a two-pound bag for $18.',
      'Grab a bag of Harbor Blend, link in bio.',
    )
    const judge = fakeJudge([[/chocolate/, 'S', ['f-notes']], [/two-pound/, 'S', ['f-size', 'f-price']]], { cls: 'S', ids: ['k-roast'] })
    const r = await runInventionGate({ blueprint: clean, ledger: mayaLedger(), products, targetProductId: HARBOR }, { judge, rewrite: async () => { throw new Error('no rewrite expected') } })
    expect(r.record.before.I).toBe(0)
    expect(r.record.repaired).toEqual({ replaced: 0, asked: 0, dropped: 0 })
    expect(r.record.outcome).toBe('final')
    expect(r.blueprint).toBe(clean)
    expect(judge.calls).toHaveLength(1)
  })
})

describe('one fixture per audit pattern', () => {
  it('"people always ask me…" with no first-party item is I; an outside forum item never backs it', () => {
    const c = classifyOne('People always ask me how I keep my coffee from tasting bitter.', [[/./, 'S', ['r1']]])
    expect(c.class).toBe('I')
    expect(c.claim_types).toContain('audience')
  })
  it('…and her own confirmed comment does back it', () => {
    const l = mayaLedger({ knowledge: [{ id: 'k-ask', kind: 'fact', text: 'Viewers ask: how do you keep coffee from tasting bitter?' }] })
    const c = classifyOne('People always ask me how I keep my coffee from tasting bitter.', [[/./, 'S', ['k-ask']]], l)
    expect(c.class).toBe('S')
    expect(c.item_ids).toEqual(['k-ask'])
  })
  it('cross-product: a small-batch claim backed only by another product is I', () => {
    const c = classifyOne('Every bag of Harbor Blend is roasted in small batches.', [[/./, 'S', ['f-night-batch']]])
    expect(c.class).toBe('I')
    expect(c.reason).toBe('cross_product')
  })
  it('"two parts water" against a two-pound bag is I (number to field)', () => {
    const c = classifyOne('Use two parts water for every scoop of Harbor Blend.', [[/./, 'S', ['f-size']]])
    expect(c.class).toBe('I')
    expect(c.reason).toBe('number_unmatched')
    expect(classifyOne('It comes in a two-pound bag.', [[/./, 'S', ['f-size']]]).class).toBe('S')
  })
  it('a number that only another product has is cross_product', () => {
    expect(classifyOne('Harbor Blend is roasted in batches of five pounds.', [[/./, 'S', ['f-night-batch']]]).reason).toBe('cross_product')
  })
  it('a question with a presupposition is checked; a pure question is N', () => {
    const q = classifyOne('Did you know every bag is roasted the same morning it ships?', [[/./, 'N']])
    expect(q.class).toBe('I')
    expect(q.claim_types).toContain('presupposition')
    expect(classifyOne('What do you look for in a bag of coffee?', [[/./, 'I']]).class).toBe('N')
  })
  it('an invented ending (R04 style) is I', () => {
    const c = classifyOne("And that's how Maya's Coffee landed its first wholesale account.", [[/./, 'S', ['k-roast']]])
    expect(c.class).toBe('I')
    expect(c.reason).toBe('event_unbacked')
  })
  it('a fully invented anecdote (R06 style) is I in every sentence', () => {
    const lines = ['Last winter a customer drove two hours just to buy a bag.', 'She told me, "this is the best coffee in the state."', 'Then she ordered ten more for her office.']
    for (const l of lines) expect(classifyOne(l, [[/./, 'S', ['k-roast']]]).class).toBe('I')
  })
  it('a story-on-file account inventing a present-tense event is still I (never gated off by "story on file")', () => {
    const l = mayaLedger({ knowledge: [{ id: 'k-move', kind: 'experience', text: 'I moved to the coast and opened a stall at the Saturday market' }] })
    const c = classifyOne('Every morning a regular walks in and asks for Harbor Blend by name.', [[/./, 'S', ['k-roast']]], l)
    expect(c.class).toBe('I')
    // No "hasStory" switch exists on the gate's input.
    expect(Object.keys(ruleRead(sent('x'), l, products, HARBOR))).not.toContain('hasStory')
  })
  it('the same present-tense event IS backed when her story says it', () => {
    const l = mayaLedger({ knowledge: [{ id: 'k-reg', kind: 'experience', text: 'A regular walks in every morning and asks for it by name' }] })
    expect(classifyOne('Every morning a regular walks in and asks for Harbor Blend by name.', [[/./, 'S', ['k-reg']]], l).class).toBe('S')
  })
  it('scarcity needs a LIVE urgency item for this product', () => {
    expect(classifyOne('Only twenty bags of the holiday roast are left.', [[/./, 'S', ['k-roast']]]).reason).toBe('scarcity_not_live')
    const live = mayaLedger({ harbor: [{ id: 'u1', field: 'urgency', value: 'Only 20 bags of the holiday roast left', expires_at: '2026-10-20T00:00:00Z', source: 'her_answer' }] })
    expect(classifyOne('Only 20 bags of the holiday roast are left.', [[/./, 'S', ['u1']]], live).class).toBe('S')
  })
})

describe('figurative, hyperbole and truisms (owner amendments e, f)', () => {
  it('figurative language with no checkable claim is N, even if the judge says I', () => {
    expect(classifyOne('Harbor Blend is basically a hug in a mug.', [[/./, 'I']]).class).toBe('N')
    expect(classifyOne('This roast is pure comfort on a grey day.', [[/./, 'I']]).class).toBe('N')
  })
  it('hyperbole about her own experience: E when her item backs it, I when nothing does', () => {
    const backed = mayaLedger({ knowledge: [{ id: 'k-shift', kind: 'experience', text: 'This coffee got me through my early mornings at the hospital' }] })
    const e = classifyOne('This coffee literally saved my mornings.', [[/./, 'S', ['k-shift']]], backed)
    expect(e.class).toBe('E')
    expect(e.reason).toBe('hyperbole')
    expect(classifyOne('This coffee literally saved my life.', [[/./, 'S', ['k-roast']]]).class).toBe('I')
  })
  it('non-specific, non-risky truisms are N', () => {
    for (const t of ['Good coffee takes time.', 'Nothing beats a slow morning.', 'Life is too short for bad coffee.']) {
      expect(classifyOne(t, [[/./, 'I']]).class, t).toBe('N')
    }
  })
  it('a specific statement is never waved through as a truism', () => {
    expect(classifyOne('Every bag ships the same day.', [[/./, 'I']]).class).toBe('I')
    expect(classifyOne('Light roasts have more caffeine than dark roasts.', [[/./, 'I']]).class).toBe('I')
  })
})

describe('scope', () => {
  it('a sentence naming another product is about that product', () => {
    expect(subjectProduct('Night Owl Espresso is my late-night pick', products, HARBOR)).toBe(NIGHT)
    expect(subjectProduct('this one is my morning pick', products, HARBOR)).toBe(HARBOR)
  })
  it('an item about another product cannot back this product', () => {
    expect(classifyOne('It tastes like dark chocolate and orange peel.', [[/./, 'S', ['f-night-batch']]]).class).toBe('I')
    expect(classifyOne('It tastes like dark chocolate and orange peel.', [[/./, 'S', ['f-notes']]]).class).toBe('S')
  })
})

describe('judge JSON parsing', () => {
  const ids = new Set(['a', 'b'])
  it('accepts fenced JSON, string indexes and lower-case classes; drops unknown ids', () => {
    const r = parseJudge('```json\n{"sentences":[{"i":"0","class":"s","item_ids":["a","zzz"]},{"i":1,"class":"I","item_ids":[]}]}\n```', 2, ids)
    expect(r.verdicts.get(0)).toMatchObject({ cls: 'S', item_ids: ['a'] })
    expect(r.verdicts.get(1)!.cls).toBe('I')
    expect(r.malformed).toBe(0)
  })
  it('drops out-of-range, duplicate and unknown classes; never throws', () => {
    const r = parseJudge({ sentences: [{ i: 5, class: 'S', item_ids: [] }, { i: 0, class: 'X', item_ids: [] }, { i: 0, class: 'N', item_ids: [] }, { i: 0, class: 'S', item_ids: [] }] }, 2, ids)
    expect(r.verdicts.size).toBe(1)
    expect(r.malformed).toBe(3)
    expect(parseJudge('not json at all', 2, ids)).toEqual({ verdicts: new Map(), malformed: 1 })
    expect(parseJudge(null, 2, ids).verdicts.size).toBe(0)
    expect(parseJudge('noise {"sentences":[{"i":0,"class":"N","item_ids":[]}]} trailing', 1, ids).verdicts.get(0)!.cls).toBe('N')
  })
  it('a sentence the judge skipped is I (judge_missing), never S', () => {
    const s = [sent('It tastes like dark chocolate and orange peel.')]
    const c = classifySentences({ sentences: s, ledger: mayaLedger(), products, targetProductId: HARBOR, judge: new Map() })
    expect(c[0]).toMatchObject({ class: 'I', reason: 'judge_missing' })
  })
  it('one prompt carries all sentences and all items, fenced', () => {
    const bp = script('A.', 'Harbor Blend tastes like dark chocolate.', 'Link in bio.')
    const p = buildJudgePrompt(extractSentences(bp), mayaLedger(), products)
    expect(p).toContain('[f-size]')
    expect(p).toContain('[r1]')
    expect(p).toMatch(/1\. \(script\) Harbor Blend tastes/)
    expect(p).toContain('<<<UNTRUSTED_DATA material')
  })
})

describe('surfaces (owner amendment c)', () => {
  it('covers script, hook options, titles, thumbnail text, captions and publish captions', () => {
    const bp: GateBlueprint = {
      script: [{ line: 'One. Two.' }], hook_options: ['Hook here'], captions: ['On screen'],
      packaging: { titles: ['A title'], thumbnail: { text_overlay: 'Overlay' } }, publish_plan: [{ caption: 'Post caption' }],
    }
    expect(extractSentences(bp).map((s) => s.surface)).toEqual(['script', 'script', 'hook_option', 'title', 'thumbnail_text', 'caption', 'publish_caption'])
  })
  it('an invented customer claim in a title or hook option is dropped there too', async () => {
    const bp: GateBlueprint = {
      ...script('I roast every batch of Harbor Blend myself on Tuesday mornings.', 'It tastes like dark chocolate and orange peel.', 'Grab a bag of Harbor Blend, link in bio.'),
      hook_options: ['I roast every batch myself.', 'My customers say it is the best coffee they ever had.'],
      packaging: { titles: ['Customers rave about this roast', 'How I roast Harbor Blend'] },
    }
    const judge = fakeJudge([[/chocolate/, 'S', ['f-notes']]], { cls: 'S', ids: ['k-roast'] })
    const r = await runInventionGate({ blueprint: bp, ledger: mayaLedger(), products, targetProductId: HARBOR }, { judge, rewrite: async () => '{"rewrites":[]}' })
    expect(r.blueprint.hook_options).toEqual(['I roast every batch myself.'])
    expect((r.blueprint.packaging as { titles: string[] }).titles).toEqual(['How I roast Harbor Blend'])
    expect(r.record.after.I).toBe(0)
  })
})

describe('E budget', () => {
  it('about one E per 150 words', () => {
    expect(eBudget(60)).toBe(1)
    expect(eBudget(300)).toBe(2)
    const cs = [0, 1, 2].map((i) => ({ i, class: 'E' })) as unknown as ClassifiedSentence[]
    expect(overBudgetE(cs, 140)).toEqual([1, 2])
  })
})

describe('repair planning', () => {
  const classified = (over: Partial<ClassifiedSentence>[]): ClassifiedSentence[] => over.map((o, i) => ({ i, surface: 'script', at: i, k: 0, class: 'I', claim_types: [], item_ids: [], reason: 'no_item', near: [], judged: true, ...o }))
  const sentences = (n: number, sections: string[] = []): GateSentence[] => Array.from({ length: n }, (_, i) => ({ i, surface: 'script' as const, at: i, k: 0, text: `Line ${i}.`, section: sections[i] ?? 'Body' }))
  it('replace when an in-scope item is close; ask for a slot the script needs; drop otherwise', () => {
    const steps = planRepairs({
      classified: classified([{ class: 'S' }, { near: ['f-notes'] }, { claim_types: ['event'] }, {}, { class: 'S' }]),
      sentences: sentences(5), spokenBeats: 5,
    })
    expect(steps.map((s) => [s.i, s.action])).toEqual([[1, 'replace'], [2, 'ask'], [3, 'drop']])
    const q = steps[1]!.question!
    expect(q).toMatchObject({ scope: 'script', kind: 'story', writes_to: 'script.beat.2:story' })
    expect(q.text.split(/\s+/).length).toBeLessThanOrEqual(25)
  })
  it('drop keeps the 3-beat floor; past it, ask; past the ask cap, fall back', () => {
    const steps = planRepairs({ classified: classified([{}, {}, {}]), sentences: sentences(3), spokenBeats: 3, finalRound: true, asksSoFar: MAX_ASKS - 1 })
    expect(steps.map((s) => s.action)).toEqual(['ask', 'fallback', 'fallback'])
  })
  it('no replace in the final round (a rewrite there could not be re-checked)', () => {
    const steps = planRepairs({ classified: classified([{ class: 'S' }, { near: ['f-notes'] }, { class: 'S' }, { class: 'S' }]), sentences: sentences(4), spokenBeats: 4, finalRound: true })
    expect(steps[0]!.action).toBe('drop')
  })
  it('every ask text is at most 25 words', () => {
    for (const kind of ['event', 'audience', 'customer', 'result', 'scarcity', 'quote', 'number'] as const) {
      const [st] = planRepairs({ classified: classified([{ claim_types: [kind] }]), sentences: sentences(1, ['Hook']), spokenBeats: 4 })
      expect(st!.question!.text.split(/\s+/).length).toBeLessThanOrEqual(25)
    }
  })
  it('apply: replace, ask placeholder, drop with re-join; other entries untouched', () => {
    const bp = script('Hook line. Second.', 'Body one. Body two.', 'Close.')
    const ss = extractSentences(bp)
    const r = applyRepairs(bp, ss, [
      { i: 1, action: 'replace', item_ids: ['f-notes'] },
      { i: 2, action: 'ask', item_ids: [], question: { scope: 'script', kind: 'story', text: 'What happened?', writes_to: 'script.beat.1:story' } },
      { i: 3, action: 'drop', item_ids: [] },
    ], new Map([[1, 'New second.']]))
    expect((r.bp.script as Array<{ line: string }>).map((b) => b.line)).toEqual(['Hook line. New second.', '[Your answer: What happened?]', 'Close.'])
    expect(r).toMatchObject({ replaced: 1, asked: 1, dropped: 1 })
  })
})

describe('the run: rounds, timeout, record', () => {
  const bp = () => script(
    'I roast every batch of Harbor Blend myself on Tuesday mornings.',
    'It tastes like caramel and cherries.',
    'People always ask me how I make it so smooth.',
    'Grab a bag of Harbor Blend, link in bio.',
  )
  it('replace goes through ONE constrained rewrite call using only listed items, then a re-check', async () => {
    const judge = fakeJudge([[/caramel/, 'I'], [/chocolate/, 'S', ['f-notes']], [/always ask/, 'I']])
    let rewritePrompt = ''
    const r = await runInventionGate({ blueprint: bp(), ledger: mayaLedger(), products, targetProductId: HARBOR }, {
      judge,
      rewrite: async (p) => { rewritePrompt = p; return JSON.stringify({ rewrites: [{ index: '1', line: 'It tastes like dark chocolate and orange peel.' }] }) },
    })
    expect(rewritePrompt).toContain('[f-notes]')
    expect(rewritePrompt).not.toContain('[r1]')
    const lines = (r.blueprint.script as Array<{ line: string }>).map((b) => b.line)
    expect(lines[1]).toBe('It tastes like dark chocolate and orange peel.')
    expect(lines[2]).toMatch(/^\[Your answer: /)
    expect(r.record).toMatchObject({ outcome: 'needs_answers', repaired: { replaced: 1, asked: 1, dropped: 0 }, rounds: 1, timed_out: false })
    expect(r.record.after.I).toBe(0)
    expect(r.questions[0]).toMatchObject({ scope: 'script', kind: 'audience_question' })
    expect(judge.calls).toHaveLength(2)
  })
  it('a rewrite that is still I is not kept', async () => {
    const judge = fakeJudge([[/caramel|cherries|always ask/, 'I']])
    const r = await runInventionGate({ blueprint: bp(), ledger: mayaLedger(), products, targetProductId: HARBOR }, {
      judge, rewrite: async () => JSON.stringify({ rewrites: [{ index: '1', line: 'It tastes like caramel and cherries, really.' }] }),
    })
    expect(JSON.stringify(r.blueprint.script)).not.toMatch(/caramel/)
    expect(r.record.after.I).toBe(0)
  })
  it('a timeout falls back to measure-only, returns the original blueprint and records it', async () => {
    let t = 0
    const original = bp()
    const r = await runInventionGate({ blueprint: original, ledger: mayaLedger(), products, targetProductId: HARBOR, now: () => t, timeoutMs: 100 }, {
      judge: async () => { t = 500; return new Promise<string>(() => {}) },
      rewrite: async () => '{}',
    })
    expect(r.blueprint).toBe(original)
    expect(r.record).toMatchObject({ outcome: 'timeout', timed_out: true })
    expect(r.record.ms).toBe(500)
    expect(INVENTION_GATE_TIMEOUT_MS).toBe(25_000)
  })
  it('measure-only classifies and never repairs', async () => {
    const original = bp()
    const r = await runInventionGate({ blueprint: original, ledger: mayaLedger(), products, targetProductId: HARBOR, measureOnly: true }, { judge: fakeJudge([[/caramel|always ask/, 'I']]), rewrite: async () => { throw new Error('no') } })
    expect(r.blueprint).toBe(original)
    expect(r.record.outcome).toBe('measure_only')
    expect(r.record.before.I).toBe(2)
  })
  it('the record holds ids and reasons only — no text', async () => {
    const r = await runInventionGate({ blueprint: bp(), ledger: mayaLedger(), products, targetProductId: HARBOR }, { judge: fakeJudge([[/caramel|always ask/, 'I']]), rewrite: async () => '{"rewrites":[]}' })
    const json = JSON.stringify(r.record)
    expect(json).not.toMatch(/caramel|Tuesday|smooth|Harbor/)
    expect(Object.keys(r.record.sentences[0]!).sort()).toEqual(['claim_types', 'class', 'i', 'item_ids', 'reason', 'surface'])
  })
  it('two judge models are configured for calibration (owner amendment b)', () => {
    const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
    const routing = JSON.parse(readFileSync(join(REPO, 'worker/model_routing_v1.json'), 'utf8')) as { taskClasses: Record<string, { model: string }> }
    const models = INVENTION_JUDGE_TASKS.map((t) => routing.taskClasses[t]?.model ?? '')
    expect(models).toHaveLength(2)
    expect(models[0]).toMatch(/flash/)
    expect(models[1]).toMatch(/pro/)
  })
})

describe('batch report from records (owner amendment g)', () => {
  it('invented rate on factual sentences before/after, scripts with any I, needs-answers share, outcomes', () => {
    const rec = (before: [number, number, number, number], after: [number, number, number, number], outcome: 'final' | 'needs_answers') => ({
      version: 'v', model: null, sentences: [], rounds: 1, e_flags: [], ms: 100, timed_out: false, outcome,
      repaired: { replaced: 1, asked: outcome === 'needs_answers' ? 1 : 0, dropped: 0 },
      before: { S: before[0], E: before[1], I: before[2], N: before[3] }, after: { S: after[0], E: after[1], I: after[2], N: after[3] },
    })
    const s = summarizeGateRecords([rec([6, 1, 3, 2], [8, 1, 0, 3], 'needs_answers'), rec([9, 1, 0, 2], [9, 1, 0, 2], 'final'), null])
    expect(s.scripts).toBe(2)
    expect(s.invented_rate_before).toBeCloseTo(3 / 20)
    expect(s.invented_rate_after).toBe(0)
    expect(s.scripts_with_i_before).toBe(1)
    expect(s.scripts_with_i_after).toBe(0)
    expect(s.needs_answers_share).toBe(0.5)
    expect(s.outcomes).toEqual({ needs_answers: 1, final: 1 })
  })
})

describe('wiring: the edge calls the gate on the final script under trialOn', () => {
  const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
  const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
  const MIRROR = readFileSync(join(REPO, 'supabase/functions/_shared/inventionGate.ts'), 'utf8')
  it('imports the generated mirror', () => {
    expect(EDGE).toMatch(/from '\.\.\/_shared\/inventionGate\.ts'/)
    expect(MIRROR).toContain('GENERATED FROM packages/shared/src/script/inventionGate.ts')
  })
  it('runs after the late guards, the shadow support check and dropInventedEvents, before the save, behind trialOn', () => {
    const gate = EDGE.indexOf('runInventionGate(')
    expect(gate).toBeGreaterThan(0)
    expect(gate).toBeGreaterThan(EDGE.lastIndexOf('guardrail_report'))
    expect(gate).toBeGreaterThan(EDGE.indexOf('checkSupport({'))
    expect(gate).toBeGreaterThan(EDGE.indexOf('dropInventedEvents(bp.script'))
    expect(gate).toBeGreaterThan(EDGE.indexOf("event: 'blueprint_compliance'"))
    expect(gate).toBeLessThan(EDGE.indexOf("traceBeats('shipped'"))
    const block = EDGE.slice(EDGE.lastIndexOf('// ⚖️ THE ZERO-INVENTION GATE', gate), gate)
    expect(block).toMatch(/if \(trialOn\b/)
    const after = EDGE.slice(gate, gate + 4000)
    expect(after).toContain('invention_gate')
    expect(after).toContain('syncShotListSpokenText(')
    expect(after).toContain('gate_questions')
  })
  it('the shadow support check and dropInventedEvents still run', () => {
    expect(EDGE).toContain('checkSupport({')
    expect(EDGE).toContain('dropInventedEvents(bp.script')
  })
})
