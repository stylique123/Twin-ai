// SHE PICKED A PRODUCT AND THE SCREEN THREW IT AWAY.
//
// ⚠️⚠️ OBSERVED LIVE: pick "something I sell" → the chooser opens → pick a
// product → black flash → back at "What have you got?" with nothing carried.
//
// ⚖️ IT WAS NEVER A MODAL BUG. The chooser's own handler called
// `nav('/v2/building', …)` with `buildFieldsForDoor('idea', input.trim())`, and
// a creator who came through the PRODUCT door has typed no idea. That makes
// `reference_note` empty, and V2Building's first effect reads:
//
//     // No input (e.g. refresh) → go back to Create.
//     if (!state.reference_url && !state.reference_note) { nav('/v2', { replace: true }) }
//
// So the app navigated forward, failed its own entry guard, and `replace`d back
// to the door screen. The black flash IS that round trip, and the choice was
// discarded on the way through.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildFieldsForDoor } from '../entryDoor'

const dir = dirname(fileURLToPath(import.meta.url))
const CREATE = readFileSync(join(dir, '..', '..', '..', '..', 'apps', 'web', 'src', 'pages', 'v2', 'V2Create.tsx'), 'utf8')
const BUILDING = readFileSync(join(dir, '..', '..', '..', '..', 'apps', 'web', 'src', 'pages', 'v2', 'V2Building.tsx'), 'utf8')

describe('the guard that was bouncing her is still there', () => {
  it('V2Building still refuses a build with no subject', () => {
    // ⚠️ PINNED, NOT REMOVED. The guard is correct — a refresh with no state
    // must not sit on a dead build screen. The bug was upstream, in what the
    // picker handed it, so the fix must not weaken this.
    expect(BUILDING).toMatch(/if \(!state\.reference_url && !state\.reference_note\)/)
    expect(BUILDING).toMatch(/nav\('\/v2', \{ replace: true \}\)/)
  })

  it('and an empty product-door build would still trip it', () => {
    // The exact payload the old handler sent when she typed nothing.
    const fields = buildFieldsForDoor('idea', '')
    expect(fields.reference_url).toBe('')
    expect(fields.reference_note).toBe('')
  })
})

describe('the pick is held, not navigated on', () => {
  it('choosing a product no longer navigates', () => {
    // ⚠️⚠️ THE LOAD-BEARING ASSERTION. A `nav(` inside the chooser is the bug.
    const chooser = CREATE.slice(CREATE.indexOf('{myProducts.map('), CREATE.indexOf('Add another product'))
    expect(chooser).toMatch(/setChosenProduct\(p\)/)
    expect(chooser).not.toMatch(/nav\('\/v2\/building'/)
  })

  it('the screen shows what she chose, where she chose it', () => {
    expect(CREATE).toContain('Making content for: ')
    expect(CREATE).toContain('chosen-product')
    // And it can be changed without leaving.
    expect(CREATE).toMatch(/onClick=\{\(\) => setPicking\(true\)\}/)
  })

  it('the build carries the product AND a subject the guard accepts', () => {
    // ⚖️ THE PRODUCT NAME BECOMES THE SUBJECT when she typed nothing, which is
    // the honest reading: she told us what she has in her hand, and the
    // objective question on the build screen asks what it is for.
    expect(CREATE).toMatch(/buildFieldsForDoor\('product', input\.trim\(\) \|\| chosenProduct\.name \|\| ''\)/)
    expect(CREATE).toMatch(/selected_product_id: chosenProduct\.id/)
    const fields = buildFieldsForDoor('product', 'Test Product One')
    expect(fields.reference_note).toBe('Test Product One')
    expect(fields.reference_note).not.toBe('')
  })

  it('the door travels, so the build screen asks the product questions', () => {
    // #779 substitutes the objective question when `door === 'product'`; it can
    // only do that if the door reaches it.
    const block = CREATE.slice(CREATE.indexOf("door === 'product' && chosenProduct !== null"))
    expect(block.slice(0, 600)).toMatch(/^\s*door,$/m)
  })

  it('the button says what will happen next', () => {
    expect(CREATE).toMatch(/chosenProduct \? 'Make this video' : 'Pick a product'/)
  })
})
