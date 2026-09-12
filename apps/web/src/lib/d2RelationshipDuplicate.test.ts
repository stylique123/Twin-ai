// D2 — THE RELATIONSHIP QUESTION HAS ONE HOME NOW: PRODUCT LIBRARY.
//
// ⚖️ THE AUDIT (TASK 1) CONFIRMED THE FREE-TEXT SIDE WAS A DEAD END. Quick-things
// asked "What is your relationship to it — own it, earn from it, paid to feature
// it, just covering it?" as a text box, sent as `readiness_answers.relationship`.
// The server read that string ONLY to satisfy `READINESS_RELATIONSHIPS.includes(
// upper)` — an exact-string match against the enum, never a parse — so a
// creator typing the plain-English answer never actually landed on
// `OWN_PRODUCT` / `AFFILIATE` / `SPONSOR` / `REVIEW_ONLY`. It was never
// interpolated into a script and never written to a column.
//
// Product Library's four chips write the SAME fact to the real column,
// `product_entities.relationship`, which every claim rule and disclosure check
// in `generate-blueprint` actually reads. This pins that the duplicate is gone:
// the Quick-things screen no longer renders a text box for this question, the
// courtesy pre-check resolves it from the library before ever asking, and the
// server gate prefers the entity over a typed answer.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const WEB = readFileSync(join(REPO, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('D2: Quick-things no longer shows the free-text relationship question', () => {
  it('the relationship branch renders a Product Library link, not an <input>', () => {
    const start = WEB.indexOf("q.field === 'relationship'")
    const end = WEB.indexOf(') : (', start)
    const branch = WEB.slice(start, end)
    expect(branch).toMatch(/Open Product Library/)
    expect(branch).toMatch(/nav\('\/products'\)/)
    // The generic free-text `<input>` fallback must not appear inside this
    // branch — it belongs to the `else` arm this branch pre-empts.
    expect(branch).not.toMatch(/<input/)
  })

  it('the relationship branch sits before the generic free-text input in the renderer', () => {
    const rel = WEB.indexOf("q.field === 'relationship'")
    const genericInput = WEB.indexOf('placeholder="Your answer"')
    expect(rel).toBeGreaterThan(-1)
    expect(genericInput).toBeGreaterThan(-1)
    expect(rel).toBeLessThan(genericInput)
  })

  it('never sends readiness_answers.relationship from typing on this screen', () => {
    // The only way `askAnswers.relationship` could be populated is a call to
    // `answer('relationship', ...)`. The relationship branch must not call it.
    const start = WEB.indexOf("q.field === 'relationship'")
    const end = WEB.indexOf(') : (', start)
    const branch = WEB.slice(start, end)
    expect(branch).not.toMatch(/answer\(q\.field/)
  })
})

describe('D2: the courtesy pre-check resolves relationship from Product Library', () => {
  it('fetches the library alongside the voice, before deciding what to ask', () => {
    expect(WEB).toMatch(/loadProductEntities\(\)\.catch\(\(\) => \[\] as ProductEntityRecord\[\]\)/)
    expect(WEB).toMatch(/Promise\.all\(\[\s*\n\s*listBrandVoices\(\)/)
  })

  // ⚠️ THIS PINNED THE WHOLE EXPRESSION AND WENT STALE ON 2026-09-12, WHILE ITS
  // CLAIM BECAME MORE TRUE, NOT LESS. The claim is that an ENTITY answer
  // outranks the legacy `pre_script_brief` field. A product the creator PICKED
  // for this video now sits ahead of both, so the chain grew a term and the
  // literal regex stopped matching correct code.
  //
  // ⚖️ SO IT ASSERTS THE ORDER, WHICH IS THE CLAIM. Every entity-derived source
  // must precede the brief-derived ones; adding another entity source cannot
  // fail this, and demoting one below `vBrief` still does.
  it('feeds the entity relationship into assessReadiness ahead of the legacy brief field', () => {
    const line = WEB.slice(WEB.indexOf('relationship: '), WEB.indexOf('cta:', WEB.indexOf('relationship: ')))
    const picked = line.indexOf('chosen?.relationship')
    const library = line.indexOf('libraryRelationship(')
    const brief = line.indexOf('vBrief.promotes')
    expect(picked, 'the picked entity is not consulted').toBeGreaterThan(-1)
    expect(library, 'libraryRelationship is not consulted').toBeGreaterThan(-1)
    expect(brief, 'the legacy brief field is no longer the fallback').toBeGreaterThan(-1)
    expect(picked).toBeLessThan(library)
    expect(library).toBeLessThan(brief)
  })

  it('libraryRelationship prefers a name match, then the sole answered entity', () => {
    expect(WEB).toMatch(/function libraryRelationship\(/)
    expect(WEB).toMatch(/answered\.length === 1 \? answered\[0\]\.relationship : null/)
  })
})

describe('D2: the server gate prefers the entity over a typed answer', () => {
  it('readyRel reads ownedEntity, then the wider library, then brief.promotes, then the typed answer last', () => {
    expect(EDGE).toMatch(/const readyRel = ownedEntity\?\.relationship \?\? readyLibraryRel \?\? brief\.promotes \?\? answers\.relationship/)
  })

  it('readyLibraryRel looks the named offer up in the whole library, not just the voice-scoped row', () => {
    const block = EDGE.slice(EDGE.indexOf('const readyLibraryRel ='), EDGE.indexOf('const readyRel ='))
    expect(block).toMatch(/libraryRows/)
  })
})

describe('D2: Product Library keeps the one real question', () => {
  it('the four-chip relationship question still writes to product_entities.relationship', () => {
    const API = readFileSync(join(REPO, 'packages/shared/src/api.ts'), 'utf8')
    expect(API).toMatch(/relationship: entity\.relationship,/)
    expect(API).toMatch(/\.from\('product_entities'\)/)
  })
})
