// ONE FIXED QUESTION PER OBJECTIVE MEANT NOTHING NEW EVER ARRIVED.
//
// Pins the pool, the rotation, the source_ref that carries the id, the edge's
// inlined copy (EXECUTED, not grepped), and the writer-prompt line that marks
// the answer as fresh material preferred over older stored stories.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'
import {
  OBJECTIVE_QUESTION_POOLS, OBJECTIVE_QUESTIONS, PRODUCT_OBJECTIVES, VIDEO_GOALS,
  nextObjectiveQuestion, answeredForProduct, objectiveSourceRef, parseObjectiveSourceRef,
  objectivePool, pooledWording, pooledQuestionById, OBJECTIVE_QUESTION_ID_PATTERN,
  OBJECTIVE_SOURCE_REF_PREFIX, objectiveQuestion,
} from '../index'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('every objective has a pool of related-but-different questions', () => {
  it('covers every goal, including every product objective, with 4–6 questions', () => {
    for (const g of VIDEO_GOALS) {
      const pool = OBJECTIVE_QUESTION_POOLS[g]
      expect(pool.length, g).toBeGreaterThanOrEqual(4)
      expect(pool.length, g).toBeLessThanOrEqual(6)
    }
    for (const o of PRODUCT_OBJECTIVES) expect(objectivePool(o.value).length).toBeGreaterThanOrEqual(4)
  })

  it('the first question of each pool is the original wording, so nothing regresses', () => {
    for (const g of VIDEO_GOALS) {
      const first = OBJECTIVE_QUESTION_POOLS[g][0]
      expect(first.question).toBe(OBJECTIVE_QUESTIONS[g]!.question)
      expect(pooledWording(first, 'performed')).toBe(objectiveQuestion(g, 'performed'))
    }
  })

  it('ids are unique, well-formed and prefixed by their objective; no question repeats anywhere', () => {
    const ids = new Set<string>()
    const words = new Set<string>()
    for (const g of VIDEO_GOALS) {
      for (const q of OBJECTIVE_QUESTION_POOLS[g]) {
        expect(q.id).toMatch(OBJECTIVE_QUESTION_ID_PATTERN)
        expect(q.id.startsWith(`${g}.`)).toBe(true)
        expect(ids.has(q.id)).toBe(false)
        expect(words.has(q.question)).toBe(false)
        ids.add(q.id); words.add(q.question)
        expect(pooledQuestionById(q.id)).toBe(q)
      }
    }
  })
})

describe('rotation per creator + product + objective', () => {
  const pool = OBJECTIVE_QUESTION_POOLS.sell

  it('with nothing answered, asks the first question', () => {
    expect(nextObjectiveQuestion('sell', [])?.id).toBe(pool[0].id)
  })

  it('asks the next question she has NOT answered', () => {
    const answered = [{ questionId: pool[0].id, at: '2026-09-01T00:00:00Z' },
      { questionId: pool[2].id, at: '2026-09-02T00:00:00Z' }]
    expect(nextObjectiveQuestion('sell', answered)?.id).toBe(pool[1].id)
  })

  it('when all are answered, cycles to the least-recently answered', () => {
    const answered = pool.map((p, i) => ({ questionId: p.id, at: `2026-09-${String(10 + i).padStart(2, '0')}T00:00:00Z` }))
    // pool[3] answered earliest of all by a later re-answer of every other one
    answered.push({ questionId: pool[0].id, at: '2026-09-20T00:00:00Z' })
    answered[3] = { questionId: pool[3].id, at: '2026-08-01T00:00:00Z' }
    expect(nextObjectiveQuestion('sell', answered)?.id).toBe(pool[3].id)
  })

  it('a re-answered question counts by its MOST RECENT answer', () => {
    const answered = pool.map((p) => ({ questionId: p.id, at: '2026-09-10T00:00:00Z' }))
    answered.push({ questionId: pool[0].id, at: '2026-09-01T00:00:00Z' }) // older duplicate
    answered.push({ questionId: pool[1].id, at: '2026-09-01T00:00:00Z' })
    // everything latest 09-10 → ties → pool order
    expect(nextObjectiveQuestion('sell', answered)?.id).toBe(pool[0].id)
  })

  it('is scoped to the product: answers for another product do not count', () => {
    const rows = [
      { source_ref: objectiveSourceRef('prod-a', pool[0].id), last_observed_at: '2026-09-01T00:00:00Z' },
      { source_ref: objectiveSourceRef('prod-b', pool[1].id), last_observed_at: '2026-09-01T00:00:00Z' },
      { source_ref: 'typed:claims:gen1', last_observed_at: '2026-09-01T00:00:00Z' },
    ]
    expect(nextObjectiveQuestion('sell', answeredForProduct(rows, 'prod-a'))?.id).toBe(pool[1].id)
    expect(nextObjectiveQuestion('sell', answeredForProduct(rows, 'prod-b'))?.id).toBe(pool[0].id)
  })

  it('an objective with no pool returns null', () => {
    expect(nextObjectiveQuestion('nope', [])).toBeNull()
    expect(nextObjectiveQuestion(null, [])).toBeNull()
  })

  it('source_ref round-trips, starts with asked:, and fits the 200-char column check', () => {
    const ref = objectiveSourceRef('brand:0f7c1d6e-1111-2222-3333-444455556666', 'sell.why_now')
    expect(ref.startsWith('asked:')).toBe(true)
    expect(ref.length).toBeLessThanOrEqual(200)
    expect(parseObjectiveSourceRef(ref)).toEqual({ productKey: 'brand:0f7c1d6e-1111-2222-3333-444455556666', questionId: 'sell.why_now' })
    expect(objectiveSourceRef(null, 'sell.why_now')).toBe('asked:objective:none:sell.why_now')
    expect(parseObjectiveSourceRef('asked:keeps_explaining')).toBeNull()
  })
})

