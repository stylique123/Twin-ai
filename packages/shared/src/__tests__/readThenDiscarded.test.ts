// A BLOCK THAT WAS BUILT, APPENDED, AND THEN OVERWRITTEN.
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-14: of 1,363 error-free reference profiles,
// 1,277 (93.7%) carry a known `containerType`. 620 of the 666 that have a
// `visual_profile` — 93.1% — had their observed-visual block assembled and then
// destroyed by a plain `containerBlock =` a few lines later. 358 tier-zero
// blocks went the same way.
//
// The frames pass ran. The video download was paid for. The reader existed and
// this repo verified it was wired. The prompt still never saw the answer —
// which is the sharper form of this codebase's dominant defect: not a field
// nothing reads, but a field READ AND THEN THROWN AWAY.
//
// ⚠️ WHOLE-LINE COMMENTS ARE STRIPPED BEFORE MATCHING, because the fix's own
// comment quotes the broken operator while explaining it, and a naive search
// would be satisfied by the explanation rather than the code. Whole lines only,
// never everything after `//`, which would delete real code following a string
// containing a slash.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const CODE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
  .split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n')

const TEMPLATE_LINE = 'THE SHAPE THIS REFERENCE USES'

describe('nothing appended to the reference block is silently dropped', () => {
  it('the container template APPENDS, it does not assign', () => {
    // ⚠️ THE READER-REMOVAL ASSERTION FOR THIS DEFECT. Restore the `=` and this
    // fails; it is the only thing standing between a paid frame pass and a
    // prompt that never sees it.
    const at = CODE.indexOf(TEMPLATE_LINE)
    expect(at).toBeGreaterThan(-1)
    const stmt = CODE.slice(CODE.lastIndexOf('containerBlock', at), at)
    expect(stmt).toContain('containerBlock +=')
    expect(stmt).not.toMatch(/containerBlock\s*=\s*`/)
  })

  it('the observed-visual block is still appended BEFORE the template', () => {
    // Order is not the claim, but the append must exist at all: a fix that
    // deleted the earlier append would make this test pass for the wrong reason.
    // ⚠️ THE SOURCE CONTAINS THE TWO CHARACTERS `\` and `n`, not a newline.
    // The first version of this fixture used a real newline and could not match
    // anything — the test was wrong, not the code.
    const visual = CODE.indexOf('containerBlock += `\\n\\n${visualBlock}')
    expect(visual).toBeGreaterThan(-1)
    expect(visual).toBeLessThan(CODE.indexOf(TEMPLATE_LINE))
  })

  it('the tier-zero block is still appended too', () => {
    expect(CODE).toContain('containerBlock += `\\n\\n${measuredBlock}')
  })

  it('every write to containerBlock after its declaration is an append', () => {
    // ⚠️ THE GENERAL FORM, not just the one site. A future block appended above
    // any new assignment would be destroyed exactly the same way, and this is
    // the assertion that catches the next one rather than this one.
    const decl = CODE.indexOf("let containerBlock = ''")
    expect(decl).toBeGreaterThan(-1)
    const after = CODE.slice(decl + "let containerBlock = ''".length)
    const assignments = after.match(/containerBlock\s*=(?!=)/g) ?? []
    expect(assignments).toEqual([])
  })

  it('the prompt still receives containerBlock', () => {
    // A block preserved into a variable the prompt stopped interpolating would
    // be the same defect wearing a different shape.
    expect(CODE).toMatch(/\$\{containerBlock\}/)
  })
})
