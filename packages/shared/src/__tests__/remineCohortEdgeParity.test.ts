// THE EDGE COPY OF THE COHORT RULE, EXECUTED RATHER THAN READ.
//
// ⚖️ THE PATTERN IS `freshnessEdgeParity.test.ts`'s, for the same reason. The
// owner console is Deno and cannot import @twinai/shared, so the rule is
// necessarily mirrored; a textual comparison would pass a mirror that sorted
// NULL to the END, or that treated a version above current as stale. Both copies
// are run over the same rows and compared.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { remineCohort } from '../knowledgeExtractorVersion'
import type { ExtractorStampedRow } from '../knowledgeExtractorVersion'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/owner-console/index.ts'), 'utf8')

const START = '// ── WHICH EXTRACTOR WROTE THE STORE, INLINED ─'
const END = '// ── END REMINE COHORT ─'

function loadInline() {
  const a = EDGE.indexOf(START)
  expect(a, 'cohort block start marker missing — restore it, do not delete it').toBeGreaterThan(-1)
  const b = EDGE.indexOf(END, a)
  expect(b, 'cohort block END marker missing — restore it').toBeGreaterThan(a)
  const js = transformSync(EDGE.slice(a, b), { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return remineCohortInline`)() as (
    rows: Array<{ voice_id: string | null; extractor_version: number | null }>,
    current: number,
  ) => ReturnType<typeof remineCohort>
}

/** ⚠️ THE CASES ARE THE BOUNDARIES, not a happy path. Above/at/below current, a
 *  mixed voice, an unstamped voice, a voiceless row, and a store where nothing
 *  is stamped at all — the day 0214 lands. */
const CASES: Array<Array<[string | null, number | null]>> = [
  [],
  [['a', null]],
  [['a', 1]],
  [['a', 2]],
  [['a', 3]],
  [['a', 1], ['a', 2], ['a', 2]],
  [['a', 1], ['b', null], ['c', 2]],
  [['a', null], ['a', 1]],
  [[null, null], ['a', 1]],
  [['a', null], ['b', null], ['c', null]],
  [['a', 1], ['a', 1], ['b', 1]],
]

describe('the owner console computes the same cohort as the shared rule', () => {
  const inline = loadInline()

  it('agrees on every case, at every current version', () => {
    let compared = 0
    for (const rows of CASES) {
      for (const current of [1, 2, 3]) {
        const shared = remineCohort(
          rows.map(([voiceId, extractorVersion]) => ({ voiceId, extractorVersion } as ExtractorStampedRow)),
          current,
        )
        const edge = inline(
          rows.map(([voice_id, extractor_version]) => ({ voice_id, extractor_version })),
          current,
        )
        expect(edge, `drift on ${JSON.stringify(rows)} at v${current}`).toEqual(shared)
        compared++
      }
    }
    // ⚠️ THE COMPARISON COUNT IS ASSERTED so a refactor that empties CASES
    // cannot leave a green test that compares nothing — the shape that made two
    // tests in this repo pass for the wrong reason.
    expect(compared).toBe(CASES.length * 3)
  })
})
