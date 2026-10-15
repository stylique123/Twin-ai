// panel-current-3 craft fixes (2026-10-13). Every fixture is made up.
import { describe, it, expect } from 'vitest'
import { enforceWordBudget, checkWordBand, profileForSeconds, lengthenCandidates, templateIdOf } from '../templates/scriptTemplates.js'
import { dropStockCloser, capQuestions, countQuestions, questionCap } from '../beatCleanup.js'
import { offerClose, offerBody, closeAsk, offerHasPointer, closeDescribesOffer } from '../ctaAllocation.js'
import { gateStories, oneStory, isAskedStory, contentTerms } from '../storyRotation.js'
import { durationBrief } from '../durationContract.js'
import type { LedgerItem } from '../inventionGate.js'

const item = (id: string, origin: LedgerItem['origin'], text: string, extra: Partial<LedgerItem> = {}): LedgerItem => ({
  id, origin, product_id: null, field: null, text, numbers: [], first_party: true, live: false, source_label: 'fixture', ...extra,
})
const beat = (line: string, section = 'build') => ({ line, section })
const fill = (n: number, word = 'kettle') => Array.from({ length: n }, () => word).join(' ') + '.'

describe('(a) word budget: check + repair', () => {
  it('maps seconds to Sprint / Standard / Deep budgets', () => {
    expect(profileForSeconds(30)).toBe('sprint')
    expect(profileForSeconds(60)).toBe('standard')
    expect(profileForSeconds(undefined)).toBe('standard')
    expect(profileForSeconds(90)).toBe('deep')
    expect(checkWordBand([beat(fill(70))], 'sprint').budget).toBe(70)
    expect(checkWordBand([beat(fill(140))], 'standard').budget).toBe(140)
    expect(checkWordBand([beat(fill(210))], 'deep').budget).toBe(210)
  })

  it('lengthens a short Standard script from unused ledger items only, before the close', () => {
    const script = [beat('My teapot shop opened in a tiny garage last spring.', 'hook'), beat(fill(60, 'steep')), beat('Follow for the next pot.', 'close')]
    const ledger = [
      item('k1', 'her_story', 'The first glaze I mixed turned every lid a muddy green and I sold them as seconds.'),
      item('k2', 'her_fact', 'Every pot is fired twice, once bare and once after the glaze goes on.'),
      item('k3', 'her_fact', 'A spout that drips usually has a lip angle that is too shallow for the pour.'),
      item('o1', 'outside_research', 'Researchers found ceramic retains heat longer than steel in a kitchen test.', { first_party: false }),
      item('offer', 'offer', 'Pots from 30 dollars, link in bio.'),
    ]
    const r = enforceWordBudget(script, 'standard', ledger)
    expect(r.record.action).toBe('lengthened')
    expect(r.record.words_after).toBeGreaterThan(r.record.words_before)
    expect(r.record.added).not.toContain('o1')
    expect(r.record.added).not.toContain('offer')
    // Added text is the ledger item's own words; the close stays last.
    expect(r.script.at(-1)!.line).toBe('Follow for the next pot.')
    for (const id of r.record.added) {
      const it = ledger.find((x) => x.id === id)!
      expect(r.script.some((b) => String(b.line).startsWith(it.text.slice(0, 20)))).toBe(true)
    }
  })

  it('never re-adds something the script already says', () => {
    const script = [beat('Every pot is fired twice, once bare and once after the glaze goes on.', 'hook'), beat('Short.')]
    expect(lengthenCandidates(script, [item('k2', 'her_fact', 'Every pot is fired twice, once bare and once after the glaze goes on.')])).toEqual([])
  })

  it('records short_no_material instead of inventing when nothing is left', () => {
    const r = enforceWordBudget([beat('Tiny hook here.', 'hook'), beat('A short body.'), beat('Bye.', 'close')], 'standard', [])
    expect(r.record.action).toBe('short_no_material')
    expect(r.script).toHaveLength(3)
  })

  it('trims an over-budget Sprint script', () => {
    const long = [beat('Hook line here.', 'hook'), beat(`${fill(40)} ${fill(40)} ${fill(40)}`), beat('Close.', 'close')]
    const r = enforceWordBudget(long, 'sprint', [])
    expect(r.record.action).toBe('trimmed')
    expect(r.record.words_after).toBeLessThan(r.record.words_before)
  })
})

describe('(b) the "everything there is to say on it" filler', () => {
  it('is dropped with any intensifier', () => {
    expect(dropStockCloser('That is genuinely everything there is to say on it. Rinse the pot first.')).toBe('Rinse the pot first.')
    expect(dropStockCloser('That is honestly everything there is to say on it. Rinse the pot first.')).toBe('Rinse the pot first.')
    expect(dropStockCloser('That is everything there is to say on it. Rinse the pot first.')).toBe('Rinse the pot first.')
    expect(dropStockCloser('Rinse the pot, and that is truly everything there is to say on it.')).toBe('Rinse the pot.')
  })
  it('is no longer requested by the duration brief', () => {
    const brief = durationBrief({ pickedSeconds: 60 }, 'natural', { availableBeats: 1 })
    expect(brief).not.toMatch(/everything there is to say/i)
  })
})

