import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { messageForOwnAccount, OWN_VIDEOS_TO_CHECK, type AccountCounts } from '../talkingHeadFit'

/**
 * ⚠️ TWO DEFINITIONS OF THE SAME THREE NUMBERS, IN PACKAGES THAT CANNOT IMPORT
 * EACH OTHER.
 *
 * The worker has NO runtime dependency on `@twinai/shared` — deliberately, and
 * stated in half a dozen files. So `SampleCounts` in `worker/src/ownAccountSample.ts`
 * and `AccountCounts` here are written twice and agree only by coincidence of
 * naming. The worker's counts are handed STRAIGHT to `messageForOwnAccount`;
 * nothing in either package would notice if one of them drifted.
 *
 * ⚖️ AND THE DRIFT HAS A SPECIFIC, BAD FAILURE MODE rather than a generic one.
 * Rename `checked` and the sentence silently loses its number. Flip what
 * `complete` means and a PARTIAL SAMPLE GETS A VERDICT — the exact bug #537 was
 * landed to prevent, reintroduced through the join rather than through the
 * guard. This is the same hazard the `…Inline` convention exists for, so it gets
 * the same treatment: compare the SHIPPED SOURCES.
 */
const repo = join(import.meta.dirname, '..', '..', '..', '..', '..')
const workerSrc = readFileSync(join(repo, 'worker', 'src', 'ownAccountSample.ts'), 'utf8')

/** ⚠️ SLICED BY THE INTERFACE, NOT SEARCHED ACROSS THE FILE. `usable` and
 *  `checked` appear throughout the module in comments and in `countOneLook`, so
 *  a bare token search would stay green with the interface field deleted. An
 *  earlier parity guard in this rebuild made exactly that mistake. */
const sampleCounts = (() => {
  const start = workerSrc.indexOf('export interface SampleCounts {')
  if (start === -1) return ''
  return workerSrc.slice(start, workerSrc.indexOf('\n}', start))
})()

describe('the worker still produces what the reader consumes', () => {
  it('the interface exists to be compared at all', () => {
    expect(sampleCounts, 'SampleCounts not found — was it renamed?').not.toBe('')
  })

  // ⚠️ EVERY FIELD messageForOwnAccount READS MUST SURVIVE IN THE PRODUCER.
  it.each(['usable', 'checked', 'complete'])('carries `%s`', (field) => {
    expect(sampleCounts).toMatch(new RegExp(`\\b${field}\\??:`))
  })

  // ⚖️ AND `complete` IS A PLAIN BOOLEAN ON THE PRODUCING SIDE, not optional.
  // Optional here would let the worker publish counts with no flag at all, and
  // absent reads as COMPLETE on the consuming side — which would hand a verdict
  // to a sample still being collected. The producer always knows; only the
  // reader tolerates not being told.
  it('`complete` is required on the producer, not optional', () => {
    expect(sampleCounts).toMatch(/\bcomplete:\s*boolean/)
    expect(sampleCounts).not.toMatch(/\bcomplete\?:/)
  })
})

/**
 * ⚠️ THE JOIN ITSELF, EXERCISED. The checks above pin the SHAPE; this pins the
 * BEHAVIOUR at the seam — that counts shaped like the worker's, fed to the
 * reader, produce the answers the two halves were designed to produce together.
 */
describe('worker-shaped counts read correctly', () => {
  const asAccount = (c: { usable: number; checked: number; complete: boolean; noAnswer: number }): AccountCounts =>
    ({ usable: c.usable, checked: c.checked, complete: c.complete })

  it('a sample still climbing says nothing', () => {
    expect(messageForOwnAccount(asAccount(
      { usable: 0, checked: 1, complete: false, noAnswer: 0 },
    )).kind).toBe('fine')
  })

  it('a finished sample with nothing usable says no', () => {
    expect(messageForOwnAccount(asAccount(
      { usable: 0, checked: OWN_VIDEOS_TO_CHECK, complete: true, noAnswer: 0 },
    )).kind).toBe('none')
  })

  // ⚠️ THE CASE THE TWO MODULES WERE DESIGNED AROUND TOGETHER. Five usable and
  // one unreadable video: the worker counts the failure as `noAnswer` rather
  // than as a look, so `checked` is 5 — and 5 clears the bar, so a good creator
  // is told NOTHING. Had the worker folded the failure into `checked`, this
  // would read "5 of the 6 videos we looked at", naming a video nobody saw.
  it('five usable and one unreadable is silence, not a thin warning', () => {
    const fromWorker = { usable: 5, checked: 5, complete: true, noAnswer: 1 }
    expect(messageForOwnAccount(asAccount(fromWorker)).kind).toBe('fine')
  })

  // ⚖️ AND A SAMPLE THAT PRODUCED NOTHING AT ALL IS TERMINAL, NOT PENDING. The
  // worker marks it complete; the reader still says nothing, because we have no
  // standing to describe videos we never saw.
  it('a wholly failed sample is complete and silent', () => {
    expect(messageForOwnAccount(asAccount(
      { usable: 0, checked: 0, complete: true, noAnswer: 6 },
    )).kind).toBe('fine')
  })
})
