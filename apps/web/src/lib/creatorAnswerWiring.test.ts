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

  // Task 8: the card must render once the whole script has been read, never
  // mid-scene, and always before the shot list starts.
  it('renders no more than once per layout (desktop, mobile)', () => {
    const count = (RESULT.match(/<CreatorQuestionCard \/>/g) ?? []).length
    expect(count).toBe(2) // one for the desktop column, one for the mobile script tab
  })

  it('sits after the script editor and before the shot list, in both layouts', () => {
    for (const cardIndex of allIndexesOf(RESULT, '<CreatorQuestionCard />')) {
      const before = RESULT.slice(0, cardIndex)
      const after = RESULT.slice(cardIndex)
      const lastScriptEditorOpen = before.lastIndexOf('<ScriptEditor')
      const nextShotListHeading = after.indexOf('Shots & extra clips')
      expect(lastScriptEditorOpen).toBeGreaterThan(-1)
      expect(nextShotListHeading).toBeGreaterThan(-1)
      // Nothing else that opens a ScriptEditor or shot list sits closer.
      expect(before.lastIndexOf('Shots & extra clips')).toBeLessThan(lastScriptEditorOpen)
    }
  })
})

function allIndexesOf(haystack: string, needle: string): number[] {
  const out: number[] = []
  let i = haystack.indexOf(needle)
  while (i !== -1) {
    out.push(i)
    i = haystack.indexOf(needle, i + 1)
  }
  return out
}

// ── A QUESTION SHOWN IS NOT A QUESTION REFUSED ───────────────────────────────
//
// ⚠️ MEASURED 2026-08-26: creator_questions_put held 0 rows against 22 creators
// who had generated 41 scripts. 0128 writes on answer or skip only, so that zero
// is equally consistent with "the card never rendered" and with "every creator
// saw it and scrolled past". Nothing could tell them apart, and every fix for the
// first would have been a guess.
describe('an impression is recorded, and it never retires the question', () => {
  const MIG_175 = readFileSync(
    join(HERE, '..', '..', '..', '..',
      'supabase/migrations/0175_a_question_shown_is_not_a_question_refused.sql'), 'utf8')

  it('the schema accepts the third outcome 0128 left room for', () => {
    expect(MIG_175).toMatch(/check \(outcome in \('answered', 'skipped', 'shown'\)\)/)
  })

  it('the card records the impression only once a question exists', () => {
    expect(CARD).toMatch(/if \(q\) void markQuestionShown\(q\.id\)/)
    // ⚠️ NOT ON MOUNT. Every Result page mounts this card, including the ones
    // with nothing to ask; recording there would count impressions that never
    // happened and flatter the denominator.
    expect(CARD).not.toMatch(/markQuestionShown\(\)/)
  })

  // ⚠️ THE ONE THAT WOULD SILENTLY KILL THE FEATURE. `nextQuestion` retires every
  // id handed to it, so a 'shown' row reaching the reader would retire the
  // question the instant it was displayed — each creator asked exactly one
  // question, once, forever, and no error anywhere.
  it('the reader excludes shown, so a displayed question comes back', () => {
    expect(LIB).toMatch(/\.in\('outcome', \['answered', 'skipped'\]\)/)
  })

  it('the impression cannot cost the creator the question', () => {
    // Best-effort by construction: swallowed, returns void.
    expect(LIB).toMatch(/export async function markQuestionShown[\s\S]*?catch \{/)
  })
})
