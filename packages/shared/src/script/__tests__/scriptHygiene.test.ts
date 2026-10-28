// Advisor labels, panel 12 redraw (28 Oct): copied outside text, a story told
// twice, raw spoken filler. Fictional fixtures from the labeled package.
import { describe, expect, it } from 'vitest'
import { copiedOutsideLines, dropRepeatedSentences, scriptHygiene, stripSpokenFiller } from '../scriptHygiene'

const research = 'Help Scout: well known for its straightforward shared inbox and knowledge base software tailored to small teams seeking to avoid enterprise complexity.'

describe('copied outside text (S-AE16EF)', () => {
  it('drops the pasted competitor description, keeps her own lines', () => {
    const lines = [
      'We counted our support inbox and forty percent was repeat questions.',
      'Help Scout Well known for its straightforward shared inbox and knowledge base software tailored to small teams seeking to avoid enterprise complexity.',
      'I built the first version of FlowDesk over a winter because my partner and I kept answering the same customer email twice.',
    ]
    expect(copiedOutsideLines(lines, [research], ['I built the first version of FlowDesk over a winter because my partner and I kept answering the same customer email twice.'])).toEqual([1])
  })
  it('keeps a line that matches the reference when it is also her material', () => {
    const hers = 'I built the first version of FlowDesk over a winter because my partner and I kept answering the same customer email twice.'
    expect(copiedOutsideLines([hers], [hers], [hers])).toEqual([])
  })
})

describe('the same story twice (S-64DCB3)', () => {
  it('cuts the repeated sentence from the later line', () => {
    const r = dropRepeatedSentences([
      'A regular told me her coffee beans tasted flat after a week.',
      'To check your beans, read the roast date, smell a handful.',
      'A regular told me her beans tasted flat after a week, and when I asked, she was keeping them in the fridge next to the onions.',
    ])
    expect(r.cut).toBe(1)
    expect(r.lines[2]).toBe('When I asked, she was keeping them in the fridge next to the onions.')
    const twice = dropRepeatedSentences(['I once glazed a Tide Mug all the way down out of stubbornness.', 'That mistake changed our routine.', 'I once glazed a Tide Mug all the way down out of stubbornness. I think a bare clay foot is honest.'])
    expect(twice.cut).toBe(1)
    expect(twice.lines[2]).toBe('I think a bare clay foot is honest.')
  })
})

describe('raw spoken filler (S-43EC68, S-EDE104)', () => {
  it('strips um, no wait and like, keeps the meaning', () => {
    expect(stripSpokenFiller('Our first paying customer, um, she found a bug in like the first hour, no wait, first forty minutes, and I fixed it on a call with her just, like, watching me type.'))
      .toBe('Our first paying customer, she found a bug in like the first forty minutes, and I fixed it on a call with her just watching me type.')
    // Advisor review: a non-parallel correction or one around a figure is left as she said it.
    expect(stripSpokenFiller('My lower back was done for a week, no wait, more like ten days.')).toBe('My lower back was done for a week, no wait, more like ten days.')
    expect(stripSpokenFiller('I paid $50, no wait, $60 for the kiln.')).toBe('I paid $50, no wait, $60 for the kiln.')
    expect(stripSpokenFiller('It took 3 hours, no wait, 4 hours.')).toBe('It took 3 hours, no wait, 4 hours.')
    expect(stripSpokenFiller('So yeah, um, the deadlift thing.')).toBe('The deadlift thing.')
  })
})

describe('all three together', () => {
  it('reports counts and returns clean lines', () => {
    const r = scriptHygiene(['Hook line about the inbox and repeat questions every week.', research, 'So, um, we fixed it.'], { outside: [research], hers: [] })
    expect(r.copied).toBe(1)
    expect(r.filler).toBe(1)
    expect(r.lines.join(' ')).not.toMatch(/Help Scout|\bum\b/)
  })
})

describe('beat by beat (what the edge runs)', async () => {
  const { hygieneBeats } = await import('../scriptHygiene')
  it('drops the copied beat, trims the retold story, strips filler, keeps sections', () => {
    const beats = [
      { section: 'hook', line: 'A regular told me her coffee beans tasted flat after a week.' },
      { section: 'proof', line: research },
      { section: 'story', line: 'A regular told me her beans tasted flat after a week, and when I asked, um, she kept them next to the onions.' },
      { section: 'cta', line: 'Save this.' },
    ]
    const r = hygieneBeats(beats, { outside: [research], hers: [] })
    expect(r.copied).toBe(1)
    expect(r.repeats).toBe(1)
    expect(r.filler).toBe(1)
    expect(r.beats.map((b) => b.section)).toEqual(['hook', 'story', 'cta'])
    expect(r.beats[1]!.line).toBe('When I asked, she kept them next to the onions.')
  })
})

describe('advisor review: the hook and the CTA are never dropped or trimmed', async () => {
  const { hygieneBeats } = await import('../scriptHygiene')
  it('a copied hook stays; a CTA callback to the story stays', () => {
    const beats = [
      { section: 'hook', line: research },
      { section: 'story', line: 'My first kiln load cracked down the middle, every single mug.' },
      { section: 'cta', line: 'My first kiln load cracked down the middle, every single mug, so save this.' },
    ]
    const r = hygieneBeats(beats, { outside: [research], hers: [] })
    expect(r.beats.map((b) => b.section)).toEqual(['hook', 'story', 'cta'])
    expect(r.beats[0]!.line).toBe(research)
    expect(r.beats[2]!.line).toBe(beats[2]!.line)
  })
})

describe('advisor review: one bucket for the whole stack', async () => {
  const { voiceCardBucket, voiceCardOn } = await import('../voice/voiceCard')
  const { loopBucket, writerLoopOn } = await import('../planner/writerLoop')
  it('the 5% on WRITER_LOOP and VOICE_CARD_ENABLED are the same creators', () => {
    const ids = Array.from({ length: 500 }, (_, i) => `creator-${i}`)
    for (const id of ids) expect(voiceCardBucket(id)).toBe(loopBucket(id))
    expect(ids.filter((id) => writerLoopOn('5', false, id))).toEqual(ids.filter((id) => voiceCardOn(false, false, '5', id)))
  })
})
