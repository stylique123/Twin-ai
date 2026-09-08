// A RECORD KEPT AND NEVER SHOWN ANSWERS A QUESTION NOBODY CAN ASK.
//
// ⚠️ MEASURED IN THE CODE. `generate-blueprint` has written
// `selected_product_id` onto `generation_choices` since migration 0137, the
// owner has a select policy on that table since the same migration, and NOTHING
// in apps/web ever read it back. A creator holding a script about one of their
// three products had to work out which one by reading it.
//
// ⚖️ AND THE "WHY" IS DERIVED, NEVER INVENTED. Whether the product was the
// creator's tap or the only one they own is not stored. It is read off the
// library they still have — one means there was nothing to choose between, more
// than one means they picked — and where that read fails the sentence states
// the product and stops. A reason we cannot support is worse than no reason.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const API = readFileSync(join(REPO, 'packages/shared/src/api.ts'), 'utf8')
const RESULT = readFileSync(join(REPO, 'apps/web/src/pages/Result.tsx'), 'utf8')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('the row that was written and never read', () => {
  it('the edge still writes it — this reader is not built on a guess', () => {
    // ⚠️ GREP FOR THE WRITER BEFORE BUILDING THE READER. Six entries on this
    // project's watch list have proved stale, each one nearly causing a rebuild
    // of working code; a reader for a column nothing fills is the same waste in
    // the other direction.
    expect(EDGE).toMatch(/selected_product_id: ownedEntity\?\.id \?\? null/)
    expect(EDGE).toMatch(/from\('generation_choices'\)/)
  })

  it('the client reads it, keyed on the generation', () => {
    expect(API).toMatch(/export async function loadGenerationProduct/)
    expect(API).toMatch(/\.from\('generation_choices'\)/)
    expect(API).toMatch(/\.eq\('generation_id', generationId\)/)
  })

  it('a failed read is NOT "no product"', () => {
    // ⚠️ ABSENT IS NOT ZERO, AND AN ERROR IS NOT AN ANSWER. Rendering "this
    // script is about nothing" after a network failure asserts something we do
    // not know.
    const fn = API.slice(API.indexOf('export async function loadGenerationProduct'))
    expect(fn.slice(0, 900)).toMatch(/if \(error \|\| !data\) return null/)
  })

  it('the result screen renders it, and renders nothing when there is none', () => {
    expect(RESULT).toMatch(/\{productLine && <p/)
    expect(RESULT).toMatch(/This script is about \$\{name\}\./)
  })

  it('the reason is claimed only when the library supports it', () => {
    // ⚖️ ONE PRODUCT MEANS THERE WAS NOTHING TO CHOOSE BETWEEN, so "because you
    // picked it" would be a claim about a decision the creator never made.
    expect(RESULT).toMatch(/owned <= 1/)
    expect(RESULT).toMatch(/because you picked it for this video/)
    // And a failed library read falls back to the bare sentence.
    expect(RESULT).toMatch(/rows === null \|\| owned <= 1/)
  })
})
