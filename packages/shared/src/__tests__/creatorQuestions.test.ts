import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  ANSWER_MAX, ANSWER_MIN, ASKED_SOURCE, CREATOR_QUESTIONS,
  answerToKnowledge, askedProgress, nextQuestion,
} from '../creatorQuestions'
import { SPOKEN_SOURCES, wasSpoken } from '../knowledgeSelection'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const MIGRATION = readFileSync(join(REPO, 'supabase/migrations/0121_creator_knowledge.sql'), 'utf8')

describe('the bank is usable as knowledge', () => {
  it('has ten questions with unique, stable ids', () => {
    expect(CREATOR_QUESTIONS).toHaveLength(10)
    expect(new Set(CREATOR_QUESTIONS.map((q) => q.id)).size).toBe(10)
  })

  it('only mints kinds the store actually accepts', () => {
    // ⚠️ THE CHECK CONSTRAINT IS THE AUTHORITY. A question minting a kind the
    // schema rejects would fail at insert time, in front of a creator who has
    // just typed a sentence — and the kind list lives in 0121, not here.
    const allowed = MIGRATION.match(/kind in \(([^)]*)\)/)![1]
      .split(',').map((s) => s.trim().replace(/'/g, ''))
    for (const q of CREATOR_QUESTIONS) expect(allowed).toContain(q.kind)
  })

  it('asks for kinds captions provably cannot produce', () => {
    // Caption extraction yielded ZERO opinions and ZERO experiences across the
    // 8-creator corpus. A bank of `topic` questions would duplicate the cheap
    // source and add nothing.
    const kinds = new Set(CREATOR_QUESTIONS.map((q) => q.kind))
    expect(kinds.has('opinion')).toBe(true)
    expect(kinds.has('experience')).toBe(true)
    expect(kinds.has('framework')).toBe(true)
  })
})

describe('an answer becomes a stated row, or is refused with a reason', () => {
  const q = CREATOR_QUESTIONS[0]

  it('marks it stated and asked — the two things that make it rank', () => {
    const r = answerToKnowledge(q, 'Everyone says post daily; I post twice a week and sell more.')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.row.basis).toBe('stated')
    expect(r.row.source).toBe(ASKED_SOURCE)
    expect(r.row.kind).toBe(q.kind)
    expect(r.row.source_ref).toBe(`asked:${q.id}`)
  })

  it('REFUSES an over-long answer rather than truncating it', () => {
    // ⚠️ A SENTENCE CUT AT 240 CAN INVERT ITS OWN MEANING. "I never recommend X
    // unless the client has…" truncated is advice the creator did not give, and
    // a wrong row is worse than a missing one.
    const r = answerToKnowledge(q, 'x'.repeat(ANSWER_MAX + 1))
    expect(r).toEqual({ ok: false, reason: 'too_long' })
  })

  it('respects the schema cap exactly', () => {
    const cap = MIGRATION.match(/length\(btrim\(text\)\) between 1 and (\d+)/)![1]
    expect(Number(cap)).toBe(ANSWER_MAX)
  })

  it('rejects a gesture', () => {
    expect(answerToKnowledge(q, 'consistency')).toEqual({ ok: false, reason: 'too_short' })
    expect(answerToKnowledge(q, '   ')).toEqual({ ok: false, reason: 'empty' })
    expect('x'.repeat(ANSWER_MIN).length).toBe(ANSWER_MIN)
  })

  it('collapses whitespace, because the store holds one sentence', () => {
    const r = answerToKnowledge(q, '  I  charge\nby the outcome,   never by the hour.  ')
    expect(r.ok && r.row.text).toBe('I charge by the outcome, never by the hour.')
  })

  it('does not seed times_seen to make itself rank', () => {
    // `times_seen` means "how many videos carried this". Inflating it would
    // corrupt the field the writer reads as what a creator is KNOWN for.
    const r = answerToKnowledge(q, 'I turn down any client who wants weekly reporting.')
    expect(r.ok && r.row.times_seen).toBe(1)
  })
})

describe('nothing is ever asked twice', () => {
  it('skips everything already put, answered or declined', () => {
    const put = CREATOR_QUESTIONS.slice(0, 3).map((q) => q.id)
    const next = nextQuestion(put)
    expect(next?.id).toBe(CREATOR_QUESTIONS[3].id)
    expect(put).not.toContain(next?.id)
  })

  it('returns null when the bank is exhausted', () => {
    expect(nextQuestion(CREATOR_QUESTIONS.map((q) => q.id))).toBeNull()
  })

  it('opens with the question whose answer changes a script most', () => {
    // ⚖️ ORDER IS FIXED SO A CREATOR WHO ANSWERS ONCE AND NEVER RETURNS HAS
    // STILL GIVEN THE ONE THAT MATTERS. Randomising trades that for variety.
    expect(nextQuestion([])?.id).toBe('contrarian')
  })

  it('counts progress against the CURRENT bank only', () => {
    // A retired id left in the log would otherwise push the count past the total
    // and read as corruption.
    expect(askedProgress(['contrarian', 'a_question_we_removed'])).toEqual({ put: 1, of: 10, remaining: 9 })
  })
})

describe('an answer reaches the writer at all', () => {
  it('counts as spoken material, in shared and at the edge', () => {
    // ⚠️ OTHERWISE IT LOSES ITS SLOT TO A CAPTION. The substance reservation is
    // filled by spoken material first; a stated answer that is not in this set
    // competes on keyword overlap with 374 caption rows.
    expect(SPOKEN_SOURCES.has(ASKED_SOURCE)).toBe(true)
    expect(wasSpoken({ source: ASKED_SOURCE })).toBe(true)
    expect(EDGE).toMatch(/SPOKEN_SOURCES: ReadonlySet<string> = new Set\(\['transcript', 'asked'\]\)/)
  })

  it('is READ, despite ranking last by times_seen', () => {
    // ⚠️ THE DEFECT THAT WOULD HAVE MADE THIS WHOLE CHANNEL DECORATIVE. The
    // knowledge read takes the top 40 by `times_seen` — and an answered question
    // is a 1. On a 374-item caption store, forty rows of 2 and 3 sit above it,
    // so the creator would answer, the row would land, and the writer would
    // never see it: `product_entities` again, complete and unread.
    expect(EDGE).toMatch(/\.eq\('source', 'asked'\)/)
    expect(EDGE).toMatch(/const knowledgeRows = \[\.\.\.\(askedRows \?\? \[\]\), \.\.\.\(rankedRows \?\? \[\]\)\]/)
  })

  it('does not supply the same row twice when both reads return it', () => {
    expect(EDGE).toMatch(/seenKnowledge/)
  })
})
