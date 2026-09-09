// A RECORD KEPT AND NEVER SHOWN ANSWERS A QUESTION NOBODY CAN ASK.
//
// ⚠️ MEASURED IN THE CODE. `generate-blueprint` has written
// `selected_product_id` onto `generation_choices` since migration 0137, the
// owner has a select policy on that table since the same migration, and NOTHING
// in apps/web ever read it back. A creator holding a script about one of their
// three products had to work out which one by reading it.
//
// ⚠️⚠️ THE SURFACE THIS TEST WAS WRITTEN FOR HAS BEEN REPLACED, AND THE
// REPLACEMENT IS STRICTLY BETTER FOR THE THING THIS BRANCH EXISTS TO DO.
// `useProductLine` said "This script is about <name>" and nothing about what
// may be claimed. `ScriptOriginPanel` (#774) states the claim RULES through
// `productChoiceConstraint` — the picker's own words — and keeps them when the
// product has no name, where `useProductLine` returned null and took the
// disclosure notice away with the label. Two answers to one question would have
// put two product sentences on one screen, so one had to go.
//
// ⚖️ WHAT IS LOST IS RECORDED RATHER THAN DROPPED SILENTLY: the old surface
// added "because you picked it for this video" when the creator has more than
// one product. That is a fact about the CHOICE, not about the script, and the
// picker already says it at the moment of choosing.
//
// ⚖️ THE TWO ASSERTIONS BELOW THAT STILL HOLD ARE KEPT, because they are what
// made this test worth having: the edge really does write the column, and a
// FAILED read is not the same as "no product".
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const API = readFileSync(join(REPO, 'packages/shared/src/api.ts'), 'utf8')
const RESULT = readFileSync(join(REPO, 'apps/web/src/pages/Result.tsx'), 'utf8')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const LOADER = readFileSync(join(REPO, 'apps/web/src/lib/scriptOriginLoad.ts'), 'utf8')
const PANEL = readFileSync(join(REPO, 'apps/web/src/components/ScriptOriginPanel.tsx'), 'utf8')
const ORIGIN = readFileSync(join(REPO, 'packages/shared/src/scriptOrigin.ts'), 'utf8')

describe('the row that was written and never read', () => {
  it('the edge still writes it — this reader is not built on a guess', () => {
    // ⚠️ GREP FOR THE WRITER BEFORE BUILDING THE READER. Six entries on this
    // project's watch list have proved stale, each one nearly causing a rebuild
    // of working code; a reader for a column nothing fills is the same waste in
    // the other direction.
    expect(EDGE).toMatch(/selected_product_id: ownedEntity\?\.id \?\? null/)
    expect(EDGE).toMatch(/from\('generation_choices'\)/)
  })

  it('the client reads it back, keyed on the generation', () => {
    // ⚠️ THE READER MOVED, IT DID NOT DISAPPEAR. `loadGenerationProduct` in
    // packages/shared is superseded by `loadScriptProduct`, which fetches the
    // relationship and personal-use the claim rules need rather than the id
    // alone — so the old one would have become an export with only a test for a
    // reader, the defect this repo has found five times this week.
    expect(LOADER).toMatch(/\.from\('generation_choices'\)/)
    expect(LOADER).toMatch(/\.eq\('generation_id', generationId\)/)
    expect(API).not.toMatch(/export async function loadGenerationProduct/)
  })

  it('a failed read is NOT "no product"', () => {
    // ⚠️ ABSENT IS NOT ZERO, AND AN ERROR IS NOT AN ANSWER. Rendering "this
    // script is about nothing" after a network failure asserts something we do
    // not know. Still true, now asserted on the surviving reader.
    expect(LOADER).toMatch(/if \(e1 \|\| !choice\) return null/)
    expect(LOADER).toMatch(/catch \{\s*return null/)
  })

  it('the result screen renders it, and renders nothing when there is none', () => {
    // ⚖️ THROUGH THE PANEL, and asserted as a CALL rather than as prose: a
    // comment naming the component would otherwise pass for rendering it.
    expect(RESULT).toMatch(/<ScriptOriginPanel generationId=\{gen\.id\}/)
    expect(PANEL).toMatch(/\{origin\.product && </)
  })

  it('and it names the claim rules, not just the product', () => {
    // ⚠️ THE REASON THE OLD SURFACE HAD TO GO. This branch exists to make a paid
    // tie undeniable; a line that names the product and stops does not do that.
    // Asserted THROUGH `productChoiceConstraint` so it cannot pass on a
    // hand-written copy of the same words.
    expect(ORIGIN).toMatch(/productChoiceConstraint\(p\.relationship, p\.personalUse\)/)
  })
})
