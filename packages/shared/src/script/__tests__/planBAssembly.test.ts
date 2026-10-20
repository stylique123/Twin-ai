// PLAN B ASSEMBLY (owner decision 5; trial only). Fictional fixtures throughout. No model calls.
import { describe, it, expect } from 'vitest'
import {
  assemblePlanB, applyPolish, withinBounds, sourcedLine, allSourced, planBScript, planBRecord, parsePolish,
  planBInputFromLedger, planBEligible, phraseFact, PLAN_B_DEFAULT_CTA, type PlanBInput,
} from '../planner/planBAssembly'
import { polishCheck, factRole, isBareSpec, hookableFact, planBPolishPrompt, CONNECTOR_MAX_WORDS } from '../planner/planBAssembly'
import { buildLedger } from '../inventionGate'
import { DURATION_PROFILES } from '../templates/templateData'

// Fictional: Mira Fenwick, a made-up candle maker.
const STORY = 'I melted my first batch of soy wax on a camping stove in 2019. The wicks drowned twice. On the third try the jar held a clean flame for 40 hours. That jar is still on my shelf.'
const FACTS: PlanBInput['facts'] = [
  { id: 'p1', text: 'Each candle burns for about 40 hours', kind: 'product_fact', field: 'burn_time' },
  { id: 'p2', text: '$24', kind: 'product_fact', field: 'price' },
  { id: 'p3', text: 'The wax is poured by hand in small batches of twelve jars', kind: 'product_fact', field: 'process' },
  { id: 'h1', text: 'I test every scent in my own kitchen before it ships', kind: 'her_fact' },
]
const input = (over: Partial<PlanBInput> = {}): PlanBInput => ({ story: { id: 'k-story', text: STORY }, facts: FACTS, cta: { id: 'offer', text: 'Grab the Fenwick Ember jar from the link' }, profile: 'standard', ...over })

