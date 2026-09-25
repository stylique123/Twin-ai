import { describe, it, expect } from 'vitest'
import { blueprintCountIssues } from '../referenceMechanism'

// Audit 2026-09-25: "two hours" in a hook was flagged as an undelivered list of 2.
describe('a duration in the hook is not a promised list', () => {
  const beats = [{ section: 'Hook', line: 'My mugs take two hours each.' }, { section: 'Body', line: 'Here is why I keep making them.' }]
  it('drops a model-written enumeration that only matches a duration', () => {
    const issues = blueprintCountIssues({
      reference_read: { mechanism: { enumeration: { is_enumerated: true, count: 2, unit: 'hours' } } },
      hook_options: ['Why my mugs take two hours each'],
      script: beats,
    } as never)
    expect(issues.filter((i) => i.code === 'undelivered_count')).toEqual([])
  })
  it('still holds a real list to its count', () => {
    const issues = blueprintCountIssues({
      reference_read: { mechanism: { enumeration: { is_enumerated: true, count: 3, unit: 'mistakes' } } },
      hook_options: ['3 mistakes every potter makes'],
      script: beats,
    } as never)
    expect(issues.some((i) => i.code === 'undelivered_count')).toBe(true)
  })
})
