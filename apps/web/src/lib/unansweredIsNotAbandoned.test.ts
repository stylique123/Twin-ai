import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(__dirname, '../components/CountPromise.tsx'), 'utf8')

/**
 * ⚠️ REPORTED ACROSS PRODUCTION RUNS H, I AND J. The hook promised three items;
 * the three item beats were unanswered ASKS. The panel said:
 *
 *   "Add the missing items, or lower the number the hook promises."
 *
 * The check was correct — the creator had not failed at anything. Twin asked
 * them three questions and then scolded them for not having answered yet.
 */
describe('an unanswered list is not an abandoned one', () => {
  it('counts the beats still waiting on the creator', () => {
    expect(SRC).toMatch(/const pending = needsUserCount\(/)
  })

  it('the waiting state requires BOTH pending beats and the count issue', () => {
    const m = SRC.match(/const waiting = (.+)/)
    expect(m).not.toBeNull()
    expect(m![1]).toMatch(/pending > 0/)
    expect(m![1]).toMatch(/undelivered_count/)
  })

  it('the heading points at the questions, not at a failure', () => {
    expect(SRC).toMatch(/stands?\s*\n?\s*between you and this script|between you and this script/)
  })

  it('it offers the action that exists, and names the consequence of skipping', () => {
    const i = SRC.indexOf('Answer them and your list is complete')
    expect(i).toBeGreaterThan(-1)
    expect(SRC.slice(i, i + 220)).toMatch(/lowers the hook/)
  })

  it('"lower the number" advice is NOT shown while beats are pending', () => {
    // The old FIX string must be gated behind `!waiting`, never rendered
    // unconditionally for undelivered_count.
    const i = SRC.indexOf("waiting && issue.code === 'undelivered_count'")
    expect(i).toBeGreaterThan(-1)
  })

  it('the on-camera scolding paragraph is suppressed while waiting', () => {
    expect(SRC).toMatch(/\{onCamera && !waiting && \(/)
  })

  it('reuses the existing counter rather than a second one', () => {
    // needsUserCount already exists for the refund notice. A second private
    // count of the same thing is how two readers disagree.
    expect(SRC).not.toMatch(/substance === 'needs_user'/)
  })
})
