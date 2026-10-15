// Owner, panel-current-5 (trial): story first, a real outside-item floor, and
// the duration profile chosen from material on file. All fixtures are fictional.
import { describe, expect, it } from 'vitest'
import { gateStories } from '../storyRotation'
import { askedStory, checkStoryInScript, enforceStoryFirst, storyKeyFacts } from '../storyFirst'
import { selectOutside, pickOutsideForWriter, OUTSIDE_MIN_REQUEST_OVERLAP } from '../outsideSelect'
import { chooseDuration, fitProfile, materialCeiling } from '../templates/durationFromMaterial'

const KILN = { id: 'k1', kind: 'experience', text: 'My first kiln load came out with every mug glued to the shelf because I glazed the bottoms.' }
const HANDLES = { id: 'k2', kind: 'experience', text: 'I threw the same mug shape about two hundred times before the handles stopped cracking in the kiln.' }
const NEWSLETTER = { id: 'n1', kind: 'experience', text: 'I asked an AI tool to summarize my own newsletter and it confidently quoted a sentence I never wrote.' }
const CALENDAR = { id: 'n2', kind: 'experience', text: 'I spent a week letting an AI assistant plan my calendar and it double-booked me on the one day I had a dentist appointment.' }
const SKIP = 'Nothing specific, keep it general.'

describe('story first: routing', () => {
  const note = 'the AI that misquoted my own newsletter'
  // What the edge used to pass as the topic: her note + stored brief values + skip answers.
  const padded = [note, SKIP, SKIP, 'Subscribe to the free newsletter, link in bio'].join(' ')

  it('root cause: a padded topic needs two shared words and withholds her named story', () => {
    const g = gateStories([NEWSLETTER, CALENDAR], { topicText: padded, hardLimitsOnly: true })
    expect(g.offTopic.map((x) => x.id)).toContain('n1')
  })

  it('a story her note names is never off topic', () => {
    const g = gateStories([NEWSLETTER, CALENDAR], { topicText: padded, askedText: note, hardLimitsOnly: true })
    expect(g.kept.map((x) => x.id)).toContain('n1')
    expect(g.offTopic.map((x) => x.id)).toContain('n2')
  })

  it('a named story never rests, even when told in her last script', () => {
    const g = gateStories([NEWSLETTER], { topicText: padded, askedText: note, last: new Set(['n1']), hardLimitsOnly: true })
    expect(g.kept.map((x) => x.id)).toEqual(['n1'])
  })

  it('askedStory picks the story her note names, best match first', () => {
    expect(askedStory([HANDLES, KILN], 'my first kiln load')?.id).toBe('k1')
    expect(askedStory([CALENDAR, NEWSLETTER], note)?.id).toBe('n1')
    expect(askedStory([KILN, HANDLES], 'how to price stoneware at a market')).toBeNull()
    expect(askedStory([KILN], '')).toBeNull()
  })
})

describe('story first: verbatim and key facts', () => {
  it('key facts are the content words of the story', () => {
    const f = storyKeyFacts(KILN.text)
    expect(f).toEqual(expect.arrayContaining(['kiln', 'load', 'glued', 'shelf', 'glazed', 'bottom']))
    expect(f).not.toContain('because')
  })

  it('an embellished retelling is replaced by her story, told once', () => {
    const script = [
      { section: 'hook', line: 'Opening a kiln is the scariest part of pottery.' },
      { section: 'build', line: 'My first kiln load fused to the shelf overnight. Every glazed mug was glued to the shelf. Two glazes bubbled like melted wax.' },
      { section: 'close', line: 'Would you have opened that kiln?' },
    ]
    const before = checkStoryInScript(KILN.text, script.map((b) => b.line))
    expect(before.verbatim).toBe(false)
    const r = enforceStoryFirst(script, KILN.text)
    expect(r.record.verbatim_as_written).toBe(false)
    expect(r.record.verbatim).toBe(true)
    expect(r.record.repaired).toBe(true)
    expect(r.record.key_facts_found).toBe(r.record.key_facts_total)
    expect(r.script[1]!.line).toBe(KILN.text)
    expect(r.script[1]!.section).toBe('build')
    expect(r.script[0]!.line).toBe(script[0]!.line)
    expect(r.script.map((b) => b.line).join(' ')).not.toMatch(/melted wax/)
  })

  it('a retelling elsewhere is dropped; the hook is never cut', () => {
    const script = [
      { line: 'My first kiln load stuck to the shelf.' },
      { line: 'Here is what happened.' },
      { line: 'Every mug was glued to the shelf because I glazed the bottoms, and the kiln load was ruined.' },
      { line: 'Glaze the bottom of a mug and the kiln keeps it. Check yours before the next firing.' },
    ]
    const r = enforceStoryFirst(script, KILN.text)
    expect(r.record.verbatim).toBe(true)
    expect(r.script[0]!.line).toBe(script[0]!.line)
    expect(r.script.filter((b) => b.line === KILN.text)).toHaveLength(1)
  })

  it('a script that already tells it verbatim is left alone', () => {
    const script = [{ line: 'This is how my pottery started.' }, { line: KILN.text }, { line: 'What was your first firing like?' }]
    const r = enforceStoryFirst(script, KILN.text)
    expect(r.record).toMatchObject({ verbatim_as_written: true, verbatim: true, repaired: false, dropped_retellings: 0 })
    expect(r.script).toEqual(script)
  })
})