describe('(c)+(d) the offer close', () => {
  it('does not add "Send me a message" when the offer is a link in bio', () => {
    const line = offerClose('KettleKit', 'Free 7-day trial, link in bio', 'Send me a message if you want it.')
    expect(line).toBe('KettleKit: free 7-day trial, link in bio.')
    expect(line).not.toMatch(/send me a message/i)
  })
  it('adds no second ask when another beat already points to the bio', () => {
    expect(closeAsk('A 20-minute call for 40 dollars', 'Send me a message if you want it.', ['Grab it from the link in my bio.'])).toBe('')
    expect(closeAsk('A 20-minute call for 40 dollars', 'Send me a message if you want it.', ['Nothing here.'])).toBe('Send me a message if you want it.')
    expect(offerHasPointer('link in bio')).toBe(true)
  })
  it('does not echo or lowercase the product name', () => {
    expect(offerBody('KettleKit', 'KettleKit free 7-day trial, link in bio')).toBe('free 7-day trial, link in bio')
    expect(offerClose('KettleKit', 'KettleKit free 7-day trial, link in bio', 'x')).toBe('KettleKit: free 7-day trial, link in bio.')
    expect(offerBody('Brew Bar Call', "Brew Bar Call: a 60-minute call")).toBe('a 60-minute call')
    // A proper noun at the start keeps its casing.
    expect(offerBody('Kit', "Juno's starter set for 20 dollars")).toBe("Juno's starter set for 20 dollars")
    expect(offerBody('Kit', 'A starter set for 20 dollars')).toBe('a starter set for 20 dollars')
  })
  it('still describes the offer', () => {
    const line = offerClose('KettleKit', 'KettleKit free 7-day trial, link in bio', 'x')
    expect(closeDescribesOffer(line, 'KettleKit', 'KettleKit free 7-day trial, link in bio')).toBe(true)
  })
})

describe('(e) question cap', () => {
  it('caps at one per four sentences, at most two (hook + last)', () => {
    expect(questionCap(4)).toBe(1)
    expect(questionCap(8)).toBe(2)
    expect(questionCap(40)).toBe(2)
    const beats = [
      beat('Why does your tea taste flat?', 'hook'),
      beat('Most kettles boil too hot. Ever noticed the bitterness? Let it rest a minute.'),
      beat('Green leaves scorch fast, right? Cooler water keeps them sweet.'),
      beat('Try it tomorrow morning. What will you brew first?', 'close'),
    ]
    expect(countQuestions(beats).questions).toBe(4)
    const r = capQuestions(beats)
    expect(r.questions_after).toBeLessThanOrEqual(2)
    expect(r.beats[0]!.line).toBe('Why does your tea taste flat?')
    expect(r.beats[3]!.line).toMatch(/What will you brew first\?$/)
    expect(r.beats[2]!.line).toBe('Green leaves scorch fast. Cooler water keeps them sweet.')
    expect(r.beats[1]!.line).toBe('Most kettles boil too hot. Let it rest a minute.')
  })
  it('leaves a script within the cap alone', () => {
    const beats = [beat('Why is my tea flat?', 'hook'), beat('Water too hot.'), beat('Cool it.'), beat('Try it.')]
    expect(capQuestions(beats).repaired).toBe(0)
  })
})

describe('(f) the story her request names is used', () => {
  const stories = [
    { id: 's1', kind: 'experience', text: 'I skipped stretching for a year and pulled a calf chasing a tram.' },
    { id: 's2', kind: 'experience', text: 'The first time I tried a kettlebell swing I copied a clip and my wrist ached for days.' },
  ]
  it('passes the topic gate on one distinctive shared word of a short topic', () => {
    const g = gateStories(stories, { topicText: 'my first kettlebell swing went wrong' })
    expect(g.kept.map((s) => s.id)).toContain('s2')
  })
  it('is not rested when this request asks for it, and is chosen over an earlier story', () => {
    const recent = new Map([['s2', 3]])
    const g = gateStories(stories, { topicText: 'my kettlebell swing went wrong', recent })
    expect(g.kept.map((s) => s.id)).toContain('s2')
    const one = oneStory(stories, { recent, topicText: 'my kettlebell swing went wrong' })
    expect(one.kept?.id).toBe('s2')
  })
  it('still rests a story the request does not name', () => {
    const one = oneStory(stories, { recent: new Map([['s1', 3], ['s2', 3]]), topicText: 'brewing loose leaf tea' })
    expect(one.kept).toBeNull()
    expect(isAskedStory(contentTerms(stories[0]!.text), contentTerms('brewing loose leaf tea'))).toBe(false)
  })
})

describe('(g) template id always recorded', () => {
  it("is the template id or 'none'", () => {
    expect(templateIdOf({ id: 'T1' })).toBe('T1')
    expect(templateIdOf(null)).toBe('none')
    expect(templateIdOf({})).toBe('none')
  })
})
