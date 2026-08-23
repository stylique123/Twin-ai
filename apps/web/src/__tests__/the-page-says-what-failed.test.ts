// THE PAGE MUST SAY WHICH FAILURE THIS WAS.
//
// The owner saw "Failed to send a request to the Edge Function", refreshed, and
// saw it again. That string is compatible with the server refusing, the server
// being down, the session having expired, and the phone losing signal -- four
// problems needing four different actions. The page distinguished none of them,
// and offered nothing to press.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(
  join(__dirname, '..', 'pages', 'PilotVisualReview.tsx'), 'utf8')
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')

describe('the labelling page reports what actually failed', () => {
  it('classifies failures instead of printing a bare message', () => {
    expect(CODE).toContain('describePilotFailure')
    expect(CODE).toContain('PilotCallError')
  })

  it('both the load and the lock go through the same explanation', () => {
    // ⚠️ A page that explains one and not the other still strands the reviewer
    // on whichever it forgot.
    expect(CODE).toContain('setError(explain(e))')
    expect(CODE).toContain('setLockError(explain(e))')
  })

  it('no path prints a raw error message any more', () => {
    expect(CODE).not.toContain('String(e.message ?? e)')
    expect(CODE).not.toContain('setError(String(')
  })

  it('a failed autosave is inline too — the same defect a THIRD time', () => {
    // ⚠️ #486 fixed the lock and MISSED this one. A dropped label save wrote
    // into the loader error as well, so it would have wiped the page
    // MID-LABELLING and lost the reviewer's place.
    expect(CODE).toContain('setSaveError(explain(e))')
    expect(CODE).toContain('setSaveError(null)')
    expect(CODE).toContain('That answer was not saved')
    const saveBlock = CODE.slice(CODE.indexOf('{saveError && ('))
    expect(saveBlock.slice(0, 220)).toContain('role="alert"')
  })

  it('the load failure can be retried without a refresh', () => {
    // The owner refreshed and got the same dead screen with nothing to press.
    expect(CODE).toContain('Try again')
    expect(CODE).toContain('setReload((n) => n + 1)')
    expect(CODE).toContain('[pilotRunId, reload]')
  })

  it('a retry actually clears the previous error, so a stale one cannot stick', () => {
    // ⚠️ SLICE FORWARD FROM THE EFFECT, NOT TO THE FIRST getPilotPacket -- that
    // name appears in the IMPORT first, so a naive indexOf pair yields an empty
    // string and the assertion passes on nothing. Caught by this test failing.
    const start = CODE.indexOf('let live = true')
    const effect = CODE.slice(start, CODE.indexOf('getPilotPacket', start))
    expect(effect).toContain('setError(null)')
  })
})
