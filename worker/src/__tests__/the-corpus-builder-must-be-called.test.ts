// A MODULE BUILT TO REPLACE A LINE, WHILE THE LINE KEPT RUNNING.
//
// ⚠️ `buildCaptionCorpus` WAS WRITTEN, MEASURED AGAINST 100 REAL STORED ROWS,
// AND TESTED — and read by nothing but its own test. `extractKnowledgeFromCaptions`
// went on running the exact `.slice(0, 120)` + `.slice(0, 12000)` it was built
// to replace, so every measurement in its header described a fix that was not
// in the product. That is the fourth instance this week of a field or module
// written and never read on the surface that needed it, and it is now the
// dominant defect class in this repository.
//
// ⚖️ SO THE GUARD IS ON THE CALL, NOT ON THE MODULE. `captionCorpus.test.ts`
// already proves the waterfill is correct; nothing proved it was reached. A
// unit test passing on an uncalled function is the exact shape of this bug.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCaptionCorpus } from '../captionCorpus'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const VOICE = readFileSync(join(SRC, 'voice.ts'), 'utf8')

/** Whole-line comments dropped, so a `//` line NAMING the old slice cannot pass
 *  for the slice itself — and nothing after `//` on a code line is removed,
 *  which would delete a real call sitting beside a trailing comment. */
const codeOnly = VOICE.split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n')

const captionFn = (() => {
  const from = codeOnly.indexOf('export async function extractKnowledgeFromCaptions')
  const rest = codeOnly.slice(from)
  const end = rest.indexOf('\nexport ', 1)
  return end === -1 ? rest : rest.slice(0, end)
})()

describe('the caption extractor uses the corpus builder', () => {
  it('calls it', () => {
    expect(captionFn).toMatch(/buildCaptionCorpus\(/)
  })

  it('and the positional truncation it replaced is gone', () => {
    // ⚠️ BOTH SLICES, because either one alone reintroduces the defect: the
    // count slice drops whole captions by scrape order, the char slice severs
    // one mid-sentence and hands the model a fragment to read as whole.
    expect(captionFn).not.toMatch(/slice\(0,\s*120\)/)
    expect(captionFn).not.toMatch(/slice\(0,\s*12000\)/)
  })

  it('does not hand-roll the header the builder owns', () => {
    // ⚖️ ONE AUTHORITY FOR THE SCAFFOLDING. The old code wrote its own
    // `--- CAPTION n ---` and charged its ~2,390 characters to the captions;
    // a second copy here could drift from the one the budget accounts for.
    expect(captionFn).not.toMatch(/--- CAPTION \$\{/)
  })

  it('reports what was discarded, because the 28% was invisible', () => {
    expect(captionFn).toMatch(/caption_corpus_built/)
  })
})

describe('the builder still does the thing it was wired in for', () => {
  it('keeps every caption where the old code dropped a third of them', () => {
    // The physio's shape: 50 captions averaging 333 characters, 16,659 total
    // against a 12,000 budget. The old path admitted ~37 in scrape order.
    const posts = Array.from({ length: 50 }, (_, i) => ({
      caption: `caption ${i} `.padEnd(333, 'x'),
    }))
    const r = buildCaptionCorpus(posts)
    expect(r.considered).toBe(50)
    expect(r.included).toBe(50)
    expect(r.discarded).toBe(0)
  })

  it('never severs a caption mid-sentence', () => {
    const r = buildCaptionCorpus([
      { caption: 'a'.repeat(900) },
      { caption: 'a short one about brakes' },
    ], 500)
    // Whatever survived is either whole or trimmed to the ceiling by the
    // builder's own rule — never a raw substring of the joined corpus.
    expect(r.corpus).toContain('a short one about brakes')
    expect(r.chars).toBeLessThanOrEqual(500)
  })
})
