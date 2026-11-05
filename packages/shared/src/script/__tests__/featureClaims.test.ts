// Advisor labels, panel 12 redraw: S-AFD7DC invents a feature. Fictional fixtures.
import { describe, expect, it } from 'vitest'
import { claimedFeatures, dropUnbackedFeatures } from '../featureClaims'

const facts = 'FlowDesk is a shared inbox that turns each email into a card on a board. You see what needs a reply, who has it, and what is finished.'
const script = [
  { section: 'hook', line: 'We kept answering the exact same customer email twice.' },
  { section: 'story', line: 'FlowDesk started because my partner and I spent one winter tangled in duplicate replies.' },
  { section: 'turn', line: 'Now FlowDesk sorts your shop inbox so replies get drafted, you approve them. And you ship it, instead of two people guessing who has the ticket.' },
  { section: 'method', line: 'Tag every email for a week. Find the top five repeats.' },
  { section: 'cta', line: 'How does your team keep two people from replying to the same ticket?' },
]

describe('an invented product feature (S-AFD7DC)', () => {
  it('only a sentence naming the product claims a feature', () => {
    expect(claimedFeatures('Now FlowDesk sorts your shop inbox so replies get drafted.', 'FlowDesk')).toEqual(['draft', 'sort', 'repl'])
    expect(claimedFeatures('Tag every email for a week.', 'FlowDesk')).toEqual([])
  })
  it('cuts the drafted-replies sentence; keeps backed claims, her method and the rest of the beat', () => {
    const r = dropUnbackedFeatures(script, 'FlowDesk', facts)
    expect(r.cut.sentences).toBe(1)
    expect(r.cut.stems.sort()).toEqual(['draft', 'sort'])
    expect(r.beats[2]!.line).toBe('You ship it, instead of two people guessing who has the ticket.')
    expect(r.beats[3]!.line).toBe(script[3]!.line)
    expect(r.beats[1]!.line).toBe(script[1]!.line)
  })
  it('a feature that is in the facts stays', () => {
    const backedFacts = facts + ' It drafts a reply from your saved answers and sorts by customer.'
    expect(dropUnbackedFeatures(script, 'FlowDesk', backedFacts).cut.sentences).toBe(0)
  })
  it('never cuts below the spoken floor, and does nothing with no product name', () => {
    const two = [{ line: 'FlowDesk drafts every reply for you.' }, { line: 'Try it.' }]
    expect(dropUnbackedFeatures(two, 'FlowDesk', facts).beats).toEqual(two)
    expect(dropUnbackedFeatures(script, '', facts).cut.sentences).toBe(0)
  })
})
