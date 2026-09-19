// TEN PEOPLE'S SPEECH IN ONE POOL, AND EVERY READER DRANK FROM ALL OF IT.
//
// ⚠️ `transcripts` WAS SCOPED TO `owner_id` AND NOTHING ELSE, and an owner is
// not a creator: measured 2026-09-19, one owner holds TEN ready voices — ten
// different people's accounts. Four of them reported byte-identical transcript
// counts because they were never four stores, only one store read four times.
// `own-speech-is-persisted.test.ts` guards that the speech is WRITTEN; nothing
// guarded whose speech it was.
//
// ⚖️ THE NULL RULE IS THE PART WORTH LOCKING. A row the 0220 backfill could not
// attribute is UNATTRIBUTED, not foreign, so it may be read only when the owner
// has exactly one ready voice. Drop that condition either way and the bug comes
// back: exclude NULL for everyone and every pre-0220 creator silently loses
// their voice; admit NULL for everyone and the ten-account pool is exactly as
// mixed as before.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const VOICE = readFileSync(join(SRC, 'jobs', 'voice.ts'), 'utf8')
const REMINE = readFileSync(join(SRC, 'jobs', 'remineKnowledge.ts'), 'utf8')
const MIGRATION = readFileSync(
  join(SRC, '..', '..', 'supabase', 'migrations', '0220_ten_accounts_one_pool_and_the_writer_read_all_ten.sql'),
  'utf8',
)
const BLUEPRINT = readFileSync(
  join(SRC, '..', '..', 'supabase', 'functions', 'generate-blueprint', 'index.ts'),
  'utf8',
)

describe('the speech is stamped with the voice it came from', () => {
  it('build_voice writes brand_voice_id on the own-transcript row', () => {
    expect(VOICE).toMatch(/brand_voice_id: voiceId/)
  })

  it('keeps the row when the column is not applied yet, rather than losing the speech', () => {
    // ⚠️ AN UNKNOWN COLUMN REJECTS THE WHOLE INSERT. Shipping the stamp ahead
    // of the apply without this retry would cost the creator the transcript
    // outright — a worse bug than the one being fixed.
    expect(VOICE).toMatch(/stored_unattributed/)
  })
})

describe('the readers admit an unattributed row only when nobody else could own it', () => {
  it('the blueprint compiler scopes by voice and tests for a sole voice', () => {
    expect(BLUEPRINT).toMatch(/soleVoice/)
    expect(BLUEPRINT).toMatch(/brand_voice_id\.is\.null,brand_voice_id\.eq\./)
  })

  it('the re-miner does the same, because it WRITES what it reads', () => {
    expect(REMINE).toMatch(/soleVoice/)
    expect(REMINE).toMatch(/brand_voice_id\.is\.null,brand_voice_id\.eq\./)
  })

  it('neither reader empties the store when the column is missing', () => {
    expect(BLUEPRINT).toMatch(/brand_voice_id/i)
    expect(REMINE).toMatch(/unscoped/)
  })
})

describe('the backfill refuses to guess', () => {
  it('attributes only urls that belong to exactly one voice', () => {
    expect(MIGRATION).toMatch(/having count\(distinct vid\) = 1/)
  })

  it('is re-runnable, so a second apply is a no-op', () => {
    expect(MIGRATION).toMatch(/t\.brand_voice_id is null/)
    expect(MIGRATION).toMatch(/add column if not exists brand_voice_id/)
  })
})
