// W3 structure checks (default OFF). Fictional fixtures only: a made-up
// beekeeper ("Hive Notes", a honey jar) and a made-up bike mechanic. No model call.
import { describe, it, expect } from 'vitest'
import {
  structureChecksOn, hookPaysOff, storyBeforeLesson, oneStory, leadsIncludeOffer, noPitchInNonSell,
  reshapeKeepsReferences, pacing, runStructureChecks, STRUCTURE_CHECK_IDS, type MaterialItem,
} from '../structureChecks'

const HIVE: MaterialItem[] = [
  { id: 's-sting', kind: 'story', text: 'My first summer I opened the hive without smoke and got stung eleven times on one hand.' },
  { id: 's-market', kind: 'story', text: 'At the farmers market a child asked why my honey was cloudy and I let her taste the comb.' },
  { id: 's-sting-2', kind: 'story', text: 'That first summer I skipped the smoker, opened the hive and my hand took eleven stings.' },
  { id: 'f-crystal', kind: 'fact', text: 'Raw honey crystallizes because it still has pollen and glucose in it.' },
  { id: 'p-price', kind: 'product_fact', text: 'Wildflower Jar is $14 for a 12 oz jar.' },
  { id: 'offer', kind: 'offer', text: 'Order a Wildflower Jar, link in bio.' },
]
const PRODUCTS = ['Wildflower Jar']
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')

describe('structure checks: switch', () => {
  it('default off; only on/true turn them on', () => {
    expect(structureChecksOn(undefined)).toBe(false)
    expect(structureChecksOn('')).toBe(false)
    expect(structureChecksOn('false')).toBe(false)
    expect(structureChecksOn('1')).toBe(false)
    expect(structureChecksOn('on')).toBe(true)
    expect(structureChecksOn(' TRUE ')).toBe(true)
  })
  it('runs all seven, in order', () => {
    expect(runStructureChecks(['a hook', 'a line']).map((c) => c.id)).toEqual([...STRUCTURE_CHECK_IDS])
  })
})

describe('hook pays off by line 3', () => {
  it('passes when line 2 answers the hook', () => {
    expect(hookPaysOff(['Why does raw honey go cloudy?', 'Raw honey crystallizes because it still has pollen in it.', 'Save this.']).status).toBe('pass')
  })
  it('passes when the story beat lands on line 3', () => {
    const r = hookPaysOff(['The hive mistake that cost me a hand.', 'Beekeeping looks calm on video.', 'My first summer I opened the hive without smoke and got stung eleven times.'])
    expect(r.status).toBe('pass')
    expect(r.line).toBe(2)
  })
  it('fails when lines 2 and 3 wander off the hook', () => {
    const r = hookPaysOff(['Why does raw honey go cloudy?', 'I love early mornings.', 'Markets are busy on Saturdays.', 'Raw honey crystallizes because of pollen.'])
    expect(r).toMatchObject({ status: 'fail', reason: 'no_payoff_by_line_3' })
  })
  it('a lone hook fails', () => {
    expect(hookPaysOff(['Why does raw honey go cloudy?']).reason).toBe('too_short')
  })
})

describe('story before lesson', () => {
  it('passes when the story comes first', () => {
    expect(storyBeforeLesson(['Smoke matters.', 'My first summer I opened the hive without smoke and got stung.', 'Always light the smoker before you open a hive.']).status).toBe('pass')
  })
  it('fails when the lesson is stated before the story', () => {
    const r = storyBeforeLesson(['Smoke matters.', 'Always light the smoker before you open a hive.', 'My first summer I opened the hive without smoke and got stung.'])
    expect(r).toMatchObject({ status: 'fail', reason: 'lesson_first', line: 1 })
  })
  it('n/a without a story or without a lesson', () => {
    expect(storyBeforeLesson(['Hook.', 'Always light the smoker.']).status).toBe('n/a')
    expect(storyBeforeLesson(['Hook.', 'My first summer I got stung.']).status).toBe('n/a')
  })
  it('the hook is never the lesson', () => {
    expect(storyBeforeLesson(['Stop opening hives without smoke.', 'My first summer I opened one without smoke and got stung.']).status).toBe('n/a')
  })
})

