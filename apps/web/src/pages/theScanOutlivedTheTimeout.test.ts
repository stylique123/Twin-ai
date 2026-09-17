// THE TIMEOUT WAS NOT REPORTING A FAILURE. IT WAS CAUSING ONE.
//
// ⚠️ MEASURED 2026-09-17 on the last twelve `build_voice` jobs in production:
// 49, 91, 134, 199, 208, 266, 292, 340, 373, 380, 538, 952 seconds.
// p50 = 279s, p90 = 522s. SEVEN OF TWELVE crossed the 220s cap this screen
// used, and ALL TWELVE finished with status `done`. Every one of the 53
// non-failed voices in production is `ready` with a usable profile — 100%.
//
// So for 58% of creators the screen said "we could not read your account"
// about an account we read fine, dropped the voiceId, and left a finished
// profile in the database that nobody ever collected.
//
// ⚖️ THIS TEST ENCODES THE MEASUREMENT AS THE REQUIREMENT rather than pinning a
// literal. A cap is a judgement call about how long to wait; what is NOT a
// judgement call is that it must sit above the p90 of real scans. Anyone free to
// retune it is not free to put it back under the data.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(join(__dirname, 'Onboarding.tsx'), 'utf8')

/** The observed `build_voice` durations, in seconds. The evidence, kept here so
 *  the threshold below can be re-derived rather than trusted. */
const OBSERVED_S = [49, 91, 134, 199, 208, 266, 292, 340, 373, 380, 538, 952]

const pct = (xs: readonly number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0
}

function capMs(): number {
  // ⚠️ MATCHED WITHIN ONE LINE, and underscore separators allowed, because the
  // repo writes durations as `900_000`. A regex spanning lines has produced a
  // false failure on correct code here before.
  const m = SRC.match(/const MAX_WAIT_MS = ([0-9_]+)/)
  expect(m, 'MAX_WAIT_MS is gone or renamed — re-anchor this, do not delete it').toBeTruthy()
  return Number((m as RegExpMatchArray)[1].replace(/_/g, ''))
}

describe('the scan must outlive the wait', () => {
  it('the cap sits above the p90 of real scans, with headroom', () => {
    const p90 = pct(OBSERVED_S, 0.9)
    expect(p90).toBeGreaterThan(0)
    // Headroom, not a tie: a cap equal to p90 fails one scan in ten.
    expect(capMs() / 1000, `cap must exceed p90 (${p90}s) with margin`).toBeGreaterThan(p90 * 1.5)
  })

  it('and above the median by a wide margin, which the old cap was not', () => {
    const p50 = pct(OBSERVED_S, 0.5)
    expect(capMs() / 1000).toBeGreaterThan(p50 * 2)
    // The regression this file exists to prevent: 220s was BELOW the median.
    expect(220).toBeLessThan(p50)
  })

  it('covers all but the slowest observed scan', () => {
    const covered = OBSERVED_S.filter((s) => s < capMs() / 1000).length
    expect(covered).toBeGreaterThanOrEqual(OBSERVED_S.length - 1)
  })

  it('is still finite — an infinite spinner is the thing the cap exists to stop', () => {
    expect(Number.isFinite(capMs())).toBe(true)
    // Not more than an hour, whatever anyone decides later.
    expect(capMs()).toBeLessThanOrEqual(60 * 60_000)
  })

  it('expiry still reaches the manual fallback, so the cap keeps its purpose', () => {
    // The claim is behavioural: crossing the cap must hand the creator somewhere
    // to go, not silently stop polling.
    const tail = SRC.slice(SRC.indexOf('const MAX_WAIT_MS'))
    expect(tail).toMatch(/Date\.now\(\) - startedAt > MAX_WAIT_MS/)
    expect(tail).toMatch(/onScanDead\(\)/)
  })
})
