// A REVIEWER MUST NOT BE SHOWN AN ANSWER BEFORE THEY GIVE ONE.
//
// ⚠️ THE DEFECT, AS THE OWNER EXPERIENCED IT. They labelled claim 1, the page
// advanced, and claim 2 opened with "The frames contradict this" already ringed
// in blue. Nothing was selected: the answer buttons are keyed by label, so React
// reuses the same DOM nodes as the view advances and the browser's focus ring
// stays on the button just clicked.
//
// ⚖️ THAT IS NOT COSMETIC ON THIS PAGE. A visibly pre-picked answer nudges a
// reviewer toward repeating their last one, and repeated answers are
// indistinguishable from agreement in the results. This page already refuses to
// show a running score for exactly that reason; a sticky highlight is the same
// coaching by another route.
//
// ⚠️ AND THE EVIDENCE SCOPE IS PART OF THE CLAIM. "Nobody is talking to the
// camera" is about the whole video; the frames below it are whatever the claim
// cited, sometimes one still. The card must say how many of the frames Twin
// looked at are on screen, or "these frames cannot settle it" is a guess rather
// than an informed answer.
//
// Source-scraped rather than rendered, matching this directory's existing
// idiom: there is no jsdom component harness here, and a guard that exists is
// worth more than one that waits for infrastructure.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(
  join(__dirname, '..', 'pages', 'PilotVisualReview.tsx'), 'utf8')

/** ⚠️ A GUARD THAT READS SOURCE CANNOT TELL CODE FROM A QUOTATION OF CODE.
 *  This page's header comment warns against showing "how many claims have been
 *  marked SUPPORTED so far" -- scanning the raw file for that phrase matches the
 *  WARNING and reports the defect it prevents. Comments are stripped before any
 *  banned-token check. (The same mistake shipped once already, in
 *  check_analysis_components.mjs, and CI caught it.) */
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')

describe('the labelling card does not coach the reviewer', () => {
  it('drops the focus ring once the view has advanced', () => {
    expect(SRC).toContain('function blurAnswerFocus')
    expect(SRC).toContain('blurAnswerFocus()')
  })

  it('blurs AFTER advancing, not before — order is the whole point', () => {
    // ⚠️ lastIndexOf, NOT indexOf. `function blurAnswerFocus(): void` CONTAINS
    // the substring "blurAnswerFocus()", so indexOf finds the DECLARATION near
    // the top of the file and the ordering assertion is meaningless.
    const advance = SRC.indexOf('setAt((i) => Math.min(claims.length - 1, i + 1))')
    const blur = SRC.lastIndexOf('blurAnswerFocus()')
    expect(advance).toBeGreaterThan(-1)
    expect(blur).toBeGreaterThan(advance)
  })

  it('still highlights a REAL selection, so the fix did not remove the signal', () => {
    // The fill is keyed off the saved label, never off focus.
    expect(SRC).toContain("claim.current?.label === label")
    expect(SRC).toContain('border-sky-400')
  })

  it('keeps keyboard labelling on window, so blurring costs nothing', () => {
    expect(SRC).toContain("window.addEventListener('keydown', onKey)")
  })

  it('never renders a running total of how claims were answered', () => {
    // Progress is allowed ("N left to answer"); a score is not.
    for (const banned of ['SUPPORTED so far', 'supportedRate', 'pass rate']) {
      expect(CODE, `"${banned}" must not reach the reviewer`).not.toContain(banned)
    }
  })
})

describe('the card says how thin the evidence is', () => {
  it('reports how many of the frames Twin looked at are shown', () => {
    expect(SRC).toContain('pictures it looked at from this video')
  })

  it('counts the cited frames against the total for that reference', () => {
    expect(SRC).toContain('framesFor(claim).length')
    expect(SRC).toContain("filter((f) => f.url === claim.url)")
  })

  it('says "picture" for one and "pictures" for several', () => {
    expect(SRC).toContain('Does the picture below back that up?')
    expect(SRC).toContain('Do the pictures below back that up?')
  })
})
