import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ⚠️ A FORM THAT CANNOT PERSIST IS WORSE THAN NO FORM. That is the 0169 lesson:
 * a screen that collects answers and drops them teaches the creator their input
 * does not matter, and there is no error to notice.
 *
 * These read the SHIPPED SOURCES rather than mocking a database, because what
 * has to stay true is that the value is named at every hop — form state → claim
 * → attestation → insert row → column → read back. A break anywhere is silent.
 */
const repo = join(import.meta.dirname, '..', '..', '..', '..')
const api = readFileSync(join(repo, 'packages', 'shared', 'src', 'api.ts'), 'utf8')
const library = readFileSync(join(repo, 'apps', 'web', 'src', 'pages', 'ProductLibrary.tsx'), 'utf8')

describe('the map reaches the column', () => {
  // ⚠️ ANCHORED ON THE INSERT ROW, NOT THE FILE. `community_map` also appears in
  // the SELECT list and in the reader, so a bare token search would be green
  // even if the write were deleted — the exact trap that made four guards
  // decoration earlier today.
  const rowStart = api.indexOf('  const row = {')
  const row = rowStart === -1 ? '' : api.slice(rowStart, api.indexOf('\n  }', rowStart))

  it('the insert row exists to be checked at all', () => {
    expect(rowStart, 'insert row not found — was it renamed?').toBeGreaterThan(-1)
  })

  it('writes community_map on the row it inserts', () => {
    expect(row).toMatch(/community_map:/)
  })

  // ⚠️ AND IT IS FILTERED THROUGH mapIsUsable BEFORE IT IS WRITTEN. The 0170
  // check constraint refuses anything that is not a JSON object, so sending a
  // half-map would fail the INSERT — and the creator would be told their
  // PRODUCT could not be added, for a reason that has nothing to do with it.
  it('a map that is not usable is written as null rather than failing the insert', () => {
    expect(row).toMatch(/mapIsUsable/)
    expect(row).toMatch(/:\s*null/)
  })

  it('the column is selected back, or the record could never carry it', () => {
    const cols = api.slice(api.indexOf('const ENTITY_COLUMNS'), api.indexOf('const ENTITY_COLUMNS') + 400)
    expect(cols).toMatch(/community_map/)
  })

  // ⚖️ THE READ DEGRADES TOWARDS SILENCE. A malformed stored value must read as
  // NO MAP, not as a map — no map means the writer says nothing about the
  // community, while a malformed one treated as usable would let it name
  // surfaces nobody confirmed exist.
  it('reads back through the same test every consumer uses', () => {
    const readerStart = api.indexOf('function readEntityRow')
    const reader = api.slice(readerStart, api.indexOf('\n}', readerStart))
    expect(reader).toMatch(/communityMap:/)
    expect(reader).toMatch(/mapIsUsable/)
  })
})

describe('the questions are asked, and only of a community', () => {
  // ⚠️ MATCHED ON THE RENDER CONDITION, not on the component name anywhere.
  // `CommunityQuestions` also appears at its own definition, so anchoring on the
  // definition would stay green if the render were deleted.
  it('renders the section only when the type is COMMUNITY', () => {
    expect(library).toMatch(/type === 'COMMUNITY' &&\s*\(\s*<CommunityQuestions/)
  })

  it('the submit gate refuses a community with no usable map', () => {
    expect(library).toMatch(/type !== 'COMMUNITY' \|\| communityMap !== null/)
  })

  // ⚠️ THE MAP TRAVELS WITH THE CLAIM OR IT IS LOST. Everything ticked lives
  // only in component state until this line.
  it('passes the built map into the claim', () => {
    const claimStart = library.indexOf('onClick={() => onClaim({')
    const claim = library.slice(claimStart, claimStart + 2000)
    expect(claimStart).toBeGreaterThan(-1)
    expect(claim).toMatch(/communityMap,/)
  })

  // ⚖️ AND THE BUTTON SAYS WHY IT IS DISABLED. The old gate demanded a field
  // that was never rendered, leaving a dead button and nothing on screen saying
  // what was missing.
  it('names the gaps rather than only disabling', () => {
    expect(library).toMatch(/communityGaps\.length > 0/)
    expect(library).toMatch(/whatIsMissing\(/)
  })

  // ⚠️ NO SCREEN-CAPTURE WORDING MAY REACH THIS PAGE. Twin does not direct
  // screen recordings; a form label is the last place that rule could be undone
  // by a well-meaning edit.
  it('the page never asks anyone to record their screen', () => {
    const stripped = library.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(stripped).not.toMatch(/screen[\s-]?record/i)
    expect(stripped).not.toMatch(/record (?:your|the|my) screen/i)
  })
})
