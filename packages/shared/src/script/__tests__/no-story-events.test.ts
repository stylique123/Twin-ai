import { describe, it, expect } from 'vitest'
import { narratesEvent, dropInventedEvents } from '../noStoryEvents'

// Fictional data only: Maya's Coffee, a home roaster.
describe('narratesEvent', () => {
  const yes = [
    'When the county knocked, my stomach sank.',
    'Someone knocked on my side door asking to buy a cold brew.',
    'When an inspector saw my roaster, they checked my labels.',
    'She told me my beans were the best in town.',
    'Yesterday a regular asked for a pound of the Ethiopian.',
    'Last week we sold out of the dark roast.',
    'The health department showed up at my market stand.',
    'I almost quit the first month.',
    'The other day a customer said my latte tasted like caramel.',
  ]
  const no = [
    'You learn by doing.',
    'If an inspector comes, have your permit ready.',
    'I roast every Tuesday.',
    'Have you ever tried a washed Ethiopian?',
    'I believe fresh beans matter more than the grinder.',
    "Maya's Coffee roasts in small batches.",
    'Whenever you buy beans, check the roast date.',
  ]
  for (const s of yes) it(`true: ${s}`, () => expect(narratesEvent(s)).toBe(true))
  for (const s of no) it(`false: ${s}`, () => expect(narratesEvent(s)).toBe(false))
})

describe('dropInventedEvents', () => {
  const beats = () => [
    { line: 'Home roasting is legal in more places than you think.' },
    { line: 'When the city knocked, my heart dropped. Check your local cottage food law.' },
    { line: 'Small batches stay fresher.' },
    { line: 'What would you roast first?' },
  ]
  it('removes an invented event when no story was given', () => {
    const r = dropInventedEvents(beats(), { hasStory: false })
    expect(r.dropped).toBe(1)
    expect(r.beats[1]!.line).toBe('Check your local cottage food law.')
    expect(r.would_stub).toBe(false)
  })
  it('leaves everything when a story was given', () => {
    const r = dropInventedEvents(beats(), { hasStory: true })
    expect(r.dropped).toBe(0)
    expect(r.beats).toEqual(beats())
  })
  it('keeps three spoken beats: would_stub and unchanged', () => {
    const b = [
      { line: 'Roasting at home works.' },
      { line: 'Yesterday a neighbor asked me for a bag.' },
      { line: 'He told me it was the best cup he ever had.' },
    ]
    const r = dropInventedEvents(b, { hasStory: false })
    expect(r.would_stub).toBe(true)
    expect(r.dropped).toBe(0)
    expect(r.beats).toEqual(b)
  })
  it('never empties the hook', () => {
    const b = [
      { line: 'Last week the inspector came to my kitchen.' },
      { line: 'Permits differ by county.' },
      { line: 'Label every bag.' },
      { line: 'Ask your county office.' },
    ]
    const r = dropInventedEvents(b, { hasStory: false })
    expect(r.beats[0]!.line).toBe(b[0]!.line)
    expect(r.dropped).toBe(0)
  })
  it('leaves a script with no events untouched', () => {
    const r = dropInventedEvents([{ line: 'You learn by doing.' }, { line: 'I roast every Tuesday.' }, { line: 'Try it?' }], { hasStory: false })
    expect(r.dropped).toBe(0)
  })
})
