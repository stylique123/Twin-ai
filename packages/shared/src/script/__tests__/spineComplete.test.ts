// Spine completeness + ending (craft rubric v1 C/F). Fictional material only
// (Maya's Coffee, scripts/ops/fixtures/fictional-panel.json). No model call.
import { describe, it, expect } from 'vitest'
import { completeSpine, reorderEnding, reorderCheck, spineCoverage, isCtaLine, isProblemLine, spineCompleteOn, polishReorderOn, missingProblemQuestion, problemAnswerItem, MISSING_PROBLEM_QUESTION } from '../planner/spineComplete'
import { polishCheck } from '../planner/planBAssembly'
import { polishFactChecks } from '../voice/voiceCard'

const material = [
  { id: 'story:0', text: 'I started roasting in my garage with a secondhand popcorn popper, and the first batch set off the smoke alarm twice.' },
  { id: 'story:2', text: 'A regular told me her beans tasted flat after a week, and when I asked, she was keeping them in the fridge next to the onions.' },
  { id: 'fact:0', text: 'Each bag has the roast date written on the label by hand' },
]
const offer = { id: 'offer:harbor', text: 'Harbor Blend, 12 oz bag, link in bio' }
const beats = (ls: string[]) => ls.map((line, i) => ({ section: i ? 'body' : 'hook', line }))

describe('spine gates are DEFAULT OFF', () => {
  it('only the literal on/true, in the trial, for a test account', () => {
    for (const g of [spineCompleteOn, polishReorderOn]) {
      expect(g(true, true, undefined)).toBe(false)
      expect(g(true, true, '')).toBe(false)
      expect(g(true, true, 'off')).toBe(false)
      expect(g(true, false, 'on')).toBe(false)
      expect(g(false, true, 'on')).toBe(false)
      expect(g(true, true, 'on')).toBe(true)
      expect(g(true, true, 'true')).toBe(true)
    }
  })
})

describe('completeSpine', () => {
  it('places her on-topic problem item verbatim after the hook, and appends her offer CTA', () => {
    const s = beats(['How fresh are your coffee beans, really?', 'Each bag has the roast date written on the label by hand.'])
    const out = completeSpine(s, { material, offer, topic: 'stale coffee beans' })
    expect(out.record.problem_added).toBe('story:2')
    expect(out.script[1]!.line).toBe(material[1]!.text)
    expect(out.script[1]!.source_ids).toEqual(['story:2'])
    expect(out.script[out.script.length - 1]!.line).toBe('Harbor Blend, 12 oz bag, link in bio.')
    expect(s.length).toBe(2) // input untouched
  })
  it('never invents: no on-topic problem item → nothing placed', () => {
    const out = completeSpine(beats(['Light roast is underrated.', 'Grab a bag, link in bio.']), { material: [material[2]!], offer, topic: 'light roast' })
    expect(out.record.problem_added).toBeNull()
    expect(out.script.length).toBe(2)
  })
  it('dedupes extra CTAs (keeps the last) and moves a mid CTA to the end', () => {
    const out = completeSpine(beats(['Why do beans go flat?', 'Tell me in the comments.', 'Your beans go stale when you keep them in the fridge.', 'Grab a bag, link in bio.']), { material, offer })
    expect(out.record.ctas_removed).toBe(1)
    expect(out.script.filter((b) => isCtaLine(String(b.line))).length).toBe(1)
    expect(spineCoverage(out.script.map((b) => String(b.line)), material).oneCtaAtEnd).toBe(true)
  })
  it('every added line is one of her items or her offer, word for word', () => {
    const out = completeSpine(beats(['How fresh are your beans?', 'Use them within a month.']), { material, offer, topic: 'beans' })
    const known = new Set([...material.map((m) => m.text), 'Harbor Blend, 12 oz bag, link in bio.', 'How fresh are your beans?', 'Use them within a month.'])
    for (const b of out.script) expect(known.has(String(b.line))).toBe(true)
  })
})

