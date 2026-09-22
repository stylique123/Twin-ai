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

// ⚠️⚠️ RE-PINNED 2026-09-22, BECAUSE THIS FILE PINNED THE DEFECT. It asserted
// that the relationship branch renders "Open Product Library" and calls
// `nav('/products')` — and the owner then reported, from the screen, that this
// exact button was a dead end: "it was just the main screen of that product
// library… that relationship has been set. And whatever I did… it never
// worked." The library showed the answer already set and nothing there could
// satisfy the card, so Create asked again forever.
//
// ⚖️ D2's ACTUAL CLAIM SURVIVES AND IS STILL PINNED: no FREE TEXT. The defect
// D2 fixed was a typed sentence that never matched the enum. Chips that send
// the enum spelling exactly are the opposite of that defect — they are the
// only answer that CAN match — so the branch now asserts four enum chips and
// still forbids an <input>.
describe('D2: the relationship is answered here, as the enum, never as free text', () => {
  const branchOf = () => {
    const start = WEB.indexOf("q.field === 'relationship'")
    const end = WEB.indexOf(') : (', start)
    return WEB.slice(start, end)
  }

  it('offers the four enum answers on the card itself', () => {
    const branch = branchOf()
    for (const v of ['OWN_PRODUCT', 'AFFILIATE', 'SPONSOR', 'REVIEW_ONLY']) {
      expect(branch).toContain(`'${v}'`)
    }
  })

  it('is not a link away to a page that cannot answer it', () => {
    // The dead end, by name. A button whose only effect is navigation cannot
    // satisfy the gate that rendered it.
    expect(branchOf()).not.toMatch(/nav\('\/products'\)/)
    expect(branchOf()).not.toMatch(/Open Product Library/)
  })

  it('never renders a free-text input for it', () => {
    expect(branchOf()).not.toMatch(/<input/)
  })

  it('the relationship branch sits before the generic free-text input in the renderer', () => {
    const rel = WEB.indexOf("q.field === 'relationship'")
    const genericInput = WEB.indexOf('placeholder="Your answer"')
    expect(rel).toBeGreaterThan(-1)
    expect(genericInput).toBeGreaterThan(-1)
    expect(rel).toBeLessThan(genericInput)
  })

  it('answers with the enum value, not the label', () => {
    // `answer(q.field, value)` with `value` from the enum tuple — the one
    // spelling `READINESS_RELATIONSHIPS` accepts on the server.
    expect(branchOf()).toMatch(/answer\(q\.field, active \? '' : value\)/)
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

  // ⚠️ RE-PINNED 2026-09-14. "Prefers a name match" was always right; "then the
  // sole answered entity" was the wrong MECHANISM for it. Counting answered
  // products made two products that AGREED resolve to null, and null means
  // readiness reports `relationship` as MISSING_REQUIRED — the ask whose only
  // action is "Open Product Library to set it →", a page where it is already
  // set. Measured on production per voice: 11 voices had exactly one answered
  // product (fine), 3 had several that were UNANIMOUS (dead-ended by the count),
  // 2 genuinely disagreed (null is correct there). The 3 + 2 are the owner's
  // five accounts on which the commercial path was dead.
  //
  // ⚖️ SO IT PINS UNANIMITY, NOT COUNT, and still pins the name match first.
  it('libraryRelationship prefers a name match, then a unanimous answer', () => {
    expect(WEB).toMatch(/function libraryRelationship\(/)
    const body = WEB.slice(WEB.indexOf('function libraryRelationship('))
    const fn = body.slice(0, body.indexOf('\n}\n'))
    // The name match must come first and must return before the fallback.
    const nameHit = fn.indexOf('answered.find(')
    const unanimous = fn.indexOf('distinct.size === 1')
    expect(nameHit, 'the offer-name match is gone').toBeGreaterThan(-1)
    expect(unanimous, 'the fallback no longer tests unanimity').toBeGreaterThan(-1)
    expect(nameHit).toBeLessThan(unanimous)
    expect(fn).toMatch(/new Set\(answered\.map\(\(p\) => p\.relationship\)\)/)
    // The count check is the defect. It must not come back.
    //
    // ⚠️ STRIP WHOLE-LINE COMMENTS FIRST. The fix's own comment QUOTES the
    // defect it replaced, so a raw grep finds the count check in the prose
    // explaining why the count check is wrong — a guard reporting success on
    // the very thing it exists to catch, inverted.
    const code = fn.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
    expect(code).not.toMatch(/answered\.length === 1/)
    expect(code).toMatch(/distinct\.size === 1/)
  })
})

describe('D2: the server gate prefers the entity over a typed answer', () => {
  // ⚠️ RE-PINNED 2026-09-22: A TERM WAS ADDED, AND IT IS THE FIX. The client
  // resolved unanimous products (`libraryRelationship`) and this copy did not,
  // so the card passed and the server refused with the same question. The
  // order is the claim: entity first, typed answer last.
  it('readyRel reads the entity, the library, unanimity, brief.promotes, then the typed answer last', () => {
    const at = EDGE.indexOf('const readyRel =')
    const expr = EDGE.slice(at, EDGE.indexOf('\n', EDGE.indexOf('\n', at) + 1))
    const order = ['ownedEntity?.relationship', 'readyLibraryRel', 'readyUnanimousRel', 'brief.promotes', 'answers.relationship']
    const idx = order.map((t) => expr.indexOf(t))
    for (const [i, t] of order.entries()) expect(idx[i], `${t} missing`).toBeGreaterThan(-1)
    for (let i = 1; i < idx.length; i++) expect(idx[i - 1]).toBeLessThan(idx[i])
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