describe('one story per script', () => {
  it('passes with one of her stories', () => {
    expect(oneStory(['Hook.', HIVE[0]!.text, 'Light the smoker.'], { material: HIVE }).status).toBe('pass')
  })
  it('a retelling of the same story counts once', () => {
    expect(oneStory(['Hook.', HIVE[0]!.text, HIVE[2]!.text], { material: HIVE }).status).toBe('pass')
  })
  it('fails with two unrelated stories of hers', () => {
    expect(oneStory(['Hook.', HIVE[0]!.text, HIVE[1]!.text], { material: HIVE })).toMatchObject({ status: 'fail', reason: 'stories_2' })
  })
  it('without material: unrelated story lines are two stories', () => {
    expect(oneStory(['Hook.', 'I fixed my first flat with a spoon because I lost the levers.', 'At my first race my chain snapped on the last hill.']).status).toBe('fail')
    expect(oneStory(['Hook.', 'I fixed my first flat with a spoon.', 'The spoon bent but the flat got fixed.']).status).toBe('pass')
  })
})

describe('the leads include the offer', () => {
  const ctx = { goal: 'sell', products: PRODUCTS, offer: HIVE[5]!.text }
  it('passes with her offer line', () => {
    expect(leadsIncludeOffer(['Hook.', 'Order a Wildflower Jar, link in bio.'], ctx).status).toBe('pass')
  })
  it('passes with the product and a price', () => {
    expect(leadsIncludeOffer(['Hook.', 'Wildflower Jar is $14 for a 12 oz jar.'], ctx).status).toBe('pass')
  })
  it('fails when a sell script never states the offer', () => {
    expect(leadsIncludeOffer(['Hook.', 'Raw honey crystallizes.', 'Tell me below.'], ctx)).toMatchObject({ status: 'fail', reason: 'no_offer' })
  })
  it('n/a on a non-sell script', () => {
    expect(leadsIncludeOffer(['Hook.'], { goal: 'educate' }).status).toBe('n/a')
  })
})

describe('no pitch in a non-sell script', () => {
  it('fails when an educate script sells her product', () => {
    expect(noPitchInNonSell(['Why is honey cloudy?', 'Pollen.', 'Grab a Wildflower Jar, link in bio.'], { goal: 'educate', products: PRODUCTS })).toMatchObject({ status: 'fail', reason: 'product_pitch', line: 2 })
  })
  it('naming her product without a buy signal is not a pitch', () => {
    expect(noPitchInNonSell(['Why is honey cloudy?', 'Even my Wildflower Jar goes cloudy in winter.', 'Tell me below.'], { goal: 'educate', products: PRODUCTS }).status).toBe('pass')
  })
  it('a price with an offer CTA is a pitch even without the name', () => {
    expect(noPitchInNonSell(['Hook.', 'Only $14 a jar, order now.'], { goal: 'story', products: PRODUCTS }).status).toBe('fail')
  })
  it('n/a on a sell script or with no goal', () => {
    expect(noPitchInNonSell(['Hook.'], { goal: 'leads' }).status).toBe('n/a')
    expect(noPitchInNonSell(['Hook.'], {}).status).toBe('n/a')
  })
})

describe('reshaping keeps references', () => {
  const before = ['Why is honey cloudy?', HIVE[3]!.text, HIVE[0]!.text, 'Save this.']
  it('a reorder keeps every item', () => {
    expect(reshapeKeepsReferences(before, [before[0]!, before[2]!, before[1]!, before[3]!], HIVE).status).toBe('pass')
  })
  it('a trim that drops her fact loses its reference', () => {
    const r = reshapeKeepsReferences(before, [before[0]!, before[2]!, before[3]!], HIVE)
    expect(r).toMatchObject({ status: 'fail', reason: 'lost_1' })
    expect(r.lost).toEqual(['f-crystal'])
  })
  it('n/a without material', () => {
    expect(reshapeKeepsReferences(before, before, []).status).toBe('n/a')
  })
  it('runStructureChecks reports it only when given the script before the reshape', () => {
    const after = [before[0]!, before[2]!, before[3]!]
    expect(runStructureChecks(after, { material: HIVE }).find((c) => c.id === 'reshape_keeps_refs')!.status).toBe('n/a')
    expect(runStructureChecks(after, { material: HIVE }, before).find((c) => c.id === 'reshape_keeps_refs')!.status).toBe('fail')
  })
})

describe('pacing', () => {
  it('passes a standard script', () => {
    expect(pacing([words(10), words(25), words(25), words(20), words(10)]).status).toBe('pass')
  })
  it('fails a long hook, a long line, a run of long lines, a too-short or too-long script', () => {
    expect(pacing([words(21), words(30), words(30)]).reason).toBe('long_hook')
    expect(pacing([words(10), words(41), words(10)]).reason).toBe('long_line')
    expect(pacing([words(10), words(31), words(31), words(31)]).reason).toBe('long_run')
    expect(pacing([words(10), words(20)]).reason).toBe('too_short')
    expect(pacing([words(10), ...Array.from({ length: 6 }, () => words(28))]).reason).toBe('too_long')
    expect(pacing([]).reason).toBe('empty')
  })
})
