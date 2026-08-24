// A FREEZE THAT FAILED MUST NOT LEAVE A RUN NOBODY CAN USE OR ESCAPE.
//
// ⚠️ THIS HAPPENED, TO THE OWNER, ON A REAL START. pilot-start writes the run
// row first — carrying sample_digest over the drawn URLs and status 'frozen' —
// then writes the references. The stratum constraint rejected the speech
// cohort's bands, so run 1758052e survived with ZERO reference rows. Every
// later read then computes the digest of nothing and reports "does not match
// its frozen digest. The sample was changed after freeze." Nothing changed the
// sample. It was never written.
//
// ⚠️ AND IT WEDGES THE BUTTON, which is what makes it worse than a bad error
// message: 'frozen' counts as ACTIVE, so the corpse also refuses the next
// Start. The owner could neither label the run nor begin another one.
//
// ⚖️ TWO STATEMENTS, NO TRANSACTION ACROSS THEM. The honest repair for "the
// second one failed" is to undo the first, and to SAY whether that worked
// rather than implying it did.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'supabase', 'functions', 'pilot-start', 'index.ts'),
  'utf8')

/** ⚠️ COMMENTS STRIPPED FIRST — the block added with this fix explains the bug
 *  by quoting the very strings the assertions look for. */
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')

describe('a failed freeze cleans up after itself', () => {
  it('deletes the run it just created', () => {
    const freeze = CODE.indexOf('could not freeze the pilot sample')
    expect(freeze).toBeGreaterThan(-1)
    // The delete must be part of the SAME failure branch, not somewhere else
    // in the file that happens to remove runs.
    const branch = CODE.slice(Math.max(0, freeze - 400), freeze + 400)
    expect(branch).toContain("from('visual_pilot_runs').delete()")
    expect(branch).toContain('.eq(\'id\', run.id)')
  })

  // ⚠️ REPORTING SUCCESS WE DID NOT VERIFY IS THE SAME CLASS OF MISTAKE AS THE
  // BUG ITSELF. A run that could not be removed still blocks the next Start,
  // and the reader is the only one who can clear it.
  it('says whether the cleanup actually worked', () => {
    expect(CODE).toContain('run_removed')
    expect(CODE).toContain('!cleanup')
  })

  it('still reports the id, so a row left behind can be found by hand', () => {
    const freeze = CODE.indexOf('could not freeze the pilot sample')
    expect(CODE.slice(freeze, freeze + 400)).toContain('pilot_run_id: run.id')
  })
})
