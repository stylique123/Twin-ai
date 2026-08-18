// THE ITEM THAT MADE A PUBLIC ACCOUNT LOOK PRIVATE.
//
// ⚠️ CAPTURED FROM A REAL APIFY RUN against a large, public Instagram account.
// The Actor SUCCEEDED, exited zero, and wrote one item that is not a post:
//
//   { error: 'no_items',
//     errorDescription: 'Empty or private data for provided input',
//     requestErrorMessages: ['Error: request timed out after 30 seconds.'] }
//
// Every item was mapped to a post, so this became a post with no caption, was
// dropped by the caption filter, and reached the creator as "if that account is
// private or empty, make it public for a moment". It had timed out.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'media.ts'), 'utf8')
const JOB = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'jobs', 'scrapeDna.ts'), 'utf8')

describe('every Actor-backed reader partitions before it maps', () => {
  it('all three call partitionItems and refuse on failure', () => {
    // ⚖️ THE SHAPE IS THE ACTOR PLATFORM'S, NOT INSTAGRAM'S, so TikTok and
    // YouTube have exactly the same hole. Fixing only the reader that was
    // reported would leave two.
    expect((SRC.match(/partitionItems\(items\)/g) ?? []).length).toBe(3)
    expect((SRC.match(/throw new ProfileReadFailedError\(failure\)/g) ?? []).length).toBe(3)
  })

  it('and nothing maps over the raw items any more', () => {
    // The defect in one line: `items.map(...)` over a list that can contain a
    // failure report.
    expect(SRC).not.toMatch(/const posts: ScrapedPost\[\] = items\b/)
  })

  it('rawCount counts records, never error reports', () => {
    // ⚠️ OTHERWISE THE NEW MESSAGE LIES IN A NEW WAY — "we read 1 post and
    // learned nothing from it" about a run that read nothing at all.
    expect(SRC).not.toMatch(/rawCount: items\.length/)
  })
})

describe('the actor’s own explanation is not repeated to a creator', () => {
  it('prefers the underlying request error over the label', () => {
    // ⚖️ "Empty or private data" IS THE ACTOR GUESSING AT A CAUSE IT DOES NOT
    // KNOW. The true line was "request timed out after 30 seconds".
    expect(SRC).toMatch(/requestErrorMessages/)
    const fn = SRC.slice(SRC.indexOf('function partitionItems'))
    expect(fn.slice(0, 900)).toMatch(/first\.requestErrorMessages\[0\]/)
  })

  it('and the creator is told it is our side', () => {
    expect(JOB).toMatch(/that is on our side, not your account/)
    // The private-or-empty wording must never reach a read FAILURE again.
    const handler = JOB.slice(JOB.indexOf('ProfileReadFailedError'))
    expect(handler.slice(0, 800)).not.toMatch(/private or empty/)
  })
})
