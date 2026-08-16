// A DEFAULT WE WROTE DOWN IS NOT A CHOICE THE CREATOR MADE.
//
// ⚠️ THE FIELD THIS GUARDS EXISTS BECAUSE MAKING A SIGNAL NON-EMPTY IS NOT THE
// SAME AS MAKING IT REAL. `selected_hook` was filled on page load with the
// recommended hook so the teleprompter had a line and the gallery signal was not
// 1 of 15. It worked: 23 rows now carry a hook. 14 of them equal option[0] and
// no creator is known to have picked any of those.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  classifyStoredHook, creatorPick, defaultCapture, freeformEntry, isPreference, HOOK_INDEX_MAX,
} from '../hookChoice'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const SQL = readFileSync(
  join(SRC, '..', '..', '..', 'supabase', 'migrations', '0134_hook_choice_provenance.sql'), 'utf8')
const RESULT = readFileSync(
  join(SRC, '..', '..', '..', 'apps', 'web', 'src', 'pages', 'Result.tsx'), 'utf8')

describe('only a creator pick is a preference', () => {
  it('accepts a creator pick', () => {
    expect(isPreference(creatorPick(3))).toBe(true)
  })

  it('REFUSES our own default, which is the whole point', () => {
    expect(isPreference(defaultCapture(0))).toBe(false)
  })

  it('refuses freeform text', () => {
    expect(isPreference(freeformEntry())).toBe(false)
  })

  it('refuses NULL rather than treating it as "nothing was chosen"', () => {
    // ⚖️ A row predating 0134 is one we cannot interpret. Reading it as a
    // non-choice would put 23 rows into a corpus that has 8.
    expect(isPreference(null)).toBe(false)
    expect(isPreference(undefined)).toBe(false)
  })
})

describe('classifying what is already stored', () => {
  const opts = ['first one', 'second one', 'third one']

  it('a non-first option is a real pick — nothing else could have written it', () => {
    expect(classifyStoredHook('third one', opts)).toEqual({ source: 'creator', index: 2 })
  })

  it('option[0] is DEFAULT even though some creators really did tap it', () => {
    // ⚠️ THIS IS A KNOWN, PERMANENT LOSS on the 14 existing rows, and it is the
    // honest direction to lose in: calling them picks would fabricate
    // preferences, and a fabricated preference is worse than a missing one.
    expect(classifyStoredHook('first one', opts)).toEqual({ source: 'default', index: 0 })
  })

  it('text matching no option is freeform with NO index', () => {
    const c = classifyStoredHook('PICK THIS HOOK for the cover and broll', opts)
    expect(c.source).toBe('freeform')
    expect(c.index).toBeNull()
  })

  it('an empty option list cannot manufacture a pick', () => {
    expect(classifyStoredHook('anything', [])).toEqual({ source: 'freeform', index: null })
  })
})

describe('the app states its own provenance', () => {
  it('the load-time capture says DEFAULT', () => {
    // ⚠️ MUTATION-CHECKED: deleting `hook_choice` from this call leaves the
    // teleprompter working and the corpus silently poisoned again.
    expect(RESULT).toMatch(/selected_hook: initial, hook_choice: defaultCapture\(0\)/)
  })

  it('a tap says CREATOR, with the index from the options ON SCREEN', () => {
    expect(RESULT).toMatch(/const i = opts\.indexOf\(h\)/)
    expect(RESULT).toMatch(/hook_choice: i >= 0 \? creatorPick\(i\) : freeformEntry\(\)/)
  })

  it('never re-derives provenance later, because only that moment knows', () => {
    // classifyStoredHook is for the reader and the backfill. If the write path
    // used it, every tap on option[0] would record as a default.
    expect(RESULT).not.toMatch(/classifyStoredHook/)
  })
})

describe('the column cannot hold a shape the reader would misread', () => {
  it('constrains source to the three it knows', () => {
    expect(SQL).toMatch(/hook_choice ->> 'source' in \('creator', 'default', 'freeform'\)/)
  })

  it('requires freeform to carry a NULL index rather than a made-up one', () => {
    expect(SQL).toMatch(/source' = 'freeform' and hook_choice -> 'index' = 'null'::jsonb/)
  })

  it('keeps the column NULLABLE, so old rows stay uninterpretable', () => {
    // A default of '{}' or a backfill to 'default' would assert something about
    // 23 rows that is only known about 9 of them.
    expect(SQL).not.toMatch(/hook_choice jsonb not null/)
    expect(SQL).not.toMatch(/update public\.generations\s+set hook_choice/i)
  })

  it('grants the client the column it must write', () => {
    expect(SQL).toMatch(/grant update \(hook_choice\) on public\.generations to authenticated/)
  })

  it('agrees with the code on the index bound', () => {
    expect(SQL).toContain(`::int < ${HOOK_INDEX_MAX}`)
  })
})