// ── THE EDGE'S INLINED COPY, EXECUTED ──────────────────────────────────────
function loadInline() {
  const a = EDGE.indexOf('// ── THE ROTATING OBJECTIVE QUESTION, INLINED')
  const b = EDGE.indexOf('// ── END OBJECTIVE QUESTION', a)
  expect(a, 'inline block missing').toBeGreaterThan(-1)
  expect(b).toBeGreaterThan(a)
  const js = transformSync(EDGE.slice(a, b), { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return { objectiveAnswerInline, freshObjectiveAnswerLine, OBJECTIVE_SOURCE_REF_PREFIX_INLINE, OBJECTIVE_QUESTION_ID_PATTERN_INLINE }`)() as {
    objectiveAnswerInline: (a: Record<string, unknown>) => { questionId: string; question: string; text: string; sourceRef: string } | null
    freshObjectiveAnswerLine: (q: string, a: string) => string
    OBJECTIVE_SOURCE_REF_PREFIX_INLINE: string
    OBJECTIVE_QUESTION_ID_PATTERN_INLINE: RegExp
  }
}

describe('the server stores the answer under its id and feeds it to the writer', () => {
  const inline = loadInline()

  it('the inlined prefix and id pattern equal the shared ones', () => {
    expect(inline.OBJECTIVE_SOURCE_REF_PREFIX_INLINE).toBe(OBJECTIVE_SOURCE_REF_PREFIX)
    expect(inline.OBJECTIVE_QUESTION_ID_PATTERN_INLINE.source).toBe(OBJECTIVE_QUESTION_ID_PATTERN.source)
  })

  it('builds the SAME source_ref the client rotates on', () => {
    const got = inline.objectiveAnswerInline({
      claims: 'I nearly scrapped it when the first batch cracked.',
      objective_question_id: 'sell.almost_stopped',
      objective_question: 'What almost stopped you from launching this?',
      objective_product_key: 'prod-a',
    })
    expect(got?.sourceRef).toBe(objectiveSourceRef('prod-a', 'sell.almost_stopped'))
    expect(parseObjectiveSourceRef(got?.sourceRef)?.questionId).toBe('sell.almost_stopped')
    expect(got?.text).toBe('I nearly scrapped it when the first batch cracked.')
  })

  it('refuses a malformed id or an empty answer, and defaults an odd product key to none', () => {
    expect(inline.objectiveAnswerInline({ claims: 'real answer', objective_question_id: 'DROP TABLE' })).toBeNull()
    expect(inline.objectiveAnswerInline({ claims: '', objective_question_id: 'sell.why_now' })).toBeNull()
    expect(inline.objectiveAnswerInline({ claims: 'real answer', objective_question_id: 'sell.why_now', objective_product_key: 'a b%' })?.sourceRef)
      .toBe('asked:objective:none:sell.why_now')
  })

  it('the insert writes source asked, the source_ref and the question_id', () => {
    const at = EDGE.indexOf('const objectiveAnswer = objectiveAnswerInline(answers)')
    expect(at).toBeGreaterThan(-1)
    const body = EDGE.slice(at, at + 2500)
    expect(body).toMatch(/from\('creator_knowledge'\)\.insert\(/)
    expect(body).toMatch(/source: 'asked'/)
    expect(body).toMatch(/source_ref: objectiveAnswer\.sourceRef/)
    expect(body).toMatch(/question_id: objectiveAnswer\.questionId/)
    expect(body).toMatch(/event: 'objective_answer_stored'/)
  })

  it('reaches the writer prompt as FRESH material preferred over older stored stories', () => {
    const line = inline.freshObjectiveAnswerLine('What almost stopped you from launching this?', 'The first batch cracked.')
    expect(line).toContain('FRESH MATERIAL FOR THIS VIDEO')
    expect(line).toContain('What almost stopped you from launching this?')
    expect(line).toContain('The first batch cracked.')
    expect(line).toMatch(/PREFER it over any older stored story/)
    expect(line).toMatch(/NOT been verified/)
    // and the typed-facts reader actually uses it when an objective answer exists
    expect(EDGE).toMatch(/if \(typedProductFacts !== '' && objectiveAnswer\) \{\n\s+claimLines\.push\(freshObjectiveAnswerLine\(objectiveAnswer\.question, typedProductFacts\)\)/)
  })
})
