import { describe, it, expect } from 'vitest'
import { checkHookEntity, demoteUnsupportedHooks } from '../hookEntity.js'

describe('checkHookEntity', () => {
  it('flags Run A\'s exact shipped hook — "Revenue last year was stagnant"', () => {
    const result = checkHookEntity(
      'Revenue last year was stagnant. Here are the 3 reasons you are not scaling right now.',
      [],
    )
    expect(result.flagged).toBe(true)
    expect(result.reason).toBe('unsupported_business_model')
  })

  it('flags Run D\'s "we do over a million in revenue"', () => {
    const result = checkHookEntity('We do over a million in revenue and still made this mistake.', [])
    expect(result.flagged).toBe(true)
    expect(result.reason).toBe('unsupported_figure')
  })

  it('flags Run D\'s "stop blaming your churn" as a business-model assumption', () => {
    const result = checkHookEntity('Stop blaming your churn for a problem you created.', [])
    expect(result.flagged).toBe(true)
    expect(result.reason).toBe('unsupported_business_model')
  })

  it('flags a first-person-plural business claim with no figure at all', () => {
    const result = checkHookEntity('We built this company from nothing.', [])
    expect(result.flagged).toBe(true)
    expect(result.reason).toBe('unsupported_business_claim')
  })

  it('does not flag a figure that names an owned entity', () => {
    const result = checkHookEntity('Widget Co hit a million in revenue this year.', [{ name: 'Widget Co' }])
    expect(result.flagged).toBe(false)
  })

  it('leaves ordinary hooks alone', () => {
    for (const h of [
      'This hidden iPhone feature will change how you use your phone.',
      "You're missing out if you don't know this iPhone trick.",
      'Stop scrolling! This iPhone secret is a game-changer.',
    ]) {
      expect(checkHookEntity(h, []).flagged, h).toBe(false)
    }
  })

  it('treats an empty line as unflagged', () => {
    expect(checkHookEntity('', []).flagged).toBe(false)
    expect(checkHookEntity(undefined, []).flagged).toBe(false)
  })
})

describe('demoteUnsupportedHooks', () => {
  const RUN_D_HOOKS = [
    'The one mistake every creator makes in their first year.',
    'We do over a million in revenue and still made this mistake.',
    'Nobody tells you this before you start posting.',
    'Stop blaming your churn for a problem you created.',
    'This is the trick that changed everything for me.',
  ]

  it('demotes the two Run D hooks that fabricate business facts, keeping all five', () => {
    const result = demoteUnsupportedHooks(RUN_D_HOOKS, [])
    expect(result.found).toBe(2)
    expect(result.demoted).toBe(2)
    expect(result.hooks).toHaveLength(5)
    expect(new Set(result.hooks)).toEqual(new Set(RUN_D_HOOKS))
    // The two fabricated hooks now sort after all three clean ones.
    expect(result.hooks.slice(0, 3)).toEqual([
      'The one mistake every creator makes in their first year.',
      'Nobody tells you this before you start posting.',
      'This is the trick that changed everything for me.',
    ])
    expect(new Set(result.hooks.slice(3))).toEqual(new Set([
      'We do over a million in revenue and still made this mistake.',
      'Stop blaming your churn for a problem you created.',
    ]))
  })

  it('leaves order untouched when nothing is flagged', () => {
    const hooks = ['A clean hook.', 'Another clean hook.']
    const result = demoteUnsupportedHooks(hooks, [])
    expect(result).toEqual({ hooks, found: 0, demoted: 0 })
  })

  it('degrades gracefully — falls back to the original order — when all five fail', () => {
    const hooks = [
      'We do over a million in revenue.',
      'We built this company from nothing.',
      'Our churn is the lowest in the industry.',
      'We generate seven figures a year.',
      'We serve thousands of subscribers.',
    ]
    const result = demoteUnsupportedHooks(hooks, [])
    expect(result.found).toBe(5)
    expect(result.demoted).toBe(0)
    expect(result.hooks).toEqual(hooks)
  })

  it('never drops a hook, however many are flagged', () => {
    const hooks = ['We do a million in revenue.', 'A clean hook.']
    const result = demoteUnsupportedHooks(hooks, [])
    expect(result.hooks).toHaveLength(2)
  })
})
