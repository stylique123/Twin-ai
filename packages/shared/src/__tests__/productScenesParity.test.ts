// THE SHOW MOMENTS MUST NOT DRIFT FROM THE TESTED ONES.
//
// `generate-blueprint` runs on Deno deploy and cannot import @twinai/shared, so
// the scene guidance exists twice: in `packages/shared/src/productScenes.ts`
// where its sixteen tests live, and in `supabase/functions/_shared/` where it
// actually runs.
//
// ⚠️ THE FAILURE THIS PREVENTS is the one this repo keeps catching: a contract
// that passes in tests and does something else in production. Tightening the
// SOMETIMES rule in shared while the edge kept the old beats would leave every
// real generation governed by the version nobody tested.
//
// ⚖️ AND IT COMPARES THE SHIPPED SOURCES RATHER THAN RE-IMPLEMENTING EITHER. A
// paraphrase here would be the same defect one level up. The edge copy is
// generated from the shared file with exactly ONE edit — the import of
// EntityType/Showability becomes a local declaration, because Deno cannot reach
// the package — so everything after the type block must match byte for byte.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(import.meta.dirname, '..', '..', '..', '..')
const SHARED = readFileSync(join(REPO, 'packages/shared/src/productScenes.ts'), 'utf8')
const EDGE = readFileSync(join(REPO, 'supabase/functions/_shared/productScenes.ts'), 'utf8')

/** Everything from the first exported interface onward — i.e. past the header
 *  and past the one place the two files are ALLOWED to differ. */
const body = (src: string) => {
  const at = src.indexOf('export interface ShowMoment')
  if (at < 0) throw new Error('ShowMoment interface not found — the file was restructured')
  return src.slice(at)
}

describe('the edge copy is the shared file, not a retyping of it', () => {
  it('matches byte for byte from the first interface onward', () => {
    expect(body(EDGE)).toBe(body(SHARED))
  })

  // ⚠️ THE ONE PERMITTED DIFFERENCE, PINNED SO IT CANNOT GROW. If someone edits
  // the edge copy's header to add a second local rule, this catches it.
  it('differs only in how the two types arrive', () => {
    expect(SHARED).toContain("import type { EntityType, Showability } from './productEntity'")
    expect(EDGE).not.toContain("from './productEntity'")
    expect(EDGE).toContain('export type Showability =')
  })

  // ⚖️ THE VOCABULARIES MUST AGREE, or the edge would silently take a different
  // branch for a type the shared file classifies differently.
  it('the locally declared types list the same members as the real ones', async () => {
    const { ENTITY_TYPES, SHOWABILITY_STATES } = await import('../productEntity')
    for (const t of ENTITY_TYPES) expect(EDGE, `EntityType ${t}`).toContain(`'${t}'`)
    for (const s of SHOWABILITY_STATES) expect(EDGE, `Showability ${s}`).toContain(`'${s}'`)
  })
})

describe('the blueprint actually calls it', () => {
  const BP = readFileSync(
    join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8',
  )

  // ⚠️ A DECISION LAYER NOTHING CALLS IS THE STATE THIS REPO KEEPS
  // REDISCOVERING — questionRegistry, entityStatus, mayGenerateClaims. This
  // guard exists so productScenes does not join them.
  it('imports and uses the guidance', () => {
    expect(BP).toMatch(/from '\.\.\/_shared\/productScenes\.ts'/)
    expect(BP).toMatch(/productSceneGuidance\(/)
    expect(BP).toMatch(/productSceneDirection\(/)
  })

  // ⚖️ THE OLD ONE-LINE PERMISSION MUST BE GONE, not merely supplemented. Two
  // sources of showing instructions in one prompt is how a writer gets told it
  // may show a product and separately that it may not.
  it('the old single-sentence SHOWING IT line is gone', () => {
    expect(BP).not.toMatch(/SHOWING IT: the creator can put/)
    expect(BP).not.toMatch(/SHOWING IT: the creator can only SOMETIMES put/)
  })
})
