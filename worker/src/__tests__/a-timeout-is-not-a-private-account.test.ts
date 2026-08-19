// ASK TWICE BEFORE TELLING SOMEBODY THEIR ACCOUNT IS UNREADABLE.
//
// ⚠️ THE FAILURE THIS COVERS ALREADY HAPPENED, ON A REAL ACCOUNT. The Instagram
// Actor timed out after 30 seconds on a large PUBLIC profile and labelled it
// "Empty or private data". Partitioning stopped that becoming a fake post; it
// did not stop the timeout itself ending the scan. Running the same input again
// returned thousands of real posts, which is the whole argument for this file.
//
// ⚖️ THE CLASSIFIER IS TESTED SEPARATELY FROM THE LOOP, because the dangerous
// mistake is not "we retried too few times" — it is deciding a transient
// infrastructure failure was a fact about the creator.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readVerdict, READ_VERDICTS } from '../profileReadVerdict'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'media.ts'), 'utf8')

describe('what is worth asking again', () => {
  it('the exact message that started this is retried', () => {
    expect(readVerdict('Error: request timed out after 30 seconds.')).toBe('retry')
  })

  // ⚠️ THE ACTOR'S OWN LABEL MUST NOT BE TRUSTED AS A PERMANENT CAUSE. It wrote
  // "Empty or private data for provided input" about a timeout. Treating that
  // phrase as permanent would reinstate the exact bug on the retry path.
  it('the actor’s guess at a cause is still retried', () => {
    expect(readVerdict('Empty or private data for provided input')).toBe('retry')
  })

  it('wording nobody has seen before is retried, not given up on', () => {
    expect(readVerdict('some new failure mode from 2027')).toBe('retry')
  })

  it('a condition a retry cannot fix is not retried', () => {
    for (const m of [
      'This is a private account',
      'User not found',
      'Profile does not exist',
      'account has been suspended',
      'invalid username',
    ]) expect(readVerdict(m)).toBe('permanent')
  })

  it('there are exactly two verdicts', () => {
    expect(READ_VERDICTS).toEqual(['permanent', 'retry'])
  })
})

describe('the loop is bounded and reports the second answer', () => {
  // ⚠️ EXACTLY ONE EXTRA ATTEMPT. A loop here turns one creator's bad afternoon
  // into an unbounded Apify bill, and the third attempt has never been the one
  // that works. Asserted against the source because the alternative is a live
  // Actor call in a unit test.
  it('caps at two attempts', () => {
    expect(SRC).toMatch(/attempt <= 2/)
    expect(SRC).not.toMatch(/attempt <= [3-9]/)
  })

  it('stops immediately on a permanent verdict', () => {
    expect(SRC).toMatch(/if \(verdict === 'permanent'\) break/)
  })

  // ⚖️ REPORTING THE FIRST FAILURE WOULD DESCRIBE A STATE WE ALREADY KNOW WE
  // COULD NOT REPRODUCE.
  it('throws the last failure, not the first', () => {
    expect(SRC).toMatch(/throw new ProfileReadFailedError\(last\)/)
  })

  it('every attempt is logged with its verdict', () => {
    expect(SRC).toMatch(/event: 'profile_read_failed', where, attempt, verdict/)
  })

  // ⚠️ A SUCCESS MUST NOT COST AN EXTRA RUN. The loop returns on the first
  // clean read; a version that always ran twice would double the bill silently.
  it('returns as soon as a read succeeds', () => {
    expect(SRC).toMatch(/if \(failure === null\) return \{ items, records \}/)
  })
})
