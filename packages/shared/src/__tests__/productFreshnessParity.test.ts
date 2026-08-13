// THE MERGE RULES DECIDE WHETHER A CREATOR'S WORK SURVIVES, SO THEY MAY NOT DRIFT.
//
// ⚠️ WHAT THIS COPY PROTECTS. The worker runs `extract_product` and writes the
// `knowledge` JSONB. If its copy of the merge forgets rule 1 — a confirmed fact
// is never dropped — it silently destroys approvals the rest of the system
// believes are safe, and the loss is WRITTEN TO THE DATABASE, so it outlives the
// deploy that caused it. A drift here is not a wrong answer on a screen; it is
// data gone.
//
// ⚖️ WHOLE-BODY EQUALITY, not spot checks — same rule as the extraction mirror
// beside it. Comparing only `SINGLE_VALUED` would let a change to the confirmed
// short-circuit or to the half-life table through, and each of those decides
// something a creator cannot get back.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const SHARED = readFileSync(join(REPO, 'packages/shared/src/productFreshness.ts'), 'utf8')
const WORKER = readFileSync(join(REPO, 'worker/src/jobs/productFreshnessContract.ts'), 'utf8')

/** Source with comments stripped.
 *
 *  ⚠️ A GUARD THAT READS PROSE CHECKS THE WRONG THING, and this one caught
 *  itself doing it: the first version failed because the job's own comment
 *  QUOTES the line it forbids ("this wrote `knowledge: facts`"), and because the
 *  mirror's header explains that the worker has no dependency on
 *  `@twinai/shared`. Both were accurate documentation failing a check about
 *  code. Explaining a defect must not be indistinguishable from committing it —
 *  otherwise the fix is to delete the explanation, which is exactly backwards. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
}

/** The worker file is a header plus a verbatim copy. Found by marker rather than
 *  by line count, which would break the moment the note gains a sentence. */
function body(src: string): string {
  const i = src.indexOf('/** How long a field stays believable')
  expect(i, 'could not find the start of the copied body').toBeGreaterThan(-1)
  return src.slice(i).trim()
}

describe('the merge is byte-identical in both copies', () => {
  it('the worker carries the shared body verbatim', () => {
    expect(body(WORKER)).toBe(body(SHARED))
  })

  it('differs ONLY in the import line, which must point at the sibling mirror', () => {
    // The one legitimate difference: the worker cannot import @twinai/shared, so
    // its type import points at the mirror next to it. Anything else diverging
    // is drift.
    expect(WORKER).toMatch(/from '\.\/productExtractionContract\.js'/)
    expect(SHARED).toMatch(/from '\.\/productExtraction'/)
    expect(code(WORKER)).not.toMatch(/@twinai\/shared/)
  })

  it('is marked as a copy, so nobody edits it first', () => {
    expect(WORKER).toMatch(/MIRROR of `packages\/shared\/src\/productFreshness\.ts`/)
    expect(WORKER).toMatch(/Change the shared file first/)
  })
})

describe('the job merges rather than replacing', () => {
  const JOB = readFileSync(join(REPO, 'worker/src/jobs/extractProduct.ts'), 'utf8')

  it('never writes the raw extraction straight into knowledge again', () => {
    // ⚠️ THE EXACT LINE THAT DESTROYED CONFIRMATIONS:
    //     update({ knowledge: facts, ... })
    // A regression to it is one word long and silent in production.
    expect(code(JOB)).not.toMatch(/knowledge:\s*facts\b/)
    expect(JOB).toMatch(/mergeExtraction\(previous, facts\)/)
    expect(JOB).toMatch(/knowledge,\n/)
  })

  it('reads the previous knowledge before writing', () => {
    // A merge with nothing to merge against is a replace wearing a new name.
    expect(JOB).toMatch(/select\('knowledge'\)/)
    const readAt = JOB.indexOf("select('knowledge')")
    const writeAt = JOB.indexOf('mergeExtraction(')
    expect(readAt).toBeLessThan(writeAt)
  })

  it('honours the stored source rather than recomputing it', () => {
    // ⚠️ RECOMPUTING `source` WOULD ERASE THE CONFIRMATION THE MERGE PROTECTS.
    // `user_confirmed` is a fact about what a person did, not about the page.
    expect(JOB).toMatch(/r\.source === 'user_confirmed'/)
    expect(code(JOB)).not.toMatch(/readExtractedFact\(\{[^}]*source: 'user_confirmed'/)
  })

  it('logs what the refresh actually did', () => {
    // "We re-read the page and nothing moved" and "we re-read it and quietly
    // replaced nine things" must not look the same in the logs.
    expect(JOB).toMatch(/changed: changes\.length/)
    expect(JOB).toMatch(/needs_creator: attention\.length/)
    expect(JOB).toMatch(/read_from_page: facts\.length/)
  })
})
