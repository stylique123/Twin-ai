import { describe, it, expect } from 'vitest'
import {
  BACKLOG_BATCHES, assessedRate, lostBeforeLooking, backlogBatch,
} from '../backlogRuns'

// ⚠️ WHAT THIS GUARD IS FOR. The numbers in `backlogRuns.ts` are the only durable
// record that #494 was verified against real production video, and the only place
// the 34% fetch attrition is written down. Both are the kind of fact that gets
// quietly rounded off later -- the frames number because it is good news, the
// attrition because it is not.

const BATCH_1 = 'no-speech-backlog-batch-1'

describe('the batch-1 record cannot drift', () => {
  it('still exists', () => {
    expect(backlogBatch(BATCH_1)).not.toBeNull()
  })

  // The claim the batch was RUN to test.
  it('records that no reference collapsed to a single frame', () => {
    const b = backlogBatch(BATCH_1)!
    expect(b.singleFrameReferences).toBe(0)
    expect(b.minFrames).toBe(4)
    expect(b.maxFrames).toBe(4)
  })

  // ⚠️ THE HALF THAT IS EASY TO LOSE. A record that keeps "4.00 frames" and drops
  // "11 of 32 were never fetched" reads as a clean run, and the next person
  // authorises 292 downloads on it.
  it('keeps the attrition attached to the frames number', () => {
    const b = backlogBatch(BATCH_1)!
    expect(b.attrition.length).toBeGreaterThan(0)
    expect(lostBeforeLooking(b)).toBe(11)
    expect(b.assessed + lostBeforeLooking(b)).toBe(b.enqueued)
  })

  it('names the IP block specifically, not just "download failed"', () => {
    const b = backlogBatch(BATCH_1)!
    const blocked = b.attrition.find((a) => /IP address is blocked/i.test(a.cause))
    expect(blocked?.count).toBe(5)
  })

  // ⚖️ THE GAP IS A DEFECT, NOT A ROUNDING ERROR. 21 jobs succeeded and 20 rows
  // were written; recording them as equal would erase an unexplained loss.
  it('preserves the succeeded-vs-persisted gap', () => {
    const b = backlogBatch(BATCH_1)!
    expect(b.profileRowsWritten).toBeLessThan(b.assessed)
  })

  it('pins the worker commit the numbers belong to', () => {
    expect(backlogBatch(BATCH_1)!.workerCommit).toBe('33c4292')
  })
})

describe('a backlog batch can never masquerade as a labelled pilot run', () => {
  // ⚠️ THE MISTAKE THIS BLOCKS: quoting a coverage batch as though a reviewer had
  // judged it, which would invent a supported-rate that nobody measured.
  it('is never reviewer-labelled', () => {
    for (const b of BACKLOG_BATCHES) expect(b.reviewerLabelled).toBe(false)
  })

  it('carries no supported-rate field of any name', () => {
    for (const b of BACKLOG_BATCHES) {
      const keys = Object.keys(b).join(' ').toLowerCase()
      expect(keys).not.toMatch(/supported|answered|verdict/)
    }
  })
})

describe('the rate is honest about its denominator', () => {
  // ⚠️ THE MUTATION THIS CATCHES: assessedRate computed over `assessed` (which is
  // 1.0 by construction and always looks perfect) instead of over `enqueued`.
  it('divides by what was enqueued, not by what survived', () => {
    const b = backlogBatch(BATCH_1)!
    expect(assessedRate(b)).toBeCloseTo(21 / 32, 6)
    expect(assessedRate(b)).toBeLessThan(0.7)
  })

  it('an empty batch is 0, not NaN', () => {
    expect(assessedRate({ ...backlogBatch(BATCH_1)!, enqueued: 0, assessed: 0 })).toBe(0)
  })

  it('counts only the failures that happened before looking', () => {
    const mixed = {
      ...backlogBatch(BATCH_1)!,
      attrition: [
        { cause: 'fetch refused', count: 4, failedBeforeLooking: true },
        { cause: 'model declined after looking', count: 7, failedBeforeLooking: false },
      ],
    }
    // 7 is a model finding and must not be added to a supply number.
    expect(lostBeforeLooking(mixed)).toBe(4)
  })
})
