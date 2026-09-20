// THE SUGGESTER DECIDED ON TWO FIELDS THE LOADER NEVER FETCHED.
//
// ⚠️⚠️ `fillsExpensiveLesson` returns null unless `item.cost` is recorded, and
// `fillsContrarian` returns null unless `item.consensus` is. Neither column was
// in `loadExtractedKnowledge`'s select, so both read `undefined` on every row
// and NEITHER SLOT COULD EVER SUGGEST ANYTHING — whatever the creator had said
// on camera. Only `best_result` ever fired, because it reads `text`.
//
// ⚠️ AND IT TYPECHECKED. `StoredKnowledgeItem` declares both as OPTIONAL,
// because a row genuinely may not have them — so a loader that never asks for
// them is indistinguishable to the compiler from one whose rows are empty. A
// type cannot catch this; a test that names the two columns can.
//
// ⚖️ MEASURED ON THE REAL STORE 2026-09-20: of 40 voices with usable knowledge,
// 19 hold an opinion carrying a named consensus and 5 hold an experience
// carrying a cost. All 24 saw three blank boxes.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { suggestStoryAnswers } from '@twinai/shared'
import { CREATOR_QUESTIONS } from '@twinai/shared'

const HERE = dirname(fileURLToPath(import.meta.url))
const LOADER = readFileSync(join(HERE, 'creatorAnswers.ts'), 'utf8')
const SCREEN = readFileSync(join(HERE, '..', 'components', 'StoryInterview.tsx'), 'utf8')

/** The exact select the loader sends. */
function selectList(): string {
  const i = LOADER.indexOf('export async function loadExtractedKnowledge')
  const m = /\.select\('([^']+)'\)/.exec(LOADER.slice(i))
  expect(m).not.toBeNull()
  return m![1]
}

describe('the loader asks for the fields the suggester decides on', () => {
  for (const col of ['cost', 'consensus']) {
    it(`selects \`${col}\`, without which one slot is permanently blank`, () => {
      expect(selectList().split(/\s*,\s*/)).toContain(col)
    })
  }

  it('still selects what the other slots and the confirm path need', () => {
    const cols = selectList().split(/\s*,\s*/)
    for (const col of ['id', 'kind', 'text', 'basis', 'source', 'source_ref', 'creator_confirmed_at']) {
      expect(cols).toContain(col)
    }
  })
})

describe('the two slots can now actually fill', () => {
  const three = CREATOR_QUESTIONS.filter((q) => ['expensive_lesson', 'contrarian', 'best_result'].includes(q.id))

  it('an experience carrying a cost fills the expensive-lesson box', () => {
    const got = suggestStoryAnswers(three, [{
      id: '1', kind: 'experience', basis: 'stated', source: 'transcript',
      text: 'I poured a whole batch into untested tins',
      cost: 'about 200 dollars of wax and tins',
    }])
    expect(got.expensive_lesson?.[0]?.text).toContain('it cost')
  })

  it('and WITHOUT the column it is silent — the exact bug, pinned', () => {
    // The same row with `cost` dropped, which is what the old select produced.
    const got = suggestStoryAnswers(three, [{
      id: '1', kind: 'experience', basis: 'stated', source: 'transcript',
      text: 'I poured a whole batch into untested tins',
    }])
    expect(got.expensive_lesson ?? []).toEqual([])
  })

  it('an opinion carrying a consensus fills the contrarian box, in the asked order', () => {
    const got = suggestStoryAnswers(three, [{
      id: '2', kind: 'opinion', basis: 'stated', source: 'transcript',
      text: 'a slow cold throw carries through the whole room',
      consensus: 'a candle should hit you the moment you walk in',
    }])
    const line = got.contrarian?.[0]?.text ?? ''
    // The question asks for what THEY believe, then what she believes instead.
    expect(line.indexOf('Most people think')).toBe(0)
    expect(line.indexOf('a candle should hit you')).toBeLessThan(line.indexOf('a slow cold throw'))
  })

  it('and WITHOUT the column it is silent', () => {
    const got = suggestStoryAnswers(three, [{
      id: '2', kind: 'opinion', basis: 'stated', source: 'transcript',
      text: 'a slow cold throw carries through the whole room',
    }])
    expect(got.contrarian ?? []).toEqual([])
  })
})

describe('a suggestion never comes from another creator in the same account', () => {
  it('the screen scopes the read to its voice', () => {
    // ⚠️ ONE OWNER HOLDS TEN VOICES IN PRODUCTION. Offering a stranger's
    // sentence back as "you said this" is the worst thing this screen could do.
    expect(SCREEN).toMatch(/loadExtractedKnowledge\(voiceId\)/)
    expect(LOADER).toMatch(/voiceId: string \| null = null/)
  })

  it('keeps UNATTRIBUTED rows, because null is not foreign', () => {
    // Mirrors 0220's rule for transcripts: a row written before `voice_id`
    // existed is unattributed, not somebody else's.
    expect(LOADER).toMatch(/!r\.voice_id \|\| r\.voice_id === voiceId/)
  })

  it('degrades instead of costing every suggestion on an old store', () => {
    // An unknown column rejects the WHOLE select (PGRST204/42703).
    expect(LOADER).toMatch(/cost\|consensus\|voice_id/)
  })
})
