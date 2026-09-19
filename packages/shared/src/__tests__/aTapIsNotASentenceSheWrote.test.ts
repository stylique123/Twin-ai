// "THE QUESTIONS ARE CLEARLY RELEVANT AND I DON'T KNOW WHAT TO PUT IN THEM."
//
// ⚠️ THAT IS CREATOR FEEDBACK ON THE STORY SCREEN, AND IT IS NOT A WORDING
// PROBLEM. Answering means searching a blank page cold, which is a recall task.
// Recognition is the fix, and `suggestStoryAnswers` already built it — the
// reason it does not help is that it is STARVED, not broken:
// `fillsContrarian` needs a recorded `consensus`, and the module's own comment
// records that 129 of 129 stored opinions have none. The supply, not the screen,
// is what Track A (#931) changes.
//
// These tests cover the two things that are fixable in the screen itself — more
// than one candidate, and her own sentence under it — and the provenance the
// suggestion path makes necessary.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  suggestStoryAnswers, suggestStoryAnswerOptions, MAX_SUGGESTIONS_PER_SLOT,
} from '../storySuggestions'
import type { StoredKnowledgeItem } from '../storySuggestions'
import { CREATOR_QUESTIONS, OPENING_THREE } from '../creatorQuestions'
import { selectSpeakable, wasConfirmed, ASKED_FLOOR } from '../knowledgeSelection'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const MIGRATION = readFileSync(
  join(REPO, 'supabase/migrations/0217_a_tap_is_not_a_sentence_she_wrote.sql'), 'utf8')

const QS = CREATOR_QUESTIONS.filter((q) => OPENING_THREE.includes(q.id))
const opinion = (text: string, consensus: string, evidence?: string): StoredKnowledgeItem =>
  ({ kind: 'opinion', text, consensus, evidence: evidence ?? null, basis: 'stated', source: 'transcript' })

describe('recognition gets more than one shot', () => {
  it('offers several candidates for a slot that has them', () => {
    const items = [
      opinion('Hide glue is the only glue worth using.', 'PVA is fine for a rebind'),
      opinion('A rebind should outlive its owner.', 'a Bible is a five-year purchase'),
      opinion('Cheap leather is the false economy.', 'leather grade barely matters'),
      opinion('Sewn beats glued every time.', 'perfect binding is good enough'),
    ]
    const all = suggestStoryAnswerOptions(QS, items)
    expect(all.contrarian.length).toBe(MAX_SUGGESTIONS_PER_SLOT)
    // ⚠️ AND IT IS BOUNDED. Past three, choosing is its own chore and the screen
    // becomes the reading task this change exists to leave.
    expect(MAX_SUGGESTIONS_PER_SLOT).toBe(3)
  })

  it('the single-suggestion API is the HEAD of that list, not a second rule', () => {
    // ⚖️ Two places deciding "is this offerable" is how the card and the
    // alternatives start disagreeing about the same row.
    const items = [
      opinion('Hide glue is the only glue worth using.', 'PVA is fine for a rebind'),
      opinion('Sewn beats glued every time.', 'perfect binding is good enough'),
    ]
    expect(suggestStoryAnswers(QS, items).contrarian)
      .toEqual(suggestStoryAnswerOptions(QS, items).contrarian[0])
  })

  it('does not offer the same line twice', () => {
    // Paraphrase merging collapses re-wordings, not every restatement, and one
    // line offered twice makes a choice look like a bug.
    const dup = opinion('Hide glue is the only glue worth using.', 'PVA is fine for a rebind')
    expect(suggestStoryAnswerOptions(QS, [dup, { ...dup }]).contrarian).toHaveLength(1)
  })

  it('a slot with nothing offerable stays a blank box', () => {
    // ⚠️ THE DEFAULT PATH FOR EVERY CREATOR TODAY, and it must not become a
    // branch somebody has to remember to write.
    const bare: StoredKnowledgeItem =
      { kind: 'opinion', text: 'Chai beats coffee.', consensus: null, basis: 'stated', source: 'transcript' }
    expect(suggestStoryAnswerOptions(QS, [bare]).contrarian).toBeUndefined()
    expect(suggestStoryAnswers(QS, [bare]).contrarian).toBeUndefined()
  })
})

