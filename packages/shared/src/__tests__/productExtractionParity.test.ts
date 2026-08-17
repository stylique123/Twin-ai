// THE WORKER'S COPY OF THE CLASSIFIER MUST NOT DRIFT.
//
// The worker ships as its own Docker image built from `worker/` alone and has no
// runtime dependency on @twinai/shared — the same arrangement as `scanTarget`,
// `transcriptSelection` and `brandSnapshot`. So `productExtraction.ts` exists
// twice.
//
// ⚠️ AND THIS DRIFT WOULD BE WORSE THAN THE USUAL KIND, BECAUSE THE GRADE IS
// STORED. If the shared side tightens what counts as a measured number and the
// worker's copy does not, the worker writes `trust: 'usable'` onto a claim the
// rest of the system would have held — and that row keeps its grade after the
// deploy that fixed the code. A stale prompt is corrected by redeploying; a
// stale grade sits in the database being trusted.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const SHARED = readFileSync(join(REPO, 'packages/shared/src/productExtraction.ts'), 'utf8')
const WORKER = readFileSync(
  join(REPO, 'worker/src/jobs/productExtractionContract.ts'), 'utf8')

/** The worker file is a header plus a verbatim copy. Strip the header by finding
 *  where the copy starts, rather than by counting lines — a line count would
 *  break the moment someone adds a sentence to the note. */
function body(src: string): string {
  const i = src.indexOf('/** Where an extracted value came from.')
  expect(i, 'could not find the start of the copied body').toBeGreaterThan(-1)
  return src.slice(i).trim()
}

describe('the classifier is byte-identical in both copies', () => {
  it('the worker carries the shared body verbatim', () => {
    // ⚖️ WHOLE-BODY EQUALITY RATHER THAN SPOT CHECKS. Comparing only the two
    // regexes would let a change to `RISKY_FIELDS`, to the `user_confirmed`
    // short-circuit, or to `readExtractedFact`'s degradation rule slip through —
    // and each of those decides whether a claim may be spoken.
    expect(body(WORKER)).toBe(body(SHARED))
  })

  it('the worker copy is marked as a copy, so nobody edits it first', () => {
    expect(WORKER.slice(0, body(WORKER).length ? WORKER.indexOf(body(WORKER)) : 400))
      .toMatch(/MIRROR of `packages\/shared\/src\/productExtraction\.ts`/)
    expect(WORKER).toMatch(/Change the shared file first/)
  })

  it('the job imports the mirror rather than reaching for @twinai/shared', () => {
    // An import that happens to resolve in the monorepo but not in the Docker
    // build is a green test and a broken image.
    const job = readFileSync(join(REPO, 'worker/src/jobs/extractProduct.ts'), 'utf8')
    expect(job).toMatch(/from '\.\/productExtractionContract\.js'/)
    expect(job).not.toMatch(/@twinai\/shared/)
  })
})

describe('the extractor is never asked to grade itself', () => {
  it('the model schema has no trust field', () => {
    // ⚠️ A model that has just read persuasive copy is the worst available judge
    // of whether that copy is persuasive. It reports values; the classifier
    // decides what may be said.
    const job = readFileSync(join(REPO, 'worker/src/jobs/extractProduct.ts'), 'utf8')
    const schema = job.slice(job.indexOf('const SCHEMA'), job.indexOf('const SYSTEM'))
    expect(schema).not.toMatch(/trust/)
    expect(schema).toMatch(/enum: \['name', 'category'/)
  })

  it('every stored fact goes through readExtractedFact', () => {
    const job = readFileSync(join(REPO, 'worker/src/jobs/extractProduct.ts'), 'utf8')
    expect(job).toMatch(/readExtractedFact\(\{/)
    // Nothing may be pushed onto the stored array without being graded.
    expect(job).not.toMatch(/facts\.push\((?!f\))/)
  })

  it('refuses a non-HTTPS URL rather than fetching it', () => {
    // ⚠️ A creator-supplied URL is untrusted input and this process holds
    // service-role credentials. file://, and http:// to a private address, are
    // refused rather than fetched.
    const job = readFileSync(join(REPO, 'worker/src/jobs/extractProduct.ts'), 'utf8')
    expect(job).toMatch(/\^https:\\\/\\\//)
  })

  it('an unreadable page is recorded as EMPTY, never left null', () => {
    // ⚖️ null means "never extracted" and would tell the creator to add a link
    // they already added. `[]` means "we read it and got nothing" — which is
    // what happened, and what they need to know. Same `unset ≠ false` rule.
    const job = readFileSync(join(REPO, 'worker/src/jobs/extractProduct.ts'), 'utf8')
    // ⚠️ THE CONDITION GREW A SECOND CLAUSE AND THE ANCHOR FOLLOWED IT. The
    // branch is now guarded by `&& imagePaths.length === 0`, because an
    // image-only job has no page to read and this branch would otherwise write
    // "we looked and found nothing" without having opened a single photograph.
    // `indexOf` returning -1 made the old anchor slice an empty string, which
    // passes no assertion and would have failed silently the other way round.
    const at = job.indexOf('if ((!text || text.length')
    expect(at, 'could not find the unreadable-page branch').toBeGreaterThan(-1)
    const branch = job.slice(at)
    expect(branch.slice(0, branch.indexOf('return'))).toMatch(/knowledge: \[\]/)
  })
})