describe('every line sourced', () => {
  it('each line names a supplied source id', () => {
    const r = assemblePlanB(input())
    expect(r.lines.length).toBeGreaterThan(3)
    expect(allSourced(r.lines, r.sources)).toBe(true)
    for (const l of r.lines) expect(r.sources.has(l.source_ids[0])).toBe(true)
    const s = planBScript(r.lines, STORY).script
    expect(planBRecord(s, r.sources, 0)).toEqual({ lines: s.length, sourced: s.length, polished: 0, fell_back: 0 })
  })
  it('exactly one CTA, last; default CTA when no offer', () => {
    const r = assemblePlanB(input({ cta: null }))
    expect(r.lines.filter((l) => l.section === 'cta')).toHaveLength(1)
    expect(r.lines.at(-1)!.source_ids[0]).toBe(PLAN_B_DEFAULT_CTA.id)
  })
  it('no placeholders and no repeated line', () => {
    const r = assemblePlanB(input({ facts: [...FACTS, { id: 'p9', text: '[price TBD]', kind: 'product_fact', field: 'price' }, { ...FACTS[0]!, id: 'p1b' }] }))
    const texts = r.lines.map((l) => l.line)
    expect(texts.some((t) => /\[|TBD/.test(t))).toBe(false)
    expect(new Set(texts.map((t) => t.toLowerCase())).size).toBe(texts.length)
  })
})

describe('verbatim story kept', () => {
  it('hook + story lines are her story word for word', () => {
    const r = assemblePlanB(input({ profile: 'deep' }))
    const told = r.lines.filter((l) => l.section === 'hook' || l.section === 'story').map((l) => l.line).join(' ')
    expect(told).toBe(STORY)
    expect(r.story_verbatim).toBe(true)
    expect(r.lines[0]!.section).toBe('hook')
    expect(r.lines[0]!.source_ids[0]).toBe('k-story')
  })
  it('a short budget trims the story only at a sentence end', () => {
    const r = assemblePlanB(input({ profile: 'sprint' }))
    const told = r.lines.filter((l) => l.section === 'hook' || l.section === 'story').map((l) => l.line).join(' ')
    expect(STORY.startsWith(told)).toBe(true)
    expect(/[.!?]$/.test(told)).toBe(true)
  })
  it('polish never touches the story or hook, and de-dup keeps the story', () => {
    const r = assemblePlanB(input())
    const bad = r.lines.map(() => 'Totally different words here now.')
    const p = applyPolish(r.lines, bad, r.sources)
    expect(p.lines.filter((l) => l.section === 'hook' || l.section === 'story').every((l, i) => l === r.lines[i])).toBe(true)
    const s = planBScript(p.lines, STORY).script.map((b) => b.line).join(' ')
    expect(s.includes(STORY.split('. ').slice(1, 3).join('. '))).toBe(true)
  })
})

describe('bounds fallback', () => {
  const orig = 'The wax is poured by hand in small batches of twelve jars.'
  it('accepts a light reorder', () => {
    expect(withinBounds(orig, 'By hand, the wax is poured in small batches of twelve jars.').ok).toBe(true)
  })
  it('refuses a new noun, a changed number, a dropped word, a length jump', () => {
    expect(withinBounds(orig, 'The organic wax is poured by hand in small batches of twelve jars.').reason).toBe('new_word')
    expect(withinBounds('Each candle burns for about 40 hours.', 'Each candle burns for about 50 hours.').ok).toBe(false)
    expect(withinBounds(orig, 'The wax is poured in small batches of twelve jars.').reason).toBe('lost_word')
    expect(withinBounds(orig, `${orig} Truly, the wax is poured by hand in small batches of twelve jars, always.`).ok).toBe(false)
    expect(withinBounds('I stock it at Halden Market every week.', 'I stock it at the market every week.').ok).toBe(false)
  })
  it('a failing line falls back to its unpolished text; a passing one is marked polished', () => {
    const r = assemblePlanB(input())
    const body = (l: { section: string }) => l.section === 'fact' || l.section === 'method' || l.section === 'reality'
    const cand = r.lines.map((l) => (l.source_ids[0] === 'p3' ? 'By hand, the wax is poured in small batches of twelve jars.'
      : body(l) ? `${l.line.replace(/\.$/, '')} with free shipping worldwide.` : null))
    const p = applyPolish(r.lines, cand, r.sources)
    expect(p.polished).toBe(1)
    expect(p.fell_back).toBe(r.lines.filter(body).length - 1)
    for (const l of p.lines) expect(/shipping/.test(l.line)).toBe(false)
    expect(allSourced(p.lines, r.sources)).toBe(true)
  })
  it('a malformed model answer is no polish', () => {
    expect(parsePolish('not json', 3)).toEqual([null, null, null])
    expect(parsePolish('["a"]', 3)).toEqual([null, null, null])
  })
})

describe('budget honored', () => {
  for (const profile of ['sprint', 'standard', 'deep'] as const) {
    it(`${profile}: words within the profile budget`, () => {
      const many = Array.from({ length: 20 }, (_, i) => ({ id: `f${i}`, text: `Batch number ${i + 1} used a different cotton wick from the supplier`, kind: 'product_fact' as const, field: 'process' }))
      const r = assemblePlanB(input({ profile, facts: many }))
      const words = r.lines.reduce((n, l) => n + l.line.split(/\s+/).length, 0)
      expect(words).toBeLessThanOrEqual(DURATION_PROFILES[profile].words)
      expect(r.facts_skipped).toBeGreaterThan(0)
    })
  }
  it('more facts fit a longer profile', () => {
    expect(assemblePlanB(input({ profile: 'deep', story: null })).facts_used).toBeGreaterThanOrEqual(assemblePlanB(input({ profile: 'sprint', story: null })).facts_used)
  })
})

describe('no unsourced line possible', () => {
  it('sourcedLine throws on an unknown id, empty text or a placeholder', () => {
    const src = new Map([['a', { id: 'a', text: 'x', kind: 'her_fact' as const }]])
    expect(() => sourcedLine(src, 'fact', 'A made up line.', 'nope')).toThrow(/unsourced/)
    expect(() => sourcedLine(src, 'fact', 'A made up line.', '')).toThrow(/unsourced/)
    expect(() => sourcedLine(src, 'fact', '  ', 'a')).toThrow()
    expect(() => sourcedLine(src, 'fact', 'It costs [price].', 'a')).toThrow(/placeholder/)
    expect(Object.isFrozen(sourcedLine(src, 'fact', 'Fine.', 'a'))).toBe(true)
  })
  it('allSourced fails a line without ids', () => {
    const r = assemblePlanB(input())
    expect(allSourced([...r.lines, { source_ids: [] }], r.sources)).toBe(false)
  })
})

describe('ledger input', () => {
  it('builds facts from the target product and her facts, offer as CTA', () => {
    const ledger = buildLedger({
      knowledge: [{ id: 'k1', kind: 'story', text: STORY }, { id: 'k2', kind: 'fact', text: 'I test every scent in my own kitchen' }],
      products: [{ id: 'prod-a', knowledge: [{ id: 'pa1', field: 'price', value: '$24' }] }, { id: 'prod-b', knowledge: [{ id: 'pb1', field: 'price', value: '$90' }] }],
      targetProductId: 'prod-a', offer: 'Get the Ember jar from my shop', now: 0,
    })
    const inp = planBInputFromLedger(ledger, { id: 'k1', text: STORY }, 'prod-a', 'standard')
    expect(inp.facts.map((f) => f.id)).toEqual(['pa1', 'k2'])
    expect(inp.cta?.id).toBe('offer')
    expect(planBEligible(inp)).toBe(true)
    expect(planBEligible({ story: null, facts: [] })).toBe(false)
    expect(phraseFact('$24', 'price')).toBe('It costs $24.')
  })
})

// ── PLAN v5.4 §20: per-template sections, polish check, onboarding answers ──

describe('template sections', () => {
  it('hook from her story, then story, method, one reality check, one CTA from her offer', () => {
    const r = assemblePlanB(input({ facts: [...FACTS, { id: 'p4', text: 'A Halden Market shopper wrote that the jar lasted six weeks', kind: 'product_fact', field: 'testimonial' }, { id: 'p5', text: 'Over 300 five star reviews on the shop page', kind: 'product_fact', field: 'review' }] }))
    const order = r.lines.map((l) => l.section)
    expect(order[0]).toBe('hook')
    expect(order[1]).toBe('story')
    expect(order).toContain('method')
    expect(r.sections.reality).toBe(1)
    expect(r.sections.cta).toBe(1)
    expect(order.indexOf('method')).toBeLessThan(order.indexOf('reality'))
    expect(r.lines.at(-1)!.source_ids[0]).toBe('offer')
    expect(allSourced(r.lines, r.sources)).toBe(true)
  })
  it('no reality check without a sourced item', () => {
    expect(assemblePlanB(input()).sections.reality).toBe(0)
  })
  it('no story: the hook is a specific real fact, never a bare spec', () => {
    const r = assemblePlanB(input({ story: null }))
    expect(r.lines[0]!.section).toBe('hook')
    expect(r.lines[0]!.source_ids[0]).not.toBe('p2')
    expect(isBareSpec({ text: '$24', field: 'price' })).toBe(true)
    expect(isBareSpec({ text: '8 oz jar', field: null })).toBe(true)
    expect(isBareSpec({ text: 'I test every scent in my own kitchen before it ships', field: null })).toBe(false)
  })
  it('only bare specs and no story: Plan B is not eligible', () => {
    expect(planBEligible({ story: null, facts: [{ id: 'p2', text: '$24', kind: 'product_fact', field: 'price' }, { id: 'p6', text: '12 jars', kind: 'product_fact', field: 'count' }] })).toBe(false)
  })
  it('roles: process and her own-method answer are method; testimonial is reality', () => {
    expect(factRole({ id: 'a', text: 'x', kind: 'product_fact', field: 'process' })).toBe('method')
    expect(factRole({ id: 'a', text: 'x', kind: 'her_fact', field: 'framework' })).toBe('method')
    expect(factRole({ id: 'a', text: 'x', kind: 'product_fact', field: 'testimonial' })).toBe('reality')
    expect(factRole({ id: 'a', text: 'x', kind: 'her_fact', field: 'testimonial' })).toBe('fact')
    expect(hookableFact({ id: 'a', text: 'I make candles for tired night-shift nurses', kind: 'her_fact', field: 'niche' })).toBe(false)
  })
})

describe('onboarding answers are first-party items', () => {
  it('the asked rows and request answers reach the pool; an answered story slot is her story', () => {
    const ledger = buildLedger({
      knowledge: [{ id: 'k-own', kind: 'framework', text: 'I cure every batch for two weeks before I pour it into jars' }],
      answers: { story: 'My first candle cracked in the cold. I learned to warm the jar first.', niche: 'Slow home rituals', product_slot: 'The Ember jar is my bestseller among regulars' },
      products: [{ id: 'prod-a', knowledge: [] }], targetProductId: 'prod-a', offer: 'Get the Ember jar from my shop', now: 0,
    })
    const inp = planBInputFromLedger(ledger, null, 'prod-a', 'standard')
    expect(inp.story?.id).toBe('answer:story')
    const ids = inp.facts.map((f) => f.id)
    expect(ids).toContain('k-own')
    expect(ids).toContain('answer:product_slot')
    expect(ids).toContain('answer:niche')
    const r = assemblePlanB(inp)
    expect(r.lines[0]!.source_ids[0]).toBe('answer:story')
    expect(r.lines.some((l) => l.section === 'method' && l.source_ids[0] === 'k-own')).toBe(true)
    expect(r.lines.some((l) => l.source_ids[0] === 'answer:niche')).toBe(false)
  })
  it('a skipped answer is not an item', () => {
    const ledger = buildLedger({ answers: { story: 'Nothing specific, keep it general.' }, now: 0 })
    expect(planBInputFromLedger(ledger, null, null, 'standard').story).toBeNull()
  })
})

describe('polish check', () => {
  const orig = 'Each candle burns for about 40 hours at Halden Market.'
  it('accepts a reword and a short connector', () => {
    expect(polishCheck(orig, 'At Halden Market, each candle burns for about 40 hours.').ok).toBe(true)
    const c = polishCheck(orig, 'Here is the part I love, each candle burns for about 40 hours at Halden Market.')
    expect(c.ok).toBe(true)
    expect(c.connector).toBe(true)
  })
  it('rejects a dropped number', () => {
    expect(polishCheck(orig, 'Each candle burns for many hours at Halden Market.').reason).toBe('lost_number')
  })
  it('rejects a new number', () => {
    expect(polishCheck(orig, 'Each candle burns for about 40 hours at Halden Market, 3 wicks.').reason).toBe('new_number')
    expect(polishCheck(orig, 'So, 2 things: each candle burns for about 40 hours at Halden Market.').ok).toBe(false)
  })
  it('rejects a dropped name', () => {
    expect(polishCheck(orig, 'Each candle burns for about 40 hours at the market.').reason).toBe('lost_name')
  })
  it('rejects a new proper noun', () => {
    expect(polishCheck(orig, 'Each candle burns for about 40 hours at Halden Market in Portland.').reason).toBe('new_name')
  })
  it('rejects a new claim, even inside a connector', () => {
    expect(polishCheck(orig, 'Honestly the best candle ever, each candle burns for about 40 hours at Halden Market.').ok).toBe(false)
    expect(polishCheck(orig, 'Each candle burns for about 40 hours at Halden Market. It is totally non-toxic.').ok).toBe(false)
    expect(polishCheck('The wax is poured by hand.', 'The wax is poured by hand with free shipping.').ok).toBe(false)
  })
  it(`rejects a connector over ${CONNECTOR_MAX_WORDS} words`, () => {
    expect(polishCheck(orig, 'So here is the thing that I really want you to know about this right now, each candle burns for about 40 hours at Halden Market.').ok).toBe(false)
  })
  it('on rejection applyPolish keeps the unpolished line', () => {
    const r = assemblePlanB(input())
    const cand = r.lines.map((l) => (l.section === 'hook' || l.section === 'story' || l.section === 'cta' ? null : `${l.line.replace(/\.$/, '')} at Kestrel Mall.`))
    const p = applyPolish(r.lines, cand, r.sources)
    expect(p.polished).toBe(0)
    expect(p.lines.map((l) => l.line)).toEqual(r.lines.map((l) => l.line))
  })
  it('the polish prompt carries her voice card and style note', () => {
    const r = assemblePlanB(input())
    const pr = planBPolishPrompt(r.lines, { card: 'Short sentences. Warm, dry.', styleNote: 'No exclamation marks.' })
    expect(pr).toContain('Short sentences. Warm, dry.')
    expect(pr).toContain('No exclamation marks.')
    expect(pr).toContain(`at most ${CONNECTOR_MAX_WORDS} words`)
  })
})
