// STORING THE BRIEF — the seam where the three-state rule is most easily lost.
//
// The defect this closes was not subtle and had shipped: `workKind` and
// `forbiddenClaims` were asked in onboarding, written to a localStorage draft,
// and persisted nowhere. A doctor's "never say cure" lived in one browser.
//
// So these tests are about what is allowed to reach the column, and the answer
// is: only real answers. An empty string and an absent key mean the same thing
// to every reader, and storing the empty one creates a state that reads as
// "unanswered" while counting as "answered" to whoever checks for the key.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  BRIEF_STORED_KEYS, sanitizeBriefForWrite, readStoredBrief, type BriefAnswers,
} from '../preScriptBrief'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../..')

describe('only a real answer is stored', () => {
  it('drops an empty box, keeps what was typed', () => {
    expect(sanitizeBriefForWrite({ forbiddenClaims: '   ', offer: 'Twin' }))
      .toEqual({ offer: 'Twin' })
  })

  it('trims, so a stray space cannot become a different answer', () => {
    expect(sanitizeBriefForWrite({ offer: '  Twin — it edits your videos  ' }))
      .toEqual({ offer: 'Twin — it edits your videos' })
  })

  it('an answerless brief writes NOTHING, not an empty object', () => {
    // The caller skips the write entirely on this, so a creator who answered
    // nothing stays unanswered rather than acquiring an empty answer.
    expect(sanitizeBriefForWrite({})).toEqual({})
    expect(sanitizeBriefForWrite({ workKind: null, forbiddenClaims: null })).toEqual({})
  })

  it('keeps an explicit "none" — it is a different fact from silence', () => {
    // "We asked and they said there are no restrictions" is something the
    // product may act on. "We never asked" is not.
    expect(sanitizeBriefForWrite({ forbiddenClaims: 'none' }))
      .toEqual({ forbiddenClaims: 'none' })
  })

  it('stores a declined product answer, and refuses a failed capture', () => {
    expect(sanitizeBriefForWrite({ productEvidence: 'declined' }))
      .toEqual({ productEvidence: 'declined' })
    // Sections empty = the record of an attempt. Storing it would make a page
    // we could not read look like a product the creator supplied.
    expect(sanitizeBriefForWrite({
      productEvidence: { form: 'link', url: 'https://x.com', linkRole: 'knowledge', sections: [] },
    })).toEqual({})
  })
})

describe('reading back refuses what it cannot interpret', () => {
  it('drops an out-of-enum goal rather than passing it to a prompt', () => {
    // A stored `goal` outside BRIEF_GOALS would otherwise reach the blueprint
    // prompt as though the creator had chosen it.
    expect(readStoredBrief({ goal: 'take over the world' }).goal).toBeUndefined()
    expect(readStoredBrief({ goal: 'leads' }).goal).toBe('leads')
  })

  it('drops an out-of-enum workKind', () => {
    expect(readStoredBrief({ workKind: 'wizard' }).workKind).toBeUndefined()
    expect(readStoredBrief({ workKind: 'professional' }).workKind).toBe('professional')
  })

  it('ignores keys the vocabulary does not contain', () => {
    expect(readStoredBrief({ offer: 'Twin', sneaked: 'x' })).toEqual({ offer: 'Twin' })
  })

  it('survives every non-object a column could hold', () => {
    for (const junk of [null, undefined, 'a string', 42, ['a'], true]) {
      expect(readStoredBrief(junk)).toEqual({})
    }
  })

  it('round-trips what was written', () => {
    const answers: BriefAnswers = {
      goal: 'leads', audience: 'busy founders', workKind: 'professional',
      offer: 'Twin', forbiddenClaims: 'no guaranteed outcomes', productEvidence: 'declined',
    }
    expect(readStoredBrief(sanitizeBriefForWrite(answers))).toEqual(answers)
  })
})

describe('the TypeScript vocabulary and the SQL CHECK cannot drift', () => {
  // Two lists that must agree is the shape of a drift bug: a tenth question
  // added to one and not the other is either a write that fails a constraint in
  // production, or a key the database accepts and no reader understands.
  // ⚠️ THE PREDICATE IS OWNED BY THE LAST MIGRATION THAT DEFINES IT, NOT BY
  // 0109. This read was pinned to 0109 by filename, so when 0136 widened the key
  // set for the six onboarding answers the test failed against a database that
  // would have accepted the write — a false alarm pointing at the wrong file.
  // ⚖️ THE CLAIM IS UNCHANGED AND STILL THE POINT: two lists that must agree is
  // the shape of a drift bug. Only the question of WHICH SQL is currently in
  // force has been fixed, and reading the latest definer keeps it correct through
  // the next widening too.
  const sql = (() => {
    const dir = resolve(REPO, 'supabase/migrations')
    const owning = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
      .filter((f) => readFileSync(resolve(dir, f), 'utf8').includes('function public.is_pre_script_brief'))
    expect(owning.length).toBeGreaterThan(0)
    return readFileSync(resolve(dir, owning[owning.length - 1]), 'utf8')
  })()

  it('every stored key is named in the migration', () => {
    for (const k of BRIEF_STORED_KEYS) expect(sql).toContain(`'${k}'`)
  })

  it('the migration names no key the vocabulary lacks', () => {
    // The `k not in (...)` list, read back out of the SQL.
    const from = sql.indexOf('where k not in (')
    const list = sql.slice(from, sql.indexOf(')', from + 'where k not in ('.length))
    const named = [...list.matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1])
    expect(named.length).toBeGreaterThan(0)
    expect([...named].sort()).toEqual([...BRIEF_STORED_KEYS].sort())
  })

  it('grants UPDATE on the column, in the migration that adds it', () => {
    // `brand_voices` revoked table-level UPDATE long ago and grants it back one
    // column at a time, so a column without this line is unwritable and fails
    // with a bare 42501 naming nothing. It has happened twice in this tree.
    //
    // ⚠️ THIS READS THE ADDING MIGRATION, NOT THE LATEST DEFINER. The grant is
    // made once, where the column is created; a later migration that only
    // redefines the CHECK has no business re-granting, and asserting against it
    // would demand a redundant statement — or worse, teach someone to add one.
    const dir = resolve(REPO, 'supabase/migrations')
    const adder = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
      .find((f) => /add column[^;]*pre_script_brief/i.test(readFileSync(resolve(dir, f), 'utf8')))
    expect(adder, 'no migration adds the column').toBeTruthy()
    expect(readFileSync(resolve(dir, adder!), 'utf8'))
      .toMatch(/grant update \(pre_script_brief\) on public\.brand_voices to authenticated/)
  })
})
