// THE OLD PROMPT'S ROWS COULD NOT BE TOLD FROM THE NEW PROMPT'S ROWS.
//
// ⚠️ WHAT WAS BROKEN, AND IT IS NOT A CRASH. Every improvement to the knowledge
// extractor helped only creators who signed up after it. 1,339 stored rows carry
// no record of which prompt produced them, so "re-mine everything below version
// N" — the one sentence that makes an improvement retroactive — could not be
// acted on. The stamp (0214), the two writers that set it, the merge that raises
// it and the job that reads it are one feature; this file pins each part, because
// a stamp nothing reads is the defect this repo keeps shipping.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { EXTRACTOR_VERSION, isStale, voiceNeedsRemine } from '../extractorVersion.js'
import { knowledgeRowsFrom } from '../knowledgeRows.js'
import { insertKnowledge } from '../knowledgeInsert.js'
import type { RawKnowledgeItem } from '../voice.js'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MIG = readFileSync(join(REPO, 'supabase/migrations/0214_nothing_recorded_which_extractor_said_it.sql'), 'utf8')
const JOB = readFileSync(join(REPO, 'worker/src/jobs/remineKnowledge.ts'), 'utf8')

// env.ts throws without Supabase creds, so stub them before importing the
// registry — the same dance registry.test.ts does, and for the same reason.
beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

const item = (over: Partial<RawKnowledgeItem> = {}): RawKnowledgeItem & { __source: 'transcript' } => ({
  kind: 'opinion',
  text: 'Cheap rebinds fail because the glue is wrong.',
  basis: 'stated',
  times_seen: '1',
  confidence: '0.8',
  source_video: '1',
  __source: 'transcript',
  ...over,
})

describe('an unstamped row is stale, and unknown never reads as current', () => {
  it('absent, undefined and unparseable all count as older', () => {
    expect(isStale(null, 2)).toBe(true)
    expect(isStale(undefined, 2)).toBe(true)
    expect(isStale(Number.NaN, 2)).toBe(true)
  })

  it('equal or newer is not stale, older is', () => {
    expect(isStale(2, 2)).toBe(false)
    expect(isStale(3, 2)).toBe(false)
    expect(isStale(1, 2)).toBe(true)
  })

  // ⚠️ THE MAXIMUM, NOT "ANY STALE ROW". A voice whose store contains one
  // current-prompt row HAS been read by the current prompt; the older rows beside
  // it are history the merge could not raise because those facts were not
  // re-derived. Deciding on "any stale row" would re-mine every voice forever,
  // which is the all-or-nothing behaviour the stamp exists to replace.
  it('one current row settles the voice, even beside a hundred old ones', () => {
    expect(voiceNeedsRemine([null, 1, 1, 2], 2)).toBe(false)
    expect(voiceNeedsRemine([null, 1, 1], 2)).toBe(true)
  })

  it('an empty store is the strongest case for reading the transcripts', () => {
    expect(voiceNeedsRemine([], 2)).toBe(true)
  })

  it('version 1 is never written, so no stamped row can be mistaken for an unstamped one', () => {
    expect(EXTRACTOR_VERSION).toBeGreaterThan(1)
  })
})

describe('the stamp reaches the row', () => {
  it('every row carries the version it was asked for', () => {
    const rows = knowledgeRowsFrom({
      items: [item(), item({ text: 'She charges four hundred pounds.' })],
      ownerId: 'o', voiceId: 'v', urls: ['https://x/1'], cap: 10, version: 7,
    })
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.extractor_version)).toEqual([7, 7])
  })

  // ⚖️ THE SAME NORMALISATION, TWO JOBS. The scan and the re-mine differ on the
  // cap and the version and on nothing else; a second copy of these rules is how
  // the two paths would start disagreeing about what a claim is.
  it('the cap and the version are the only things a caller decides', () => {
    const rows = knowledgeRowsFrom({
      items: [item(), item({ text: 'b' }), item({ text: 'c' })],
      ownerId: 'o', voiceId: 'v', urls: [], cap: 2, version: 2,
    })
    expect(rows).toHaveLength(2)
  })
})

