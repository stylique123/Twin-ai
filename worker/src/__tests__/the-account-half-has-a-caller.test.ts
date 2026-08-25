import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ⚠️ THE MECHANISM WAS SHIPPED TWICE AND CALLED ZERO TIMES.
 *
 * `messageForOwnAccount` (shared) and `sampleOwnAccount` (worker) were both
 * landed, tested and merged while NOTHING invoked either of them. The
 * reference-video half of the same gate went live in the same period, and the
 * only difference was that `transcribe.ts` gave it a place to run and a column
 * to write. This suite exists so that cannot silently come apart again: it
 * checks the RUN, not just the counting rule the run uses.
 */

let updated: Record<string, unknown> | null = null
let updateError: { message: string } | null = null
let inserted: Array<Record<string, unknown>> = []

vi.mock('../db.js', () => ({
  db: {
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          if (table === 'brand_voices') updated = patch
          return { error: updateError }
        },
      }),
      insert: async (row: Record<string, unknown>) => {
        inserted.push(row)
        return { error: null }
      },
    }),
  },
}))

const downloads: string[] = []
let downloadThrows = false
vi.mock('../media.js', () => ({
  downloadReference: async (url: string) => {
    downloads.push(url)
    if (downloadThrows) throw new Error('nope')
  },
}))
vi.mock('../downloadRoute.js', () => ({ parseRoute: () => ({}) }))

let lookResult: unknown = null
let lookThrows = false
vi.mock('../earlyLook.js', () => ({
  earlyLook: async () => {
    if (lookThrows) throw new Error('model exploded')
    return lookResult
  },
}))

const { lookAtOwnVideo, publishCounts, handleSampleOwnAccount, OWN_VIDEOS_TO_CHECK } =
  await import('../jobs/sampleOwnAccount.js')

beforeEach(() => {
  updated = null; updateError = null; inserted = []
  downloads.length = 0; downloadThrows = false; lookThrows = false
  lookResult = { someoneTalkingToCamera: true, failure: null }
})

describe('one look at one of the creator’s own videos', () => {
  it('carries the answer through when the look worked', async () => {
    expect(await lookAtOwnVideo('u')).toEqual({ someoneTalkingToCamera: true, failure: null })
  })

  // ⚠️ A DECLINE IS AN ANSWER, NOT AN ERROR. `readEarlyAnswer` returns null for
  // "unsure" — deliberately, because false is an accusation and null is silence.
  // Re-deriving a failure here would convert every decline into a point against
  // the creator, which is the one thing this whole gate must not do.
  it('a model that would not say is null WITHOUT a failure', async () => {
    lookResult = { someoneTalkingToCamera: null, failure: null }
    expect(await lookAtOwnVideo('u')).toEqual({ someoneTalkingToCamera: null, failure: null })
  })

  // ⚖️ AND A REAL FAILURE IS NAMED, so "we could not fetch it" and "the model
  // declined" stay distinguishable in the log even though `noAnswer` counts both.
  it('a failed download is named and the look is not attempted', async () => {
    downloadThrows = true
    const r = await lookAtOwnVideo('u')
    expect(r).toEqual({ someoneTalkingToCamera: null, failure: 'OWN_DOWNLOAD_FAILED' })
  })

  it('a thrown look is named rather than escaping', async () => {
    lookThrows = true
    expect(await lookAtOwnVideo('u')).toEqual({ someoneTalkingToCamera: null, failure: 'OWN_LOOK_THREW' })
  })
})

describe('what gets written to the voice', () => {
  // ⚠️ ALL FOUR COLUMNS. 0171 refuses a half-written sample with a check
  // constraint, so writing three of four is a REJECTED write, not a degraded one.
  it('writes every column the constraint demands', async () => {
    await publishCounts('v1', { usable: 2, checked: 3, complete: true, noAnswer: 1 })
    expect(updated).toEqual({
      own_sample_usable: 2, own_sample_checked: 3,
      own_sample_complete: true, own_sample_no_answer: 1,
    })
  })

  // ⚖️ `false` IS WRITTEN EXPLICITLY, NOT OMITTED. Omitting it would leave the
  // column NULL, and NULL reads as "never sampled" — which the reader treats as
  // a finished measurement of nothing rather than as a sample still climbing.
  // That is #537's bug, one layer down.
  it('an unfinished sample records complete: false rather than leaving it out', async () => {
    await publishCounts('v1', { usable: 0, checked: 1, complete: false, noAnswer: 0 })
    expect(updated).toHaveProperty('own_sample_complete', false)
  })
})

