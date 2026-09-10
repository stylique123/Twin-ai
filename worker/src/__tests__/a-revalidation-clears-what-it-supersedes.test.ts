// A ROW THAT WAS JUDGED TWICE MUST NOT CARRY BOTH VERDICTS.
//
// ⚠️ MEASURED ON PRODUCTION, 2026-09-10. Asset
// 4d2c7f36-5974-4367-901c-b6ca6bbffaf9 was refused `duration_unknown` on
// 2026-08-09, the decode-to-measure fix landed on 2026-08-19, and a
// re-validation on 2026-09-10 took it to `ready` with duration_ms 4736,
// 1920x1080, audio present, linked to its generation. It STILL read
// `metadata.rejection_code: duration_unknown` afterwards, because `reject()`
// merges that key into the same metadata and the success path's patch never
// cleared it.
//
// ⚖️ THIS IS THE STALE-ARTIFACT CLASS. The field was true when written and
// became false when the code moved — the same shape as the 292-video backlog
// and the 9,504 count, both of which went on being read as current long after
// they stopped being true. A wrong fact is worse than a missing one because a
// reader acts on it. STALE FIELDS DO NOT ANNOUNCE THEMSELVES.
//
// ⚠️ WHY THIS IS A SOURCE ASSERTION. `metaPatch` is a local inside
// `handleValidateSource`, which needs a database, a storage download and
// ffprobe to reach. The repository already tests wiring this way where the
// alternative is a mock so large it tests the mock (`dna-run-records-its-stages`
// does the same). It is deliberately written so that DELETING the fix fails it.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'jobs', 'validateSource.ts'), 'utf8')

/** Whole-line comments only — a prose mention must not count as code. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '\n')
    .split('\n')
    .map((l) => (/^\s*\/\//.test(l) ? '' : l))
    .join('\n')
}

const CODE = code(SRC)

describe('the success path clears the judgement it supersedes', () => {
  it('nulls both rejection fields', () => {
    // ⚠️ BOTH, NOT ONE. A cleared code with a surviving detail still tells a
    // reader why this take was refused, in a sentence, on a take that is ready.
    expect(CODE).toMatch(/rejection_code:\s*null/)
    expect(CODE).toMatch(/rejection_detail:\s*null/)
  })

  it('clears them in the patch the READY path actually sends', () => {
    // Not merely somewhere in the file: inside the metaPatch object, which is
    // what `editor_validate_source` and `editor_complete_validation` receive.
    const i = CODE.indexOf('const metaPatch = {')
    expect(i).toBeGreaterThan(-1)
    const obj = CODE.slice(i, CODE.indexOf('\n    }', i))
    expect(obj).toMatch(/rejection_code:\s*null/)
    expect(obj).toMatch(/rejection_detail:\s*null/)
  })

  it('and that patch is what both completion RPCs are given', () => {
    // If a future edit builds a second patch for one branch, the clearing must
    // travel with it — this fails when the branches stop sharing metaPatch.
    expect(CODE).toMatch(/p_probe:\s*metaPatch/)
    expect(CODE).toMatch(/p_meta_patch:\s*metaPatch/)
  })
})

describe('the pair stays coherent', () => {
  it('reject still WRITES what the success path clears', () => {
    // ⚖️ THE TWO SIDES ARE ONE RULE. If `reject` renamed its keys, clearing the
    // old names would silently stop working and this test would still pass on
    // the success side alone. So it asserts the names match.
    const rej = CODE.slice(CODE.indexOf('status: \'rejected\''))
    expect(rej).toMatch(/rejection_code:/)
    expect(rej).toMatch(/rejection_detail:/)
  })

  it('a comment mentioning the fields is not the fix', () => {
    // The guard that greps source must tell a mention from an assignment: this
    // file's own header names both fields in prose, and stripping whole-line
    // comments is what keeps that from counting.
    const proseOnly = code('// rejection_code: null\n// rejection_detail: null\nconst x = 1')
    expect(/rejection_code:\s*null/.test(proseOnly)).toBe(false)
  })
})