describe('her own sentence rides with the suggestion', () => {
  it('carries the evidence when the row has one', () => {
    const withEv = opinion(
      'Hide glue is the only glue worth using.', 'PVA is fine for a rebind',
      'I stopped using PVA after a customer sent one back inside a year.')
    const s = suggestStoryAnswerOptions(QS, [withEv]).contrarian[0]
    expect(s.evidence).toContain('sent one back inside a year')
  })

  it('omits it when nothing was recorded, rather than inventing one', () => {
    // Absent on every row written before 0215, and on every caption row.
    const s = suggestStoryAnswerOptions(QS, [opinion('A.', 'B')]).contrarian[0]
    expect(s.evidence).toBeUndefined()
  })

  it('the evidence is NEVER what gets stored — only the distillate is', () => {
    // ⚠️ Storing the quotation would put a sentence in a field the writer may
    // put in her mouth. The card shows it; `text` is what confirm writes.
    const withEv = opinion('A short stance.', 'the common belief', 'The raw sentence she said.')
    const s = suggestStoryAnswerOptions(QS, [withEv]).contrarian[0]
    expect(s.text).not.toContain('The raw sentence she said.')
  })
})

describe('a tap is not a sentence she wrote', () => {
  const asked = (text: string, mode: string | null) =>
    ({ kind: 'opinion', text, basis: 'stated', source: 'asked', answer_mode: mode })

  it('typed answers take the reserved slots before confirmed ones', () => {
    // ⚖️ Both are answers; they are not equally hers. The writer may put an
    // `asked` row in her mouth, so the ones she authored outright go first.
    const out = selectSpeakable(
      [asked('confirmed one', 'confirmed'), asked('typed one', 'typed')], 6, 6)
    expect(out[0].text).toBe('typed one')
  })

  it('a NULL answer_mode sorts with typed, because that is what it was', () => {
    // ⚠️ Every answer collected before 0217 came from a textarea. Guessing the
    // other way would demote every answer this product has ever taken.
    expect(wasConfirmed(asked('x', null))).toBe(false)
    const out = selectSpeakable([asked('confirmed one', 'confirmed'), asked('old one', null)], 6, 6)
    expect(out[0].text).toBe('old one')
  })

  it('a confirmed answer is still promoted over a caption row', () => {
    // It is weaker than typed and far stronger than material she never saw.
    const caption = { kind: 'claim', text: 'a caption row', basis: 'demonstrated', source: 'caption' }
    const out = selectSpeakable(
      [caption, ...Array.from({ length: 8 }, (_, i) => ({ kind: 'claim', text: `t${i}`, basis: 'stated', source: 'transcript' })), asked('confirmed one', 'confirmed')],
      ASKED_FLOOR, ASKED_FLOOR)
    expect(out.map((i) => i.text)).toContain('confirmed one')
  })
})

describe('the column is honest, and cannot cost an answer', () => {
  it('is nullable with no backfill', () => {
    expect(MIGRATION).toMatch(/add column if not exists answer_mode text/)
    expect(MIGRATION).not.toMatch(/update public\.creator_knowledge\s+set answer_mode/i)
  })

  it('is a separate column, not a new `source` value', () => {
    // ⚠️ 0189 records what that costs: `source` carries a CHECK, `asked` was
    // missing from it, and twelve real answers were marked taken and stored
    // nowhere while the insert failed.
    expect(MIGRATION).not.toMatch(/creator_knowledge_source_check/)
    expect(MIGRATION).toMatch(/answer_mode in \('typed', 'confirmed'\)/)
  })

  it('grants the client the column it writes', () => {
    expect(MIGRATION).toMatch(/grant insert \(answer_mode\) on public\.creator_knowledge to authenticated/)
  })

  it('an unapplied migration loses the mode and never the answer', () => {
    // ⚠️⚠️ THE 0189 SHAPE EXACTLY. A client insert naming an unknown column is
    // rejected WHOLE, so shipping this naively would make every story answer
    // fail to store.
    const ANSWERS = readFileSync(join(REPO, 'apps/web/src/lib/creatorAnswers.ts'), 'utf8')
    expect(ANSWERS).toMatch(/function isUnknownColumn/)
    expect(ANSWERS).toMatch(/const \{ answer_mode: _dropped, \.\.\.withoutMode \} = row/)
    expect(ANSWERS).toMatch(/event: 'answer_mode_not_recorded'/)
  })

  it('the edge selects it and mirrors the ordering', () => {
    expect(EDGE).toMatch(/const KNOWLEDGE_COLS_FULL =\s*'[^']*answer_mode'/)
    expect(EDGE).toMatch(/const isConfirmed = \(i: T\) =>/)
  })
})