describe('the job as a whole', () => {
  it('refuses without a voice to write to', async () => {
    await expect(handleSampleOwnAccount({ payload: { urls: ['a'] } } as never))
      .rejects.toThrow(/brand_voice_id/)
  })

  // ⚠️ NO URLS IS AN EMPTY SAMPLE, NOT A FAILED JOB. A creator whose account had
  // no usable video links has told us something about their account; marking the
  // job failed would report it as a fault in the run.
  it('an account with no videos finishes complete and silent', async () => {
    const r = await handleSampleOwnAccount({ payload: { brand_voice_id: 'v1', urls: [] } } as never)
    expect(r).toMatchObject({ usable: 0, checked: 0, complete: true, offered: 0 })
    expect(updated).toHaveProperty('own_sample_complete', true)
  })

  // ⚖️ THE SAMPLE IS CAPPED, and the cap is the shared constant's value.
  it('looks at no more than OWN_VIDEOS_TO_CHECK videos', async () => {
    const many = Array.from({ length: 20 }, (_, i) => `u${i}`)
    const r = await handleSampleOwnAccount({ payload: { brand_voice_id: 'v1', urls: many } } as never)
    expect(downloads.length).toBe(OWN_VIDEOS_TO_CHECK)
    expect(r).toMatchObject({ checked: OWN_VIDEOS_TO_CHECK, offered: 20 })
  })

  // ⚠️ A VIDEO WE COULD NOT READ IS NOT A VIDEO WE LOOKED AT. The creator-facing
  // sentence names `checked`, so counting attempts would state a measurement we
  // never took, about their own work.
  it('failed downloads land in noAnswer and never in checked', async () => {
    downloadThrows = true
    const r = await handleSampleOwnAccount({ payload: { brand_voice_id: 'v1', urls: ['a', 'b'] } } as never)
    expect(r).toMatchObject({ checked: 0, no_answer: 2, usable: 0, complete: true })
  })

  // ⚖️ A WRITE THAT FAILS MUST NOT COST THE RUN. Losing a warning is survivable;
  // failing the job because a warning could not be stored is not.
  it('survives every publish failing', async () => {
    updateError = { message: 'db down' }
    const r = await handleSampleOwnAccount({ payload: { brand_voice_id: 'v1', urls: ['a'] } } as never)
    expect(r).toMatchObject({ checked: 1, complete: true })
  })
})

/**
 * ⚠️ AND THE CHAIN IS CHECKED, NOT ASSUMED — the lesson from every "column
 * nothing writes and nothing reads" this rebuild has found.
 */
describe('the chain is actually connected', () => {
  const repo = join(import.meta.dirname, '..', '..', '..')
  const read = (...p: string[]) => readFileSync(join(repo, ...p), 'utf8')
  const migration = read('supabase', 'migrations', '0171_the_sample_is_written_down_or_it_never_happened.sql')
  const registry = read('worker', 'src', 'jobs', 'index.ts')
  const scan = read('worker', 'src', 'jobs', 'scrapeDna.ts')

  it.each(['own_sample_usable', 'own_sample_checked', 'own_sample_complete', 'own_sample_no_answer'])(
    'the migration adds %s idempotently', (col) => {
      expect(migration).toMatch(new RegExp(`add column if not exists ${col}`))
    })

  // ⚖️ NEVER `default true`. A default here would hand a finished verdict to
  // every voice that existed before this applied.
  it('complete has no default', () => {
    expect(migration).not.toMatch(/own_sample_complete boolean[^;]*default/i)
  })

  it('the handler is registered under a job type', () => {
    expect(registry).toMatch(/sample_own_account:\s*handleSampleOwnAccount/)
  })

  // ⚠️ ANCHORED ON THE INSERT, NOT THE TOKEN. `sample_own_account` also appears
  // in the comment above it, so a bare search would stay green if the enqueue
  // were deleted — the trap that made four guards in this rebuild decoration.
  it('the scan enqueues it, with no retries', () => {
    const at = scan.indexOf("type: 'sample_own_account'")
    expect(at, 'the enqueue itself was not found').toBeGreaterThan(-1)
    const block = scan.slice(at - 200, at + 300)
    expect(block).toMatch(/max_attempts: 1/)
    expect(block).toMatch(/brand_voice_id: voiceId/)
  })

  // ⚖️ THE SAME LIST THE TRANSCRIPTS USE. Re-picking by views here would sample
  // spectacle rather than the creator.
  it('reuses the representative selection rather than re-picking', () => {
    const at = scan.indexOf("type: 'sample_own_account'")
    expect(scan.slice(at, at + 300)).toMatch(/payload: \{ brand_voice_id: voiceId, urls \}/)
  })
})
