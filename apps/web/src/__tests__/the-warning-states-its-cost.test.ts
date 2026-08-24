// A WARNING THE CREATOR CAN DISMISS WITHOUT READING IS NOT A WARNING.
//
// ⚠️ THE OWNER'S REQUIREMENT, IN THEIR WORDS: warn but let them continue, and do
// it "very apparently" so it limits bad results. Those two pull against each
// other, and the resolution is button WEIGHT rather than button wording — the
// advice is filled, continuing is plain text and carries its own cost.
//
// ⚖️ AND THE CARD DECIDES NOTHING. Every sentence comes from
// warningForPickedVideo in @twinai/shared, where the rules and the plain-English
// copy are tested. If this file started composing its own sentences, the plain-
// English guard over there would stop covering what a creator actually reads.
//
// Source-scraped rather than rendered, matching this directory's idiom: there is
// no jsdom component harness here, and a guard that exists is worth more than
// one that waits for infrastructure.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(
  join(__dirname, '..', 'components', 'TalkingHeadWarning.tsx'), 'utf8')

/** ⚠️ A GUARD THAT READS SOURCE CANNOT TELL CODE FROM A QUOTATION OF CODE. This
 *  component's header comment discusses "Continue" and "blocks" while arguing
 *  against them, so a raw scan for those words matches the ARGUMENT and reports
 *  the defect it prevents. Comments are stripped before any banned-token check. */
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')

describe('the card shows what the shared rules decided', () => {
  it('renders all three sentences from the shared warning', () => {
    for (const field of ['warning.saw', 'warning.cost', 'warning.instead']) {
      expect(CODE, field).toContain(`{${field}}`)
    }
  })

  // ⚠️ THE COST GOES ON THE BUTTON, AND IT COMES FROM SHARED. A hardcoded
  // "Continue" here would silently bypass the tested copy.
  it('takes the continue label from the shared warning, never a literal', () => {
    expect(CODE).toContain('{warning.continueLabel}')
  })

  it('composes no creator-facing sentence of its own', () => {
    // The only literal string a creator reads is the advice button, which is an
    // action rather than an explanation. Any other prose here would escape the
    // plain-English guard in @twinai/shared.
    const banned = ['may not sound like you', 'talking to the camera', 'cartoon', 'generic']
    for (const phrase of banned) expect(CODE.toLowerCase(), phrase).not.toContain(phrase)
  })
})

describe('the two ways out are not equally weighted', () => {
  // ⚖️ IF BOTH WERE FILLED the card would read as a neutral fork rather than a
  // recommendation, and "very apparently limit bad results" would be lost.
  it('the advice is the filled button', () => {
    const advice = CODE.indexOf('Pick a different video')
    expect(advice).toBeGreaterThan(-1)
    const btn = CODE.lastIndexOf('<button', advice)
    expect(CODE.slice(btn, advice)).toContain('btn-gradient')
  })

  it('continuing is the plain-text button', () => {
    const cont = CODE.indexOf('{warning.continueLabel}')
    expect(cont).toBeGreaterThan(-1)
    // ⚠️ SLICE FROM THE <button TAG, NOT FROM THE LABEL. A class sitting in the
    // element's ATTRIBUTES is before the text, so a slice that starts at the
    // text would miss it — the same mistake a coaching guard made once already.
    const btn = CODE.lastIndexOf('<button', cont)
    expect(CODE.slice(btn, cont)).toContain('btn-ghost')
  })

  it('the advice button comes first in the source, so it reads first', () => {
    expect(CODE.indexOf('Pick a different video'))
      .toBeLessThan(CODE.indexOf('{warning.continueLabel}'))
  })
})

describe('a double tap must not record two choices', () => {
  // ⚠️ THE ROW IS THE MEASUREMENT. Two rows from one creator's one decision
  // would corrupt the only evidence that says whether this gate is any good.
  it('both buttons disable while the choice is being recorded', () => {
    expect(CODE.match(/disabled=\{busy\}/g)?.length).toBe(2)
  })
})
