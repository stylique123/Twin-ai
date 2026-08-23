// GOING BACK MUST BE PRESSABLE, NOT ONLY TYPEABLE.
//
// Back navigation existed only as an ArrowLeft key handler. The owner labelled a
// 103-claim run from a phone after their laptop died, wanted to revise earlier
// answers, and reported "there is no arrow going back to recheck". There was
// not: on a touch device the control did not exist at all.
//
// ⚖️ Revision is the point. Field notes shipped mid-run, so the earliest claims
// were judged without them, and labels stay editable until Finish & Lock exactly
// so a reviewer can correct themselves.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(
  join(__dirname, '..', 'pages', 'PilotVisualReview.tsx'), 'utf8')

/** Comments stripped: this page's comments DISCUSS the controls, so a raw scan
 *  would pass on the prose alone. */
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')

describe('the labelling card can be navigated without a keyboard', () => {
  it('renders a visible Back control, not just a key handler', () => {
    expect(CODE).toContain('← Back')
    expect(CODE).toContain('aria-label="Previous claim"')
  })

  it('renders a visible Next control too', () => {
    expect(CODE).toContain('Next →')
    expect(CODE).toContain('aria-label="Next claim"')
  })

  it('both controls are disabled at their ends, so the index cannot run out of range', () => {
    // ⚠️ The clamp is asserted as well as the disable: a disabled attribute is a
    // UI affordance, not a bound.
    expect(CODE).toContain('disabled={at === 0}')
    expect(CODE).toContain('disabled={at >= claims.length - 1}')
    expect(CODE).toContain('Math.max(0, i - 1)')
    expect(CODE).toContain('Math.min(claims.length - 1, i + 1)')
  })

  it('presses are logged as nav, the same event the keys log', () => {
    // ⚠️ EXACTLY FOUR, COUNTED FROM THE SOURCE: ArrowLeft, ArrowRight, Back,
    // Next. The jump control logs 'jump', not 'nav' -- a first draft of this
    // assertion said five because it counted jump in, and the source was right.
    const navs = CODE.match(/logPilotEvent\(pilotRunId, 'nav'/g) ?? []
    expect(navs.length).toBe(4)
  })

  it('the controls carry no label value, so navigation cannot coach', () => {
    // The Back/Next block must not read current?.label -- a control that looked
    // different for answered claims would be a running score by another route.
    // aria-label is an accessibility name for the CONTROL, not a claim label;
    // what must not appear is a read of the answer.
    // ⚠️ THE SLICE MUST START AT THE OPENING TAG, NOT AT THE BUTTON TEXT. A
    // first draft started at '← Back' and a probe that added
    // data-x={claims[at].current?.label} to the Back button's ATTRIBUTES passed,
    // because attributes precede the child text. Validated on that case.
    const end = CODE.indexOf('</button>', CODE.indexOf('Next →'))
    const block = CODE.slice(CODE.lastIndexOf('<button', CODE.indexOf('← Back')), end)
    expect(block).not.toContain('current?.label')
    expect(block).not.toContain('.label')
  })
})
