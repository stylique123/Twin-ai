// IF IT IS ALL EXTRACTOR MATERIAL, WHERE DOES THE NEXT VIDEO'S MATERIAL COME FROM?
//
// ⚠️⚠️ THAT IS A RUNWAY QUESTION AND IT HAS A SHARP ANSWER. The story screen
// shows back what the scan already heard her say, so she can recognise instead of
// recall. The trap — which a first implementation walked into — is letting a
// confirmation COUNT AS ANSWERING: the row already exists in `creator_knowledge`,
// so confirming adds NO supply, and `creator_questions_put` then guarantees she
// is never asked again. One tap permanently trades the story we do not have for
// a re-label of one we do, and a creator with a rich scan ends up contributing
// nothing at all.
//
// ⚖️ SO THE TWO ACTIONS ARE SEPARATE (0219): confirming marks THAT row and
// leaves the question open; only a new `source = 'asked'` row adds supply. The
// shown material is then worth MORE, not less — it is a memory aid and a
// statement of what not to repeat, which makes "tell me another one" an honest
// question rather than an invitation to repeat what we hold.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { suggestStoryAnswers, MAX_SUGGESTIONS_PER_SLOT } from '../storySuggestions'
import type { StoredKnowledgeItem } from '../storySuggestions'
import { CREATOR_QUESTIONS, OPENING_THREE } from '../creatorQuestions'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const MIGRATION = readFileSync(
  join(REPO, 'supabase/migrations/0219_she_confirmed_what_we_had_she_did_not_answer_the_question.sql'), 'utf8')
const ANSWERS = readFileSync(join(REPO, 'apps/web/src/lib/creatorAnswers.ts'), 'utf8')

const QS = CREATOR_QUESTIONS.filter((q) => OPENING_THREE.includes(q.id))
const stance = (
  id: string, text: string, consensus: string,
  extra: Partial<StoredKnowledgeItem> = {},
): StoredKnowledgeItem =>
  ({ id, kind: 'opinion', text, consensus, basis: 'stated', source: 'transcript', ...extra })

describe('what is shown is everything we already hold, not one candidate', () => {
  it('returns a list per slot, so she can see what not to repeat', () => {
    const rows = [
      stance('a', 'Hide glue is the only glue worth using.', 'PVA is fine for a rebind'),
      stance('b', 'Sewn beats glued every time.', 'perfect binding is good enough'),
    ]
    expect(suggestStoryAnswers(QS, rows).contrarian).toHaveLength(2)
  })

  it('is bounded, so the screen does not become a reading task', () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      stance(`r${i}`, `Stance number ${i} about rebinding books.`, `the common belief ${i}`))
    expect(suggestStoryAnswers(QS, rows).contrarian).toHaveLength(MAX_SUGGESTIONS_PER_SLOT)
  })

  it('carries the row id, because a confirmation marks THAT row', () => {
    const rows = [stance('row-7', 'Hide glue is the only glue.', 'PVA is fine')]
    expect(suggestStoryAnswers(QS, rows).contrarian[0].id).toBe('row-7')
  })

  it('carries her own sentence when one was recorded', () => {
    const rows = [stance('a', 'Hide glue is the only glue.', 'PVA is fine',
      { evidence: 'I stopped using PVA after one came back inside a year.' })]
    expect(suggestStoryAnswers(QS, rows).contrarian[0].evidence).toContain('came back inside a year')
  })

  it('⚠️ never shows a row she has already confirmed', () => {
    // She has told us this one is right. Showing it again spends the one screen
    // where her attention is cheap on a question she has answered, and makes the
    // product look like it was not listening.
    const rows = [stance('a', 'Hide glue is the only glue.', 'PVA is fine',
      { creator_confirmed_at: '2026-09-18T10:00:00Z' })]
    expect(suggestStoryAnswers(QS, rows).contrarian).toBeUndefined()
  })

  it('an empty store shows nothing, and that is the common case', () => {
    expect(suggestStoryAnswers(QS, [])).toEqual({})
  })
})

describe('the column says what it knows and no more', () => {
  it('is nullable, and NULL is not a denial', () => {
    expect(MIGRATION).toMatch(/add column if not exists creator_confirmed_at timestamptz/)
    expect(MIGRATION).toMatch(/NEVER that she denied it/)
  })

  it('does not touch the question ledger', () => {
    // ⚠️ THE WHOLE RUNWAY ARGUMENT. Marking the question answered here is what
    // would end this creator's chance of ever giving us the story.
    // ⚠️ ASSERTED ON THE SQL, NOT THE PROSE. The migration's comment names
    // `creator_questions_put` precisely to explain why it must not be written
    // here; a bare "does not mention it" check would forbid the explanation.
    const sql = MIGRATION.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(sql).not.toMatch(/creator_questions_put/)
    expect(ANSWERS).toMatch(/function confirmExtractedRow/)
    const fn = ANSWERS.slice(ANSWERS.indexOf('export async function confirmExtractedRow'))
    expect(fn.slice(0, fn.indexOf('\n}'))).not.toMatch(/markPut|creator_questions_put/)
  })

  it('is owner-scoped, so one account cannot vouch for another\'s row', () => {
    const fn = ANSWERS.slice(ANSWERS.indexOf('export async function confirmExtractedRow'))
    expect(fn.slice(0, fn.indexOf('\n}'))).toMatch(/\.eq\('owner_id', ownerId\)/)
  })

  it('grants the client the column it writes', () => {
    expect(MIGRATION).toMatch(/grant update \(creator_confirmed_at\) on public\.creator_knowledge to authenticated/)
  })
})

describe('a confirmed row is worth more TO THE WRITER, or the column is decoration', () => {
  it('is marked in the prompt the script is written from', () => {
    // ⚠️ Everything else in that block is a model's reading of her speech. A
    // confirmed row is one she was shown and said yes to, and the writer cannot
    // prefer it if nothing says which rows they are.
    expect(EDGE).toMatch(/she confirmed this herself/)
  })

  it('is selected, or the marker could never appear', () => {
    expect(EDGE).toMatch(/KNOWLEDGE_COLS_FULL = `\$\{KNOWLEDGE_COLS_BASE\}[^`]*creator_confirmed_at`/)
  })

  it('an unapplied 0219 costs the marker and never the knowledge', () => {
    // It joins the WIDE list, so the existing narrow retry covers it with no
    // new branch.
    expect(EDGE).toMatch(/const KNOWLEDGE_COLS_BASE = '[^']*'/)
    expect(/const KNOWLEDGE_COLS_BASE = '([^']*)'/.exec(EDGE)?.[1]).not.toContain('creator_confirmed_at')
  })
})
