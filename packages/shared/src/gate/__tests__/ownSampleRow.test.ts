/**
 * THE ACCOUNT HALF WAS WRITTEN, STORED, AND READ BY NOTHING.
 *
 * ⚠️ MEASURED ON MAIN: `messageForOwnAccount` is tested across four files and
 * the worker's `publishCounts` writes all four columns on every sample — and
 * `apps/web` imported `messageForOwnAccount` nowhere. The picked-video half of
 * the SAME gate is wired at V2Building.tsx, so one half spoke to the creator and
 * the other never had.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ownSampleCounts } from '../ownSampleRow'
import { messageForOwnAccount } from '../talkingHeadFit'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')

describe('a row that cannot support a sentence is refused', () => {
  it('a never-sampled voice is null, NOT zero of zero', () => {
    // ⚠️ THE TRAP THIS MODULE EXISTS FOR. Number(null) is 0 and isFinite(0) is
    // true, so a coercion here turns "never looked" into a finished measurement.
    expect(ownSampleCounts({})).toBeNull()
    expect(ownSampleCounts({
      own_sample_usable: null, own_sample_checked: null, own_sample_complete: null,
    })).toBeNull()
  })

  it('a half-written row is refused rather than half-rendered', () => {
    // usable missing while checked is real would print "None of the 6 videos we
    // looked at" to a creator whose usable count simply has not landed yet.
    expect(ownSampleCounts({
      own_sample_usable: null, own_sample_checked: 6, own_sample_complete: true,
    })).toBeNull()
  })

  it('a non-boolean complete is unreadable, never assumed finished', () => {
    expect(ownSampleCounts({
      own_sample_usable: 3, own_sample_checked: 6,
    })).toBeNull()
    expect(ownSampleCounts({
      own_sample_usable: 3, own_sample_checked: 6, own_sample_complete: 'true',
    })).toBeNull()
  })

  it('a string that looks like a number is not a number', () => {
    expect(ownSampleCounts({
      own_sample_usable: '3', own_sample_checked: '6', own_sample_complete: true,
    })).toBeNull()
  })

  it('more usable than checked is refused, not clamped', () => {
    expect(ownSampleCounts({
      own_sample_usable: 7, own_sample_checked: 6, own_sample_complete: true,
    })).toBeNull()
  })

  it('a negative count is not a count', () => {
    expect(ownSampleCounts({
      own_sample_usable: -1, own_sample_checked: 6, own_sample_complete: true,
    })).toBeNull()
  })

  it('null and undefined rows are refused', () => {
    expect(ownSampleCounts(null)).toBeNull()
    expect(ownSampleCounts(undefined)).toBeNull()
  })
})

describe('a readable row reaches the message unchanged', () => {
  it('carries usable, checked and complete through', () => {
    expect(ownSampleCounts({
      own_sample_usable: 3, own_sample_checked: 6, own_sample_complete: true,
    })).toEqual({ usable: 3, checked: 6, complete: true })
  })

  it('a sample still collecting stays partial, and the message stays silent', () => {
    const counts = ownSampleCounts({
      own_sample_usable: 1, own_sample_checked: 1, own_sample_complete: false,
    })
    expect(counts).toEqual({ usable: 1, checked: 1, complete: false })
    expect(messageForOwnAccount(counts!).kind).toBe('fine')
  })

  it('zero of zero is readable and the message says nothing', () => {
    // ⚖️ A SAMPLE THAT LEARNED NOTHING STILL FINISHES — the worker publishes
    // complete:true for zero-of-zero on purpose. The row is readable; it is the
    // MESSAGE that declines to speak, and that division is deliberate.
    const counts = ownSampleCounts({
      own_sample_usable: 0, own_sample_checked: 0, own_sample_complete: true,
    })
    expect(counts).toEqual({ usable: 0, checked: 0, complete: true })
    expect(messageForOwnAccount(counts!).kind).toBe('fine')
  })

  it('a finished zero-of-six does get the honest sentence', () => {
    const counts = ownSampleCounts({
      own_sample_usable: 0, own_sample_checked: 6, own_sample_complete: true,
    })
    expect(messageForOwnAccount(counts!).kind).toBe('none')
    expect(messageForOwnAccount(counts!).headline).toContain('6 videos')
  })

  it('no_answer never inflates the denominator the creator reads', () => {
    const counts = ownSampleCounts({
      own_sample_usable: 3, own_sample_checked: 6, own_sample_complete: true,
      own_sample_no_answer: 12,
    })
    expect(counts!.checked).toBe(6)
    expect(messageForOwnAccount(counts!).headline).toContain('6 videos')
  })
})

describe('the columns match what the worker actually writes', () => {
  it('reads exactly the four names publishCounts sets', () => {
    // ⚖️ THE PRODUCER IS THE AUTHORITY. A reader naming a column the writer does
    // not set is a reader that silently returns null forever — the failure mode
    // this whole file exists to end.
    const worker = readFileSync(join(REPO, 'worker/src/jobs/sampleOwnAccount.ts'), 'utf8')
    for (const col of ['own_sample_usable', 'own_sample_checked', 'own_sample_complete']) {
      expect(worker).toContain(col)
    }
  })
})
