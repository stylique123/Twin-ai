// Selftest for the eval pair builder / scoring / cost guard. Fictional data only. No network.
import assert from 'node:assert/strict'
import {
  parseCsv, scriptKey, buildPairs, sampleByGap, pairAccuracy, combineOrders, scorerPairAccuracy,
  costGuard, usd, truthLines, parseRepeatPairs, repeatRecall, loadCraftSet,
  geminiText, callGemini, nullGuard, MIN_MAX_OUT, VERDICT_SCHEMA,
} from './evalLib.mjs'
import { rubricForPrompt, pickShots, parseVerdict } from './evalCraftJudgePairs.mjs'

// CSV with quotes, commas and newlines inside a field.
const rows = parseCsv('a,b\n1,"x, ""y""\nz"\n2,w\n')
assert.deepEqual(rows, [{ a: '1', b: 'x, "y"\nz' }, { a: '2', b: 'w' }])
assert.equal(scriptKey('P5', 'S07'), 'P5-07')
assert.equal(scriptKey('P6', 'P6-18'), 'P6-18')

const mk = (panel, id, craft) => ({ panel, id, craft, lines: [] })
const s = [mk('PX', 'PX-1', 2), mk('PX', 'PX-2', 4), mk('PX', 'PX-3', 4), mk('PY', 'PY-1', 7)]
const pairs = buildPairs(s, { minGap: 1 })
assert.equal(pairs.length, 2) // same panel only; equal craft skipped
assert.ok(pairs.every((p) => p.gap === 2 && p.better === 'B'))
assert.equal(buildPairs(s, { panel: 'PX', minGap: 3 }).length, 0)

// Sampling: deterministic, capped, spreads across gaps.
const many = Array.from({ length: 30 }, (_, i) => ({ gap: (i % 3) + 1 }))
const smp = sampleByGap(many, 6, 3)
assert.equal(smp.length, 6)
assert.deepEqual([1, 2, 3].map((g) => smp.filter((p) => p.gap === g).length), [2, 2, 2])
assert.deepEqual(sampleByGap(many, 6, 3), smp)

// Both orders: right both times = 1, split = 0.5, wrong both = 0.
const p = { a: {}, b: {}, gap: 1, better: 'A' }
assert.equal(combineOrders(p, 'A', 'B').correct, 1)
assert.equal(combineOrders(p, 'A', 'B').consistent, true)
assert.equal(combineOrders(p, 'A', 'A').correct, 0.5) // position bias cancels out
assert.equal(combineOrders(p, 'B', 'A').correct, 0)
assert.equal(combineOrders(p, null, 'B').correct, 0.75)

const acc = pairAccuracy([{ gap: 1, correct: 1 }, { gap: 1, correct: 0 }, { gap: 2, correct: 1 }, { gap: 3, correct: 0.5 }])
assert.equal(acc.gap1, 2.5 / 4)
assert.equal(acc.gap2, 0.75)
assert.equal(acc.byGap[1].acc, 0.5)
const sp = scorerPairAccuracy([{ a: { v: 1 }, b: { v: 2 }, gap: 1, better: 'B' }, { a: { v: 1 }, b: { v: 1 }, gap: 2, better: 'A' }], (x) => x.v)
assert.equal(sp.gap1, 0.75)

// Cost guard refuses the call that would exceed the cap.
const g = costGuard(0.01)
assert.ok(g.allows(0.006)); g.add(0.006)
assert.ok(!g.allows(0.005))
assert.ok(Math.abs(usd('gemini-3.8-flash', 1e6, 0) - 0.75) < 1e-9)
assert.throws(() => usd('nope', 1, 1))

// Prompt hygiene: no P10 text in the rubric, no P10 script in the shots.
assert.equal(rubricForPrompt('keep P8-09\ndrop P10-02 line\nkeep'), 'keep P8-09\nkeep')
const real = loadCraftSet()
const shots = pickShots(real)
assert.equal(shots.length, 6)
assert.ok(shots.every((x) => ['P5', 'P6', 'P7', 'P8'].includes(x.panel)))
assert.ok(shots.some((x) => x.id === 'P8-09') && shots.some((x) => x.id === 'P8-03'))
assert.equal(parseVerdict(' b'), 'B'); assert.equal(parseVerdict('neither'), null)

