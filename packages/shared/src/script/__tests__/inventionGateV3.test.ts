// Owner Reply 14: script lines are the judged unit, number normalization,
// pure advice → N, unsupported first-person habit → I-HARD. Made-up fixtures only.
import { describe, expect, it } from 'vitest'
import {
  buildLedger, classifyTwoJudges, extractSentences, fragmentNewClaim, linkParents, normalizeNumbers, parseNumbers,
  pendingForJudge, ruleRead, type GateBlueprint, type GateClass, type GateSentence, type JudgeVerdict, type LedgerItem,
} from '../inventionGate'

const JAR = 'prod-jar'
const products = [{ id: JAR, name: 'Glow Jar' }]

function ledger(extra: Array<{ id: string; kind: string; text: string }> = [], price = 'The Glow Jar is $38 for a 12 oz jar'): LedgerItem[] {
  return buildLedger({
    knowledge: [{ id: 'k-wick', kind: 'fact', text: 'I trim the wick before lighting the candle' }, ...extra],
    products: [{ id: JAR, name: 'Glow Jar', knowledge: [{ id: 'f-price', field: 'price', value: price }] }],
    targetProductId: JAR,
    now: 0,
  })
}
const sent = (text: string, surface: GateSentence['surface'] = 'script', i = 0): GateSentence => ({ i, surface, at: 0, k: 0, text })
const read = (text: string, led = ledger()) => ruleRead(sent(text), led, products, JAR)

function verdicts(sentences: readonly GateSentence[], table: Array<[RegExp, GateClass, string[]?]>): Map<number, JudgeVerdict> {
  const m = new Map<number, JudgeVerdict>()
  for (const s of sentences) {
    const hit = table.find(([re]) => re.test(s.text))
    if (hit) m.set(s.i, { i: s.i, cls: hit[1], item_ids: hit[2] ?? [], claim_types: [], reason: '' })
  }
  return m
}

describe('rule 2: number normalization', () => {
  it('spelled, symbol and word forms read the same', () => {
    const v = (t: string) => parseNumbers(t).map((n) => `${n.unit}:${n.value}`)
    expect(v('thirty-eight dollars')).toEqual(['money:38'])
    expect(v('$38')).toEqual(['money:38'])
    expect(v('38 dollars')).toEqual(['money:38'])
    expect(v('38 USD')).toEqual(['money:38'])
    expect(v('a twelve ounce jar')).toEqual(['weight:12'])
    expect(v('12 oz')).toEqual(['weight:12'])
    expect(v('one hundred and twenty grams')).toEqual(['weight:120'])
    expect(normalizeNumbers('between two and three cups')).toBe('between 2 and 3 cups')
    expect(normalizeNumbers('one of my favourites')).toBe('one of my favourites')
  })
  it('"thirty-eight dollars" in the line matches "$38" in the ledger', () => {
    expect(read('The Glow Jar is thirty-eight dollars.').hard).toBeNull()
    expect(read('The Glow Jar comes in a twelve ounce jar.').hard).toBeNull()
  })
  it('"$38" in the line matches "thirty-eight dollars" in the ledger', () => {
    const led = ledger([], 'The Glow Jar costs thirty-eight dollars, twelve ounce jar')
    expect(read('The Glow Jar is $38.', led).hard).toBeNull()
    expect(read('It is a 12 oz jar.', led).hard).toBeNull()
  })
  it('a different number is still unmatched', () => {
    expect(read('The Glow Jar is thirty-nine dollars.').hard?.reason).toBe('number_unmatched')
    expect(read('The Glow Jar is $40.').hard?.reason).toBe('number_unmatched')
  })
})

describe('rule 3: pure advice is N', () => {
  it('an imperative or a takeaway with no fact is N', () => {
    expect(read('Never treat a first draft as finished until you have read it out loud.').soft?.reason).toBe('advice')
    expect(read('The takeaway is: trim the wick before you light it.').soft?.reason).toBe('advice')
    expect(read('Make sure the lid stays on between uses.').soft?.reason).toBe('advice')
  })
  it('advice that states a number, result, risk or reason is not pure advice', () => {
    expect(read('Always wait 48 hours before the first burn.').soft?.reason).not.toBe('advice')
    expect(read('Never burn it longer than four hours because the glass gets hot.').soft?.reason).not.toBe('advice')
    expect(read('Use it daily and you\'ll sleep better.').soft?.reason).not.toBe('advice')
    expect(read('Avoid it during pregnancy.').soft?.reason).not.toBe('advice')
  })
})

