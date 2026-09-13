// A LINK WHOSE PROMISE IS "TEACH IT SOMETHING" MUST LAND ON THE TEACHING.
//
// ⚠️ IT POINTED AT `/settings`. A creator arriving on a tabbed page with no idea
// which tab holds the thing the link named is the "complete feature, zero rows"
// failure the question's own move was betting against — the Product Library is
// finished and empty for exactly this reason.
//
// ⚠️⚠️ AND THE ANCHOR ALREADY EXISTED. `TwinKnowledgeLink` has pointed at
// `/settings#my-twin` since the question moved there, and Settings honours the
// hash by selecting the tab AND scrolling. One of two callers read around it —
// the same two-caller shape as the questions bank.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const CARD = read('apps/web/src/components/TwinStrengthCard.tsx')
const LINK = read('apps/web/src/components/TwinKnowledgeLink.tsx')
const SETTINGS = read('apps/web/src/pages/Settings.tsx')

describe('the link lands on the teaching', () => {
  it('it points at the anchor, not the page', () => {
    expect(CARD).toMatch(/to="\/settings#my-twin"/)
    expect(CARD).not.toMatch(/to="\/settings"/)
  })

  it('both callers use the same target — no second vocabulary', () => {
    expect(LINK).toMatch(/to="\/settings#my-twin"/)
  })

  it('and the target exists, or the link is a broken promise', () => {
    expect(SETTINGS).toMatch(/id="my-twin"/)
    expect(SETTINGS).toMatch(/window\.location\.hash !== '#my-twin'/)
    // A tabbed page does not honour a hash by itself.
    expect(SETTINGS).toMatch(/setTab\('twin'\)/)
  })
})

describe('the count has one home, and it is the dashboard', () => {
  it('⚠️ Settings no longer renders the strength card', () => {
    // One fact with two homes is a fact she reads twice and can act on once.
    // The dashboard keeps it because that is where she is BEFORE she starts.
    expect(SETTINGS).not.toMatch(/<TwinStrengthCard/)
    expect(SETTINGS).not.toMatch(/import \{ TwinStrengthCard \}/)
  })

  it('the dashboard still does', () => {
    expect(read('apps/web/src/pages/Dashboard.tsx')).toMatch(/<TwinStrengthCard/)
  })
})