describe('the merge carries the stamp, and only ever raises it', () => {
  // ⚠️ WITHOUT THIS THE COLUMN WOULD BE A LIE ON THE COMMON PATH.
  // `merge_creator_knowledge` enumerates its columns, so a new column is dropped
  // by the PREFERRED writer while the rarely-taken PostgREST fallback stores it —
  // stamped only when something else is already broken.
  it('the insert column list and the select both name it', () => {
    const insertList = MIG.match(/insert into public\.creator_knowledge\s*\n\s*\(([^)]*)\)/)
    expect(insertList, 'the merge must still insert an explicit column list').not.toBeNull()
    expect(insertList?.[1]).toContain('extractor_version')
  })

  it('a re-confirmed fact leaves the cohort instead of being re-mined forever', () => {
    expect(MIG).toMatch(/extractor_version = case/)
    expect(MIG).toMatch(/greatest\(public\.creator_knowledge\.extractor_version, excluded\.extractor_version\)/)
  })

  // ⚖️ A WRITER THAT DOES NOT STAMP MUST NOT ERASE A STAMP — the rule 0178 wrote
  // for `cost` and `consensus`, for the same reason.
  it('an unstamped incoming row leaves a stamped stored row alone', () => {
    expect(MIG).toMatch(/when excluded\.extractor_version is null then public\.creator_knowledge\.extractor_version/)
  })

  // ⚠️ `max()` OVER NO ROWS IS NULL, AND `NULL < N` IS NULL, WHICH A WHERE CLAUSE
  // READS AS FALSE. Without the coalesce the voices with the OLDEST knowledge —
  // and the ones with none at all — would be the only voices never re-mined.
  it('the cohort query treats an absent maximum as older than anything', () => {
    expect(MIG).toMatch(/coalesce\(\(\s*\n?\s*select max\(k\.extractor_version\)/)
    expect(MIG).toMatch(/\), 0\) < p_below_version/)
  })

  it('the cohort only takes voices that have something to re-read', () => {
    expect(MIG).toMatch(/from public\.transcripts t/)
    expect(MIG).toMatch(/t\.subject = 'own'/)
  })

  it('a second sweep does not double the queue', () => {
    expect(MIG).toMatch(/j\.status in \('queued', 'running'\)/)
  })
})

describe('the fallback loses the stamp rather than the rows', () => {
  // ⚠️ PostgREST REJECTS THE WHOLE BATCH WITH PGRST204 FOR ONE UNKNOWN COLUMN, so
  // a worker deployed a minute ahead of 0214 must drop the stamp and keep the
  // knowledge. An unnecessary re-mine costs one model call; a lost batch costs the
  // creator everything the scan found.
  it('a store without the column still stores the claim', async () => {
    const seen: unknown[][] = []
    let call = 0
    const db = {
      rpc: async () => ({ error: { code: 'PGRST202', message: 'Could not find the function' } }),
      from: () => ({
        insert: async (rows: unknown[]) => {
          seen.push(rows); call++
          return call === 1
            ? { error: { code: 'PGRST204', message: "column 'extractor_version' does not exist" } }
            : { error: null }
        },
      }),
    }
    const rows = knowledgeRowsFrom({
      items: [item()], ownerId: 'o', voiceId: 'v', urls: ['u'], cap: 5, version: EXTRACTOR_VERSION,
    })
    const out = await insertKnowledge(db as never, rows as never)
    expect(out.error).toBeNull()
    expect(seen).toHaveLength(2)
    const retried = seen[1] as Array<Record<string, unknown>>
    expect(retried[0]).not.toHaveProperty('extractor_version')
    // And the claim itself survived, which is the whole point of the retry.
    expect(retried[0].text).toBe('Cheap rebinds fail because the glue is wrong.')
  })
})

describe('the re-mine has a caller and a reader', () => {
  it('the job is registered, or nothing can ever run it', async () => {
    const { handlers } = await import('../jobs/index.js')
    expect(Object.keys(handlers)).toContain('remine_knowledge')
  })

  // ⚠️ THE SAME TABLE HOLDS OTHER PEOPLE'S REFERENCE VIDEOS. Re-mining an
  // `ingest` row would file a stranger's opinions as the creator's, which is
  // worse than an empty store by a wide margin.
  it('it reads her own speech and nobody else\'s', () => {
    expect(JOB).toMatch(/\.eq\('subject', 'own'\)/)
  })

  // ⚖️ A FAILED READ IS NOT AN EMPTY STORE. Reading an error as "no rows" would
  // re-mine every voice on every sweep the moment 0214 is unapplied.
  it('an unreadable version list stops the job instead of licensing the spend', () => {
    expect(JOB).toMatch(/could not read stored versions/)
  })

  it('the staleness decision is made in the handler too, not only in the sweep', () => {
    expect(JOB).toMatch(/voiceNeedsRemine\(versions, EXTRACTOR_VERSION\)/)
    expect(JOB).toMatch(/skipped: 'already_current'/)
  })
})