describe('rule 4: unsupported first-person habit is I-HARD', () => {
  it('"I always tell it to…" with no first-party item is I-HARD by rule', () => {
    expect(read('I always tell it to keep the answer under a minute.').hard?.reason).toBe('habit_unbacked')
    expect(read('Every time I open a new jar I smell it first.').hard?.reason).toBe('habit_unbacked')
    expect(read('We usually pour on Sunday nights.').hard?.reason).toBe('habit_unbacked')
  })
  it('both judges saying S cannot downgrade it', () => {
    const bp: GateBlueprint = { script: [{ line: 'I always tell it to keep the answer under a minute.' }] }
    const sentences = extractSentences(bp)
    const fast = verdicts(sentences, [[/./, 'S', ['k-wick']]])
    const cs = classifyTwoJudges({ sentences, ledger: ledger(), products, targetProductId: JAR, fast, strong: fast })
    expect(cs[0]!.class).toBe('I')
    expect(cs[0]!.verdict).toBe('block')
  })
  it('a habit her own item backs goes to the judge', () => {
    expect(read('I always trim the wick before lighting the candle.').hard).toBeNull()
  })
})

describe('rule 1: script lines are the judged unit', () => {
  const bp: GateBlueprint = {
    script: [{ line: 'Trim the wick and the Glow Jar burns clean.' }, { line: 'The Glow Jar is $38 for a twelve ounce jar.' }],
    captions: ['burns clean', 'Glow Jar is thirty-eight dollars'],
    hook_options: ['The Glow Jar burns clean when you trim the wick.'],
    packaging: { titles: ['Glow Jar doubled my sales'] },
  }
  it('fragments point at the best-overlap script line', () => {
    const s = extractSentences(bp)
    const byText = (t: string) => s.find((x) => x.text.startsWith(t))!
    expect(byText('burns clean').parent).toBe(0)
    expect(byText('Glow Jar is thirty').parent).toBe(1)
    expect(byText('The Glow Jar burns clean when').parent).toBe(0)
  })
  it('a caption with no claim of its own inherits its script line, and is not judged', () => {
    const s = extractSentences(bp)
    const pend = pendingForJudge(s, ledger(), products, JAR).map((p) => p.s.text)
    expect(pend).not.toContain('burns clean')
    expect(pend).not.toContain('Glow Jar is thirty-eight dollars')
    const judged = verdicts(s, [[/^Trim the wick/, 'I'], [/^The Glow Jar is \$38/, 'S', ['f-price']]])
    const cs = classifyTwoJudges({ sentences: s, ledger: ledger(), products, targetProductId: JAR, fast: judged, strong: judged })
    const cap = cs[s.findIndex((x) => x.text === 'burns clean')]!
    expect(cap.class).toBe(cs[0]!.class)
    expect(cap.verdict).toBe(cs[0]!.verdict)
    expect(cap.reason).toBe('inherited')
    const price = cs[s.findIndex((x) => x.text === 'Glow Jar is thirty-eight dollars')]!
    expect(price.class).toBe('S')
    expect(price.reason).toBe('inherited')
  })
  it('a fragment with a new outcome, number, product or first-person event is judged alone', () => {
    const s = extractSentences(bp)
    const title = s.find((x) => x.surface === 'title')!
    expect(fragmentNewClaim(title, s, products)).toBe('result')
    const withNum = linkParents([sent('Trim the wick first.'), sent('Trim the wick for 3 seconds', 'caption', 1)])
    expect(fragmentNewClaim(withNum[1]!, withNum, products)).toBe('number')
    const withEvent = linkParents([sent('Trim the wick first.'), sent('I burned my hand on the wick', 'caption', 1)])
    expect(fragmentNewClaim(withEvent[1]!, withEvent, products)).toBe('event')
    const cs = classifyTwoJudges({ sentences: s, ledger: ledger(), products, targetProductId: JAR, fast: new Map(), strong: new Map() })
    expect(cs[title.i]!.class).toBe('I')
    expect(cs[title.i]!.reason).not.toBe('inherited')
  })
})