describe('outside filter: a real minimum, zero allowed', () => {
  const NOW = Date.parse('2026-10-15T00:00:00Z')
  const request = ['how to learn the hip hinge at home']
  const niche = ['fitness', 'home strength training for beginners']
  const items = [
    // One generic request word only ("home"): the shape of the invented-line sources.
    { id: 'r1', kind: 'research', text: 'Foldable home rowing machine with a quiet magnetic flywheel', verification: 'sourced' as const, when: '2026-10-10' },
    // Niche words only.
    { id: 'r2', kind: 'research', text: 'Beginner strength training plans for busy parents', verification: 'sourced' as const },
    // Two request words.
    { id: 'a1', kind: 'reddit', text: 'How do I learn the hip hinge without a coach watching?', verification: 'audience' as const },
  ]

  it('old behaviour: niche words make every item relevant', () => {
    const { kept } = selectOutside(items, [...request, ...niche], { now: NOW })
    expect(kept.length).toBe(3)
  })

  it('with the request floor, a single shared word is cut and niche words do not count', () => {
    const { kept, record } = selectOutside(items, [...request, ...niche], { now: NOW, requestTexts: request })
    expect(kept.map((k) => k.id)).toEqual(['a1'])
    expect(record).toMatchObject({ offered: 3, kept: 1, cut_below_min: 2, min_request_overlap: OUTSIDE_MIN_REQUEST_OVERLAP, mode: 'request_floor' })
  })

  it('zero items is a valid result', () => {
    const { kept, record } = selectOutside(items.slice(0, 2), [...request, ...niche], { now: NOW, requestTexts: request })
    expect(kept).toEqual([])
    expect(record.kept).toBe(0)
  })

  it('a one-word request needs that one word; an empty request keeps nothing', () => {
    expect(selectOutside(items, niche, { now: NOW, requestTexts: ['rowing'] }).kept.map((k) => k.id)).toEqual(['r1'])
    expect(selectOutside(items, niche, { now: NOW, requestTexts: [''] }).kept).toEqual([])
  })

  it('pickOutsideForWriter passes the floor through and records counts', () => {
    const r = pickOutsideForWriter(
      { notes: [], trends: [], moments: [], research: [{ name: 'Customer Summit', detail: 'support leaders meet in a fictional city' }], reddit: [] },
      ['how to stop answering the same customer email twice', 'software'],
      { requestTexts: ['how to stop answering the same customer email twice'] },
    )
    expect(r.lists.research).toEqual([])
    expect(r.record).toMatchObject({ offered: 1, kept: 0, cut_below_min: 1 })
  })
})

describe('duration from material', () => {
  it('a thin creator gets an honest Sprint', () => {
    const c = chooseDuration('deep', { stories: 1, facts: 1, answers: 0, product_facts: 0 })
    expect(c.chosen).toBe('sprint')
    expect(c.ceiling).toBe('sprint')
    expect(c.reason).toMatch(/so sprint/)
  })

  it('Standard only when there is enough for the beats', () => {
    expect(chooseDuration('standard', { stories: 1, facts: 1, answers: 1, product_facts: 0 }).chosen).toBe('standard')
    expect(chooseDuration('standard', { stories: 0, facts: 2, answers: 0, product_facts: 0 }).chosen).toBe('sprint')
  })

  it('Deep only for rich material with a story of hers', () => {
    expect(chooseDuration('deep', { stories: 1, facts: 2, answers: 0, product_facts: 2 }).chosen).toBe('deep')
    const noStory = chooseDuration('deep', { stories: 0, facts: 3, answers: 0, product_facts: 3 })
    expect(noStory.chosen).toBe('standard')
    expect(noStory.reason).toMatch(/no story/)
    expect(materialCeiling({ stories: 0, facts: 0, answers: 0, product_facts: 0, note_moment: true }).units).toBe(1)
  })

  it('material never raises the requested profile', () => {
    const c = chooseDuration('sprint', { stories: 3, facts: 6, answers: 2, product_facts: 4 })
    expect(c.chosen).toBe('sprint')
    expect(c.ceiling).toBe('deep')
  })

  it('fitProfile picks the template profile at or below the choice', () => {
    expect(fitProfile(['standard', 'deep'], 'deep')).toBe('deep')
    expect(fitProfile(['sprint', 'standard'], 'deep')).toBe('standard')
    expect(fitProfile(['standard', 'deep'], 'sprint')).toBeNull()
  })
})
