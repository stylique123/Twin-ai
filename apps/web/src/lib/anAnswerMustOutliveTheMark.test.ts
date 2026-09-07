import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const LIB = readFileSync(fileURLToPath(new URL('./creatorAnswers.ts', import.meta.url)), 'utf8')
const MIGRATION = readFileSync(
  fileURLToPath(new URL('../../../../supabase/migrations/0189_asked_was_never_an_allowed_source.sql', import.meta.url)),
  'utf8',
)

// ⚠️ DROP WHOLE-LINE COMMENTS ONLY, never everything after `//` — a real read
// sitting after a string containing "https://" would vanish and the guard would
// stop catching the thing it exists for. This file's sibling guards were bitten
// by exactly that twice.
const codeOnly = (src: string) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
const CODE = codeOnly(LIB)

/**
 * ⚠️⚠️ MEASURED IN PRODUCTION 2026-09-07, and this is the defect frozen here:
 *
 *     creator_questions_put, outcome='answered' ...... 12 rows, 4 creators
 *     creator_knowledge, source='asked' ..............  0 rows
 *
 * Twelve answers typed by four real people. Every one recorded as taken. Not
 * one stored. TWO faults, and it took both:
 *
 *   1. `creator_knowledge_source_check` never listed 'asked', so the insert
 *      failed with SQLSTATE 23514 (proven by executing it, not by reading).
 *   2. the question was marked `answered` BEFORE the insert, so the creator was
 *      never asked again and the loss was silent and permanent.
 */
describe('an answer is saved before the question is marked taken', () => {
  it('the insert appears before markPut(answered) in the source', () => {
    const insertAt = CODE.indexOf("from('creator_knowledge').insert")
    const markAt = CODE.indexOf("markPut(question.id, 'answered')")
    expect(insertAt).toBeGreaterThan(-1)
    expect(markAt).toBeGreaterThan(-1)
    // ⚠️ THIS IS THE ASSERTION THAT FAILS ON THE PREVIOUS SOURCE, where the
    // mark came first and cost four creators twelve sentences.
    expect(insertAt).toBeLessThan(markAt)
  })

  it('a failed insert returns not_saved and does NOT mark the question', () => {
    // The error branch must return before ever reaching the mark.
    const errBranch = CODE.indexOf("reason: 'not_saved' }")
    const markAt = CODE.indexOf("markPut(question.id, 'answered')")
    expect(errBranch).toBeGreaterThan(-1)
    expect(errBranch).toBeLessThan(markAt)
  })
})

// ⚖️ THE CONSTRAINT IS HALF THE FIX AND IT LIVES IN SQL, so this is the only
// place a reader of the client code will find out that the value it writes was
// once rejected by the database.
describe("the database accepts the source this file writes", () => {
  it("0189 adds 'asked' to the allowed sources", () => {
    expect(MIGRATION).toContain('creator_knowledge_source_check')
    expect(MIGRATION).toContain("'asked'")
    // ⚖️ AND KEEPS THE OTHER FOUR — a fix that narrowed the list would silently
    // start rejecting scraped rows, which is 1,088 of them.
    for (const kept of ['caption', 'transcript', 'user', 'previous_video']) {
      expect(MIGRATION, kept).toContain(`'${kept}'`)
    }
  })

  it('is idempotent — droppable and re-addable, per the twice-applied ratchet', () => {
    expect(MIGRATION).toContain('drop constraint if exists')
  })
})
