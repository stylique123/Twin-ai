import { describe, it, expect } from 'vitest'
import { unpickedNames, enforceScriptRules, isFollowAsk } from '../scriptRules'
import { nicheBucket } from '../../nicheQuestions'
import { isPrivate } from '../privacyGuard'

describe('audit 2026-09-30: the rules the prompt only advised', () => {
  const lib = ['Single-Origin Limited Release', 'Signature Blend Beans', 'Sunflower Coffee Roasters']

  it('an Idea script with nothing picked may not name her brand or a product', () => {
    const unpicked = unpickedNames(lib, [], 'how do I start a coffee cart')
    const r = enforceScriptRules([
      { line: 'I get this question while brewing Sunflower Coffee Roasters Colombia washed beans. There is no clean formula.' },
    ], { unpicked, followAllowed: false })
    expect(r.beats[0].line).toBe('There is no clean formula.')
    expect(r.removed[0].reason).toBe('unpicked_product')
  })

  it('the picked product, and a name she wrote herself, stay sayable', () => {
    expect(unpickedNames(lib, ['Signature Blend Beans'], '')).not.toContain('Signature Blend Beans')
    expect(unpickedNames(lib, [], 'a video about Sunflower Coffee Roasters')).not.toContain('Sunflower Coffee Roasters')
  })

  it('a follow ask is cut unless she chose follow', () => {
    expect(isFollowAsk('Follow for Part 2.')).toBe(true)
    expect(isFollowAsk('Follow for genuine entrepreneur content.')).toBe(true)
    expect(isFollowAsk('What would you do first?')).toBe(false)
    const cut = enforceScriptRules([{ line: 'Start small. Follow for Part 2.' }], { unpicked: [], followAllowed: false })
    expect(cut.beats[0].line).toBe('Start small.')
    const kept = enforceScriptRules([{ line: 'Start small. Follow for Part 2.' }], { unpicked: [], followAllowed: true })
    expect(kept.removed).toHaveLength(0)
  })

  it('a code-enforcement objection is private', () => {
    expect(isPrivate('Did the neighbor come talk to you first before calling code enforcement?')).toBe(true)
  })

  it('a coffee roasting business is food, not generic business', () => {
    expect(nicheBucket('micro coffee roasting business')).toBe('food')
    expect(nicheBucket('small business marketing')).toBe('business')
    expect(nicheBucket('luxury resale')).toBe('business')
  })
})
