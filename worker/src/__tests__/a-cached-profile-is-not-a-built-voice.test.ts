import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ⚠️ ELEVEN OF FORTY `ready` BRAND VOICES IN PRODUCTION HELD NOTHING.
 *
 * `start-dna` hits the handle cache, copies that handle's profile onto a brand
 * new row, marks it `ready` and queues the scan that is meant to fill the
 * knowledge behind the creator. When the scan then failed, `scrape_dna`'s
 * `fail()` looked at the row, saw a niche and a tone — the ones the cache had
 * written seconds earlier — and concluded this account had an existing voice
 * worth protecting from a bad rescan. It had never had a good scan at all.
 *
 * ⚖️ THE COST LANDED IN THE SCRIPT, NOT IN THE DASHBOARD. `substanceBudget()`
 * floors out on an empty store, and a floored budget is a five-scene script for
 * a sixty-second video with a second story force-fitted in to reach length. The
 * owner reported that as a writing problem. It was an empty table.
 *
 * ⚖️ WHY THE TEST IS ABOUT SOURCES. The reporting account DID have three
 * `creator_knowledge` rows: the three onboarding answers they typed. A rule
 * that counted any row would have called the voice built because a human filled
 * in a form. Only `caption` / `transcript` / `previous_video` are evidence that
 * a scan of the account ever succeeded.
 */

type Row = { id: string }
let knowledgeRows: Row[] = []
let transcriptRows: Row[] = []
let knowledgeError: { message: string } | null = null
let transcriptError: { message: string } | null = null
let knowledgeSources: unknown = null
let transcriptSubject: unknown = null
let throwOnRead = false

vi.mock('../db.js', () => ({
  db: {
    from: (table: string) => {
      if (throwOnRead) throw new Error('connection reset')
      const isKnowledge = table === 'creator_knowledge'
      const result = () =>
        isKnowledge
          ? { data: knowledgeError ? null : knowledgeRows, error: knowledgeError }
          : { data: transcriptError ? null : transcriptRows, error: transcriptError }
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = (col: string, val: unknown) => {
        if (col === 'subject') transcriptSubject = val
        return chain
      }
      chain.in = (_col: string, vals: unknown) => {
        knowledgeSources = vals
        return chain
      }
      chain.limit = async () => result()
      return chain
    },
  },
}))

const { voiceHasOwnMaterial } = await import('../voiceOwnMaterial.js')

beforeEach(() => {
  knowledgeRows = []
  transcriptRows = []
  knowledgeError = null
  transcriptError = null
  knowledgeSources = null
  transcriptSubject = null
  throwOnRead = false
})

describe('what counts as a voice this account actually built', () => {
  it('says no when the row has nothing but a cached profile', async () => {
    expect(await voiceHasOwnMaterial('v1')).toBe(false)
  })

  it('says yes on scan-derived knowledge', async () => {
    knowledgeRows = [{ id: 'k1' }]
    expect(await voiceHasOwnMaterial('v1')).toBe(true)
  })

  it('says yes on an own transcript even with no knowledge rows', async () => {
    transcriptRows = [{ id: 't1' }]
    expect(await voiceHasOwnMaterial('v1')).toBe(true)
  })

  it('asks only for the sources a scan produces, never the typed ones', async () => {
    await voiceHasOwnMaterial('v1')
    expect(knowledgeSources).toEqual(['caption', 'transcript', 'previous_video'])
    expect(knowledgeSources).not.toContain('asked')
    expect(knowledgeSources).not.toContain('user')
  })

  it('counts only the creator’s own transcripts, not references they pasted', async () => {
    await voiceHasOwnMaterial('v1')
    expect(transcriptSubject).toBe('own')
  })

  // ⚠️ THE ONLY CALLER USES THIS TO TAKE A VOICE AWAY. A read that failed must
  // never be the reason a creator's built voice is marked failed, so unknown
  // degrades to the older, gentler answer rather than to the honest one.
  it('says yes when it cannot tell, because the caller marks voices failed', async () => {
    knowledgeError = { message: 'column does not exist' }
    expect(await voiceHasOwnMaterial('v1')).toBe(true)
    knowledgeError = null
    transcriptError = { message: 'PGRST204' }
    expect(await voiceHasOwnMaterial('v1')).toBe(true)
    transcriptError = null
    throwOnRead = true
    expect(await voiceHasOwnMaterial('v1')).toBe(true)
  })

  // ⚠️ PostgREST REJECTS THE WHOLE SELECT ON AN UNKNOWN COLUMN and returns a
  // null `data` beside the error. Reading only `data` would read that as "this
  // voice has nothing" and mark a healthy voice failed.
  it('reads the error before the data', async () => {
    knowledgeError = { message: 'PGRST204' }
    transcriptError = { message: 'PGRST204' }
    expect(await voiceHasOwnMaterial('v1')).toBe(true)
  })
})

const SCRAPE = readFileSync(join(__dirname, '..', 'jobs', 'scrapeDna.ts'), 'utf8')

describe('scrape_dna asks both questions before keeping a voice ready', () => {
  it('requires own material, not only a presentable profile', () => {
    expect(SCRAPE).toMatch(/vp\.summary\) && \(await voiceHasOwnMaterial\(voiceId\)\)/)
  })

  // ⚠️ THIS IS THE CALL SITE THAT PRODUCED THE REPORT. Every other `fail()`
  // passed its error; the synth failure passed none, so the durable result
  // carried the vague creator sentence and no class an operator could act on.
  it('records the cause when the voice synth is what failed', () => {
    expect(SCRAPE).toMatch(/set it up manually\.', err\)/)
  })
})
