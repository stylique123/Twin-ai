// PRODUCT MODE HAD NO DURATION CONTROL AT ALL, ON TEN AUDITED RUNS.
//
// ⚠️⚠️ TWO CAUSES, AND EITHER ALONE WOULD HAVE DONE IT.
//
//   1. The picker was gated on `!isHandoff`, and
//      `isHandoff = door === 'product' || door === 'browse'` — so the product
//      door never rendered the question.
//   2. The product door has its OWN nav branch, added when it started building
//      in place rather than dead-ending in the Library, and that branch omitted
//      `target_seconds` entirely. The main `proceed` path sends it; this one did
//      not, so `state.target_seconds` arrived undefined and `targetSeconds` fell
//      back to its default on every product build.
//
// Fixing only the picker would have shown a control whose value was then
// dropped; fixing only the nav would have sent a length nobody chose. Neither is
// a duration control.
//
// ⚠️ AND THE PICKER'S OWN COMMENT CLAIMED THE OPPOSITE OF THE CODE BENEATH IT:
// "AND IT IS ASKED FOR EVERY DOOR", sitting directly above the gate that asked
// for neither product nor browse. A note describing behaviour nothing implements
// is the defect class this repository keeps finding, and this is the third
// instance in one session.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const CREATE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'V2Create.tsx'), 'utf8')

// The length block, located by its own heading rather than by line number.
const lengthBlock = (() => {
  const at = CREATE.indexOf('How long?')
  expect(at, 'the length picker must exist').toBeGreaterThan(-1)
  // Back up to the gate that decides whether it renders at all.
  const gateAt = CREATE.lastIndexOf('{door !== ', at) >= 0
    ? CREATE.lastIndexOf('{door !== ', at)
    : CREATE.lastIndexOf('{!isHandoff && (', at)
  return CREATE.slice(gateAt, at)
})()

describe('the product door gets the length question', () => {
  it('the gate is "does this door build from this screen", not "is it a handoff"', () => {
    // ⚠️ `!isHandoff` IS ASSERTED ABSENT ON THIS BLOCK, because it is the
    // one-token mutant of the fix and it is what hid the picker.
    expect(lengthBlock).toContain("door !== 'browse'")
    expect(lengthBlock).not.toContain('!isHandoff')
  })

  it('browse is still excluded, because it does not build here', () => {
    // ⚖️ NOT A WIDENING TO EVERY DOOR. `browse` navigates to the Gallery — a
    // length picked here would be picked for a video this screen never starts.
    expect(lengthBlock).toContain("!== 'browse'")
  })

  it('and the other handoff gates are untouched', () => {
    // ⚖️ SCOPE, ASSERTED. The remaining `!isHandoff` gates cover the text box and
    // its guards, where the product door's empty-input case is deliberate.
    // Widening those is a different change with a different argument.
    expect(CREATE.match(/!isHandoff/g)!.length).toBeGreaterThanOrEqual(3)
  })
})

describe('and the length she picks actually travels', () => {
  it('the product nav branch sends target_seconds', () => {
    // ⚠️ THE HALF A PICKER ALONE WOULD NOT HAVE FIXED. Without this the creator
    // chooses 30 and the request carries the default.
    const at = CREATE.indexOf("if (door === 'product' && chosenProduct !== null) {")
    expect(at, 'the product nav branch must exist').toBeGreaterThan(-1)
    const branch = CREATE.slice(at, CREATE.indexOf('return', CREATE.indexOf('})', at)))
    expect(branch).toMatch(/target_seconds: target,/)
    expect(branch).toMatch(/selected_product_id: chosenProduct\.id/)
  })

  it('the main path still sends it too, unchanged', () => {
    // ⚖️ THE PATH THAT ALREADY WORKED MUST KEEP WORKING — Idea and Reference
    // builds go through it.
    expect(CREATE).toMatch(/target_seconds: target,/g)
    expect(CREATE.match(/target_seconds: target,/g)!.length).toBe(2)
  })
})
