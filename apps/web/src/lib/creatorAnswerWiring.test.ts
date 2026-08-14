// THE THREE WAYS THIS FEATURE TURNS INTO A NAG OR A GHOST.
//
// It has no logic worth unit-testing — it is a form. What can go wrong is at the
// seams, and each failure is silent: a skip that is not stored comes back on the
// next script; a failed read that looks like an empty one re-asks question one;
// an answer stored in the log as well as the store gives two records that can
// disagree about what the creator said.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const LIB = readFileSync(join(HERE, 'creatorAnswers.ts'), 'utf8')
const CARD = readFileSync(join(HERE, '..', 'components', 'CreatorQuestionCard.tsx'), 'utf8')
const RESULT = readFileSync(join(HERE, '..', 'pages', 'Result.tsx'), 'utf8')
const MIGRATION = readFileSync(
  join(HERE, '..', '..', '..', '..', 'supabase/migrations/0128_creator_questions_put.sql'), 'utf8')

describe('a decline is as durable as an answer', () => {
  it('records the skip rather than only hiding the card', () => {
    expect(CARD).toMatch(/await skipQuestion\(question\.id\)/)
    expect(LIB).toMatch(/markPut\(questionId, 'skipped'\)/)
  })

  it('cannot be asked twice even if two tabs race', () => {
    // The never-ask-twice rule is this feature's only defence against being
    // annoying, and a rule living solely in application code is one race from a
    // duplicate.
    expect(MIGRATION).toMatch(/create unique index[\s\S]*?creator_questions_put \(owner_id, question_id\)/)
  })

  it('upserts, so skipping then answering is storable', () => {
    expect(LIB).toMatch(/onConflict: 'owner_id,question_id'/)
  })
})

describe('not-knowing is not nothing', () => {
  it('returns null on a failed read, never an empty list', () => {
    expect(LIB).toMatch(/return null/)
    const fn = LIB.slice(LIB.indexOf('export async function loadQuestionsPut'), LIB.indexOf('export async function skipQuestion'))
    expect(fn).not.toMatch(/return \[\]/)
  })

  it('asks nothing at all when it could not read', () => {
    expect(CARD).toMatch(/if \(!live \|\| put === null\) return/)
  })
})

describe('the answer lands in the store, and only there', () => {
  it('writes creator_knowledge, not the log', () => {
    expect(LIB).toMatch(/from\('creator_knowledge'\)\s*\.insert/)
    // ⚖️ THE LOG RECORDS THAT A QUESTION WAS PUT, NEVER WHAT WAS SAID. Two
    // records of the same sentence can disagree, and the store would lose.
    expect(MIGRATION).not.toMatch(/answer_text|response_text/)
  })

  it('closes the question BEFORE storing the sentence', () => {
    // ⚠️ ORDERING IS DELIBERATE. If the log failed after a successful knowledge
    // write, the creator would be asked a question their own answer already
    // answered — which reads as the product not listening.
    expect(LIB.indexOf("markPut(question.id, 'answered')")).toBeLessThan(LIB.indexOf("from('creator_knowledge')"))
  })

  it('dates it now, so a position stated today is not ranked as ancient', () => {
    expect(LIB).toMatch(/last_observed_at: new Date\(\)\.toISOString\(\)/)
  })
})

describe('it is mounted where a creator actually is', () => {
  it('sits under the script they were just handed', () => {
    // Not on a screen of its own: the Product Library is a complete feature with
    // zero rows because it waits to be visited.
    expect(RESULT).toMatch(/<CreatorQuestionCard \/>/)
  })
})