// Repeat check parsing and scoring.
assert.deepEqual(truthLines('story told three times (lines 1 to 3)'), [1, 2, 3])
assert.deepEqual(truthLines('story in lines 1 and 5'), [1, 5])
assert.deepEqual(truthLines('same story told three times'), [])
assert.deepEqual(parseRepeatPairs('{"repeats":[{"earlier":1,"later":3,"verdict":"pure_repeat"},{"earlier":2,"later":9},{"earlier":1,"later":2,"verdict":"payoff"}]}', 4), [[1, 3]])
assert.equal(parseRepeatPairs('not json', 3), null)
const rr = repeatRecall(['X-1', 'X-2'], ['X-2', 'X-9'])
assert.equal(rr.recall, 0.5); assert.deepEqual(rr.missed, ['X-1']); assert.deepEqual(rr.extra, ['X-9'])

// Verdict parser: JSON or lone letter; prose that merely contains a letter is not a verdict.
assert.equal(parseVerdict('{"winner":"A"}'), 'A')
assert.equal(parseVerdict('```json\n{"winner": "b"}\n```'), 'B')
assert.equal(parseVerdict('A'), 'A'); assert.equal(parseVerdict('B.'), 'B'); assert.equal(parseVerdict('Script B'), 'B')
assert.equal(parseVerdict(''), null); assert.equal(parseVerdict('{"winner":"C"}'), null)
assert.equal(parseVerdict('A is better than B'), null)

// Fake generateContent responses.
const resp = (parts, finishReason = 'STOP', usage = {}) => ({ candidates: [{ content: { role: 'model', parts }, finishReason }], usageMetadata: usage })
assert.equal(geminiText(resp([{ text: '{"winner"' }, { text: ':"A"}' }])), '{"winner":"A"}')
// Thinking-only (budget eaten by thoughts): no answer text -> null verdict, not a guess.
const thinkingOnly = resp([{ text: 'Script A has a stronger hook but B', thought: true }], 'MAX_TOKENS', { thoughtsTokenCount: 16 })
assert.equal(geminiText(thinkingOnly), ''); assert.equal(parseVerdict(geminiText(thinkingOnly)), null)
assert.equal(geminiText({ candidates: [{ finishReason: 'MAX_TOKENS' }] }), '') // no content at all
assert.equal(geminiText(resp([{ text: 'hmm', thought: true }, { text: 'B' }])), 'B')
assert.equal(geminiText({}), '')

// callGemini with a fake fetch: request shape + parsing + billing of thought tokens.
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'fake-key-selftest'
let sent
const fakeFetch = async (_url, init) => { sent = JSON.parse(init.body); return { ok: true, json: async () => resp([{ text: 'x', thought: true }, { text: '{"winner":"B"}' }], 'STOP', { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 40 }) } }
const gr = await callGemini({ model: 'm', system: 's', user: 'u', maxOut: 16, schema: VERDICT_SCHEMA, fetchImpl: fakeFetch })
assert.equal(gr.text, '{"winner":"B"}'); assert.equal(parseVerdict(gr.text), 'B'); assert.equal(gr.outTok, 45); assert.equal(gr.finishReason, 'STOP')
assert.equal(sent.generationConfig.maxOutputTokens, MIN_MAX_OUT) // tiny caps are floored
assert.equal(sent.generationConfig.thinkingConfig, undefined)
assert.equal(sent.generationConfig.responseMimeType, 'application/json'); assert.deepEqual(sent.generationConfig.responseSchema, VERDICT_SCHEMA)

// Null guard: >20% null in the first 6 calls stops; 1/6 does not.
const ng1 = nullGuard(); for (const n of [true, true, false, false, false]) ng1.add(n)
assert.equal(ng1.shouldStop(), false); ng1.add(false); assert.equal(ng1.shouldStop(), true)
const ng2 = nullGuard(); for (const n of [true, false, false, false, false, false, true, true]) ng2.add(n)
assert.equal(ng2.shouldStop(), false)

console.log('evalLib selftest ok')