describe('reorderEnding (POLISH_REORDER)', () => {
  const s = beats([
    'Why do your beans taste flat?',
    'Grab a bag, link in bio.',
    'Here is the thing about storage.',
    'A regular told me her beans tasted flat after a week, and she kept them in the fridge next to the onions.',
    'Keep them in a jar.',
  ])
  it('puts her most specific line right before the CTA and the CTA last; the hook stays', () => {
    const r = reorderEnding(s)
    const ls = r.next.map((b) => String(b.line))
    expect(ls[0]).toBe(s[0]!.line)
    expect(ls[ls.length - 1]).toBe('Grab a bag, link in bio.')
    expect(ls[ls.length - 2]).toMatch(/A regular told me/)
    expect(reorderCheck(s, r.next).ok).toBe(true)
  })
  it('reorderCheck refuses an added line, number or name', () => {
    expect(reorderCheck(s, [...s, { line: 'It is the best coffee.' }]).reason).toBe('new_line')
    const changed = s.map((b, i) => (i === 2 ? { ...b, line: 'Here is the thing about storage, 3 times.' } : b))
    expect(reorderCheck(s, changed).ok).toBe(false)
  })
  it('trims duplicate CTAs only', () => {
    const r = reorderEnding(beats(['Hook line here.', 'Tell me in the comments.', 'My first batch set off the smoke alarm twice.', 'Grab a bag, link in bio.']))
    expect(r.record.trimmed).toBe(1)
    expect(r.next.length).toBe(3)
  })
})

describe('polish checks reject an added claim, number or name (verified)', () => {
  it('polishCheck (Plan B)', () => {
    const o = 'Each bag has the roast date written on the label by hand.'
    expect(polishCheck(o, 'Each bag has the roast date written on the label by hand, 3 days fresh.').reason).toBe('new_number')
    expect(polishCheck(o, 'Each bag has the roast date written on the label by hand by Maria.').reason).toBe('new_name')
    expect(polishCheck(o, 'Each bag has the roast date written on the label by hand, and it is the best coffee guaranteed.').ok).toBe(false)
  })
  it('polishFactChecks (worker polish)', () => {
    const before = ['Each bag has the roast date written on the label by hand.']
    expect(polishFactChecks(before, ['Each bag, 12 of them, has the date.']).reasons).toContain('new_number')
    expect(polishFactChecks(before, ['Each bag has the date, says Maria.']).reasons).toContain('new_name')
    expect(polishFactChecks(before, ['Each bag has the date, guaranteed fresh.']).reasons).toContain('new_claim')
  })
})

describe('heuristics', () => {
  it('problem and CTA lines', () => {
    expect(isProblemLine('A regular told me her beans tasted flat.')).toBe(true)
    expect(isProblemLine('Roasted on Tuesdays.')).toBe(false)
    expect(isCtaLine('FlowDesk: free 14-day trial, link in bio.')).toBe(true)
    expect(isCtaLine('I roast on Tuesdays.')).toBe(false)
  })
})

describe('missing problem: ask her, never invent', () => {
  const noProblem = beats(['How fresh are your coffee beans, really?', 'Each bag has the roast date written on the label by hand.', 'Grab a bag, link in bio.'])
  const thin = [{ id: 'fact:0', text: 'Each bag has the roast date written on the label by hand' }]
  it('asks the product-slot question when her material has no on-topic problem item', () => {
    const q = missingProblemQuestion(noProblem, { material: thin, offer, topic: 'coffee beans' })
    expect(q).toEqual(MISSING_PROBLEM_QUESTION)
    expect(q!.writes_to).toBe('spine.problem')
    const done = completeSpine(noProblem, { material: thin, offer, topic: 'coffee beans' })
    expect(done.record.problem_added).toBeNull()
    expect(done.script.map((b) => b.line)).toEqual(noProblem.map((b) => b.line).filter((l) => l !== undefined))
  })
  it('does not ask when her material already has the problem item, or the script has one', () => {
    expect(missingProblemQuestion(noProblem, { material, offer, topic: 'coffee beans flat' })).toBeNull()
    expect(missingProblemQuestion(beats(['Most people store beans wrong and they go flat.', 'Grab a bag, link in bio.']), { material: thin })).toBeNull()
  })
  it('her answer is used verbatim after the hook, with its answer id, and stops the question', () => {
    const ans = problemAnswerItem('  My buyers never know   how old their beans are. ')!
    expect(ans).toEqual({ id: 'answer:spine.problem', text: 'My buyers never know how old their beans are.' })
    expect(missingProblemQuestion(noProblem, { material: thin, problemAnswer: ans })).toBeNull()
    const done = completeSpine(noProblem, { material: thin, offer, topic: 'coffee beans', problemAnswer: ans })
    expect(done.script[1]).toMatchObject({ section: 'problem', line: ans.text, source_ids: ['answer:spine.problem'], spine_added: true })
    expect(done.record.problem_from_answer).toBe(true)
  })
  it('a skip or empty answer is not her fact', () => {
    for (const a of ['', 'skip', 'n/a', 'idk', undefined, 42]) expect(problemAnswerItem(a)).toBeNull()
  })
})
