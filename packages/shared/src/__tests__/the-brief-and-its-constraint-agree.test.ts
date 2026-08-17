// A KEY THE CODE WRITES AND THE CONSTRAINT REFUSES FAILS IN PRODUCTION, DURING
// SOMEBODY'S ONBOARDING.
//
// ⚠️ THE BRIEF'S SHAPE IS DECLARED TWICE — once in `BRIEF_STORED_KEYS` and once
// in the `is_pre_script_brief` CHECK — and neither can import the other. That is
// not a fixable duplication (one is SQL), so it is a tested one: the failure mode
// is a write that passes every local test and is rejected by the database.
//
// ⚖️ AND THE CHECK IS NOT DECORATION. It pins the key set so a client cannot grow
// the brief by writing to it, which is how a question set becomes whatever a form
// happened to post. Widening it is a deliberate act, by name — so this reads the
// migration and requires the two lists to be identical.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  BRIEF_STORED_KEYS, BRIEF_ARRAY_KEYS, sanitizeBriefForWrite, readStoredBrief,
} from '../preScriptBrief'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const MIG = join(REPO, 'supabase', 'migrations')

/** The LAST migration that redefines the predicate — later ones supersede. */
const PREDICATE = (() => {
  const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()
  const owning = files.filter((f) =>
    readFileSync(join(MIG, f), 'utf8').includes('function public.is_pre_script_brief'))
  expect(owning.length, 'no migration defines the predicate').toBeGreaterThan(0)
  return readFileSync(join(MIG, owning[owning.length - 1]), 'utf8')
})()

/** The key set the CHECK admits, lifted out of the `k not in (...)` list. */
function sqlKeys(): string[] {
  const m = /from jsonb_object_keys\(p\) k[\s\S]*?where k not in \(([\s\S]*?)\)\s*\)/.exec(PREDICATE)
  expect(m, 'could not find the key list in the migration').not.toBeNull()
  return [...m![1].matchAll(/'([a-zA-Z]+)'/g)].map((x) => x[1])
}

describe('the two declarations of the brief agree', () => {
  it('admits exactly the keys the code stores', () => {
    expect([...sqlKeys()].sort()).toEqual([...BRIEF_STORED_KEYS].sort())
  })

  it('treats the same keys as arrays on both sides', () => {
    // ⚠️ A SCALAR KEY SENT AS AN ARRAY IS REJECTED, and so is the reverse. The
    // constraint enumerates the multi-selects rather than relaxing the
    // non-empty-string rule globally, so the two lists have to match.
    // ⚠️ BOTH CLAUSES, AND THEY ARE NOT THE SAME TEXT. The scalar rule EXCLUDES
    // these keys (`not in`) and the array rule SELECTS them (`in`); a list that
    // appeared in only one of the two would either skip validation entirely or
    // apply the string rule to an array. My first version of this assertion
    // counted one pattern twice and failed on the correct migration.
    const scalarExcludes = /e\.key not in \('contentGoals', 'desiredFormats', 'commercialTies'\)/
    const arraySelects = /e\.key in \('contentGoals', 'desiredFormats', 'commercialTies'\)/
    expect(PREDICATE).toMatch(scalarExcludes)
    expect(PREDICATE).toMatch(arraySelects)
    expect([...BRIEF_ARRAY_KEYS].sort()).toEqual(['commercialTies', 'contentGoals', 'desiredFormats'])
  })
})

describe('what the writer may hand the database', () => {
  it('never writes an empty array, for the reason it never writes an empty string', () => {
    // ⚖️ `[]` AND ABSENT ARE THE SAME FACT to every reader, and storing the first
    // creates a state that means "unanswered" and counts as answered. The CHECK
    // refuses it too — so writing one would be a runtime failure, not a mess.
    const out = sanitizeBriefForWrite({ commercialTies: [], contentGoals: ['teach'] })
    expect(out).not.toHaveProperty('commercialTies')
    expect(out.contentGoals).toEqual(['teach'])
  })

  it('drops empty and non-string elements rather than storing them', () => {
    const out = sanitizeBriefForWrite({ commercialTies: ['own_product', '', '  '] as string[] })
    expect(out.commercialTies).toEqual(['own_product'])
  })

  it('keeps "nothing commercial", which is the answer that suppresses suggestions', () => {
    // ⚠️ THE ONE THAT FAILS UNSAFELY IF LOST. Every other missing answer makes
    // Twin claim less; losing this one re-enables product suggestions for the
    // creator who explicitly said they sell nothing.
    expect(sanitizeBriefForWrite({ commercialTies: ['none'] }).commercialTies).toEqual(['none'])
  })
})

describe('what the reader may believe', () => {
  it('round-trips the six answers', () => {
    const written = sanitizeBriefForWrite({
      commercialTies: ['affiliate'], contentGoals: ['teach', 'sell'],
      desiredFormats: ['talking_head'], audienceKnowledge: 'beginners',
    })
    const back = readStoredBrief(written)
    expect(back.commercialTies).toEqual(['affiliate'])
    expect(back.contentGoals).toEqual(['teach', 'sell'])
    expect(back.audienceKnowledge).toBe('beginners')
  })

  it('drops a key the vocabulary no longer knows', () => {
    // ⚖️ Rows written before the constraint existed can hold anything; carrying
    // an unknown key forward would hand a retired answer to a live reader.
    expect(readStoredBrief({ retiredQuestion: 'x', commercialTies: ['none'] }))
      .toEqual({ commercialTies: ['none'] })
  })

  it('survives the shapes a real row can hold', () => {
    for (const bad of [null, 'x', 42, [], { commercialTies: 'none' }, { contentGoals: [1, 2] }]) {
      expect(() => readStoredBrief(bad)).not.toThrow()
    }
    expect(readStoredBrief({ commercialTies: [] })).toEqual({})
  })
})
