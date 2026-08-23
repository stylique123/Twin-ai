// A FAILED LOCK MUST NOT DESTROY THE PAGE.
//
// The owner finished all 103 labels, pressed Finish & Lock from a phone, and got
// "The review could not load" on an otherwise empty screen. Two lies in one: the
// review HAD loaded, and the only control that could retry the lock was gone.
// The cause was one line -- `finish` wrote its failure into the LOADER's `error`
// state, and the `if (error)` branch returns early, replacing the whole view.
//
// Measured afterwards against production: the run was still `ready_for_label`
// with `locked_at` null, and all 103 labels were intact. Nothing was lost except
// the ability to try again.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(
  join(__dirname, '..', 'pages', 'PilotVisualReview.tsx'), 'utf8')

/** Comments stripped: this page's comments DESCRIBE the defect, so a raw scan
 *  would pass on the prose that documents it. */
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')

/** The body of finish(), from its declaration to the closing of its finally. */
const FINISH = CODE.slice(CODE.indexOf('const finish ='), CODE.indexOf('if (error)'))

describe('a lock that fails leaves the reviewer able to retry', () => {
  it('finish() does not write into the loader error state', () => {
    // ⚠️ THIS IS THE WHOLE DEFECT. setError here is what emptied the screen.
    expect(FINISH).not.toContain('setError(')
  })

  it('finish() reports into a separate lock error', () => {
    expect(FINISH).toContain('setLockError(')
  })

  it('a retry clears the previous lock error, so a stale message cannot persist', () => {
    expect(FINISH).toContain('setLockError(null)')
  })

  it('the lock error renders inline, not as an early return that replaces the view', () => {
    // The early-return branch keys off `error` only; lockError must be rendered
    // in the footer, AFTER the Finish & Lock button exists.
    const earlyReturn = CODE.indexOf('if (error)')
    const button = CODE.indexOf('Finish & Lock')
    const inline = CODE.indexOf('{lockError && (')
    expect(inline).toBeGreaterThan(button)
    expect(button).toBeGreaterThan(earlyReturn)
  })

  it('it says the labels are safe, because they are', () => {
    expect(CODE).toContain('Your labels are saved')
    expect(CODE).toContain('Press Finish &amp; Lock again')
  })

  it('the message is announced, so it is not silent on a phone', () => {
    const block = CODE.slice(CODE.indexOf('{lockError && ('))
    expect(block.slice(0, 200)).toContain('role="alert"')
  })
})
