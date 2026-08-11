// A REVIEWER SAYING "NEVER BUY THIS" IS NOT A SALES PITCH.
//
// ⚠️ THE MISTAKE THIS PINS, MEASURED. The QA scorer's sell pattern contained a
// bare `buy ` and a bare `purchase`. On the run that fixed the CTA rules it
// reported 2 CTA leaks and 8 spoken leaks — and ALL TEN were false:
//
//   "three products I'd never buy again"          — a review
//   "Don't buy for the sake of buying."           — advice against buying
//   "What's one tech purchase you regret?"        — the ENGAGEMENT CTA the
//                                                   rule asks for, scored as
//                                                   a violation of it
//
// Reported raw, that number would have read as the fix half-failing. This is
// the same class as the citation check that flagged 18 of 18 correct beats: a
// checker that cries wolf teaches its reader to ignore it, which is worse than
// having no checker at all.
//
// ⚖️ THE DECIDABLE QUESTION is whether the line ASKS THE VIEWER TO TRANSACT, or
// to go somewhere in order to. A bare verb is not that question — reviewers
// discuss buying all day — so the pattern must key on the solicitation.
//
// This reads the SCORER'S OWN PATTERN rather than restating it, because a test
// with its own copy would pass while the scorer stayed broken.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const SRC = readFileSync(join(REPO, 'scripts/qa/score-matrix.mjs'), 'utf8')

const m = SRC.match(/^const SELL = (\/.+\/i)$/m)
if (!m) throw new Error('could not lift SELL from score-matrix.mjs — fix the marker, do not inline the pattern')
// eslint-disable-next-line no-eval
const SELL: RegExp = (0, eval)(m[1])

/** Every one of these appeared verbatim in a real generated script. */
const REVIEWS = [
  "These are three products I've bought and would absolutely never buy again.",
  "Don't buy for the sake of buying. Buy for a solution.",
  "What's one tech purchase you regret? Let me know in the comments!",
  'Should you buy a pre-built gaming PC in 2024?',
  "Second, I wouldn't buy a Chromebook for my primary device.",
  'Google does NOT want you to buy these 3 phones, and I\'m going to tell you why.',
  'you buy the latest tech, but somehow, things still go wrong',
  'The first thing I would never do is buy a Fitbit Air.',
]

/** Every one of these appeared verbatim as a CTA on a creator with no
 *  commercial tie to anything. */
const PITCHES = [
  'Link in bio to get your Smart Cooker!',
  'Click the link in bio to build your $100K AI dropshipping store!',
  'Sign up for my newsletter for more tech insights.',
  'Check out The Shot Plan for making insane AI visuals. Link in bio.',
  'Click the link in bio to get yours!',
  'Follow for more tech insights and find the Surface Pro link in bio!',
]

describe('the sell check can tell a review from a solicitation', () => {
  for (const line of REVIEWS) {
    it(`does NOT flag: ${line.slice(0, 52)}…`, () => {
      expect(SELL.test(line)).toBe(false)
    })
  }
  for (const line of PITCHES) {
    it(`flags: ${line.slice(0, 52)}…`, () => {
      expect(SELL.test(line)).toBe(true)
    })
  }

  it('has no bare purchase verb, which is what caused the false alarms', () => {
    // Pinning the cause, not only the symptoms: re-adding `buy ` or `purchase`
    // as a standalone alternative reintroduces all eight false positives at
    // once, and the fixtures above would catch it — but this says why.
    expect(m[1]).not.toMatch(/\|buy \|/)
    expect(m[1]).not.toMatch(/\|purchase\|/)
  })
})
