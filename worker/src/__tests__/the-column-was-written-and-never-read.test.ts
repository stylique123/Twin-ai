// `voice_id` WAS ON EVERY ROW FROM THE START, AND THE READER THAT MATTERS MOST
// NEVER ASKED FOR IT.
//
// ⚠️ 1,949 OF 1,949 `creator_knowledge` ROWS CARRY `voice_id` IN PRODUCTION.
// The writer has recorded which voice each belief came from since the table
// existed. `generate-blueprint` — the one reader whose output is the script the
// creator films — selected on `owner_id` alone, so for an owner with more than
// one voice (production holds one with TEN, ten different people's accounts)
// the top-40 ranking blended strangers' beliefs with hers and ranked them
// against each other by `times_seen`.
//
// ⚖️ THE SIBLINGS WERE ALREADY RIGHT, which is what makes this a defect and not
// a design question: `remineKnowledge.storedVersions` filters on `voice_id`,
// and so does the web's `twinStrengthLoad`. No migration, no backfill — nothing
// was ever missing from the table. Only the question was missing.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const VOICE = readFileSync(join(SRC, 'jobs', 'voice.ts'), 'utf8')
const BLUEPRINT = readFileSync(
  join(SRC, '..', '..', 'supabase', 'functions', 'generate-blueprint', 'index.ts'),
  'utf8',
)

describe('the blueprint compiler reads one creator, not one account holder', () => {
  it('scopes the ranked knowledge read to the voice', () => {
    expect(BLUEPRINT).toMatch(/scopeToVoice\(admin[\s\S]{0,200}?\.from\('creator_knowledge'\)/)
  })

  it('scopes the asked read too — an answer belongs to the voice it was typed for', () => {
    const asked = BLUEPRINT.slice(BLUEPRINT.indexOf("eq('source', 'asked')") - 400)
    expect(asked.slice(0, 500)).toMatch(/scopeToVoice/)
  })

  it("falls back to owner scope only when there is no voice at all", () => {
    expect(BLUEPRINT).toMatch(/voice\?\.id \? q\.eq\('voice_id', voice\.id\) : q/)
  })
})

describe('the cohort-yield measurement counts only the scan that ran', () => {
  it('filters by voice_id when it knows the voice', () => {
    expect(VOICE).toMatch(/if \(voiceId\) q\.eq\('voice_id', voiceId\)/)
  })

  it('is passed the voice it just built', () => {
    expect(VOICE).toMatch(/measureCohortYield\(ownerId, urls, before, voiceId\)/)
  })
})
