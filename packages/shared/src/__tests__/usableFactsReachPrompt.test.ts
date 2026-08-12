// ONLY CONFIRMED-OR-SAFE PRODUCT FACTS MAY REACH THE WRITER.
//
// ⚠️ THIS IS THE READER THE WHOLE SPLIT EXISTS FOR. Grading a landing page's
// "clinically proven" as `needs_confirmation` accomplishes nothing if the
// generator then reads every fact regardless. Phase 3a stored the grade; this is
// the check that it is obeyed.
//
// ⚖️ AND THE GRADE IS HONOURED, NOT RECOMPUTED. Re-deciding trust inside
// `generate-blueprint` would put a third copy of the rules in a third place, and
// the copy that ran at extraction time is the one the creator reviewed against.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const API = readFileSync(join(REPO, 'packages/shared/src/api.ts'), 'utf8')

describe('the prompt sees usable facts and nothing else', () => {
  it('selects the knowledge column at all', () => {
    // A filter over a column nobody selected is a filter over undefined.
    const read = EDGE.slice(EDGE.indexOf('const { data: ownedEntity'))
    expect(read.slice(0, read.indexOf('.maybeSingle()'))).toMatch(/knowledge/)
  })

  it('filters on the STORED trust, and only on `usable`', () => {
    const block = EDGE.slice(EDGE.indexOf('const usableProductFacts'))
    expect(block.slice(0, block.indexOf('.map('))).toMatch(/trust\?: unknown \}\)\?\.trust === 'usable'/)
  })

  it('does NOT re-derive trust in the edge', () => {
    // ⚠️ A third copy of the classifier would drift from the two that exist and
    // would re-grade facts a creator already reviewed. The edge consumes a
    // decision; it does not make one.
    expect(EDGE).not.toMatch(/RISKY_FIELDS|extractionTrust|MEASURED\s*=/)
  })

  it('tells the writer that anything unlisted is unverified', () => {
    // ⚖️ SILENCE READS AS "NO CONSTRAINT". Listing the safe facts without saying
    // what their absence means invites the model to fill the gaps itself — the
    // same reason the empty approval list is stated rather than omitted.
    const block = EDGE.slice(EDGE.indexOf('const usableProductFacts'))
    expect(block).toMatch(/NOT listed here is unverified/)
  })

  it('bounds how many facts reach the prompt', () => {
    // A product page can yield dozens; an unbounded list would crowd out the
    // creator's own material, which is the substance this system exists to use.
    expect(EDGE.slice(EDGE.indexOf('const usableProductFacts'))).toMatch(/\.slice\(0, 24\)/)
  })
})

describe('confirmation is the only way a held fact becomes usable', () => {
  it('records WHY it became usable, not just that it did', () => {
    // ⚠️ A fact reading `usable` with a `marketing_copy` source would be
    // indistinguishable from a classifier bug. `user_confirmed` says a person
    // acted.
    const fn = API.slice(API.indexOf('export async function confirmProductFacts'))
    expect(fn).toMatch(/source: 'user_confirmed', trust: 'usable'/)
  })

  it('confirms per fact, never all at once', () => {
    // ⚖️ One tap that approved a dozen claims is the escalation the claim flow
    // already refuses. The signature takes the values to promote.
    expect(API).toMatch(/confirmProductFacts\(\s*entityId: string, values: readonly string\[\],/)
  })

  it('leaves facts the creator did not confirm exactly as they were', () => {
    const fn = API.slice(API.indexOf('export async function confirmProductFacts'))
    expect(fn).toMatch(/if \(!f \|\| !wanted\.has\(f\.value\)\) return raw/)
  })

  it('a stored grade is honoured on read, and junk degrades to held', () => {
    // ⚠️ Recomputing would discard confirmations; degrading junk to `usable`
    // would turn a malformed row into permission.
    const fn = API.slice(API.indexOf('function readStoredFact'))
    expect(fn.slice(0, fn.indexOf('\n}'))).toMatch(/r\.trust === 'usable' \? 'usable' : 'needs_confirmation'/)
  })
})
