// THE RETRY PAYS THE MODEL AGAIN. IT MUST NOT PAY THE NETWORK AGAIN.
//
// ⚠️ 145 JOBS FAILED ON A GEMINI DAILY-QUOTA REFUSAL, EACH RETRIED UP TO FIVE
// TIMES. The worker retries the whole handler, so every one of those attempts
// re-downloaded a video we already had and re-ran whisper on audio we had
// already read — to arrive back at the same wall. What the video said does not
// change; only our opinion about it is worth retrying.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const JOB = readFileSync(join(REPO, 'worker/src/jobs/assessReference.ts'), 'utf8')
const CACHE = readFileSync(join(REPO, 'worker/src/transcriptCache.ts'), 'utf8')
const MIGRATION = readFileSync(
  join(REPO, 'supabase/migrations/0153_the_download_is_not_the_assessment.sql'), 'utf8')

describe('acquisition is separate from assessment', () => {
  it('reads the stored transcript before reaching for the network', () => {
    expect(JOB).toContain('await readCachedTranscript(url)')
    // ⚠️ THE ORDER IS THE WHOLE CLAIM. A read placed after the download would
    // be a cache that never saves anything.
    expect(JOB.indexOf('readCachedTranscript')).toBeLessThan(JOB.indexOf('await transcribeFromUrl'))
  })

  it('stores the transcript before any later step can end the attempt', () => {
    // The no-speech branch, the model call and the profile write all sit below
    // this line and all can end the attempt.
    expect(JOB).toContain('if (!cached) await writeCachedTranscript(url, transcript)')
    expect(JOB.indexOf('writeCachedTranscript')).toBeLessThan(JOB.indexOf('await geminiJson'))
  })

  it('lets force mean "do the acquisition again" and nothing less', () => {
    // ⚖️ ONE FLAG. A caller who suspects the transcript itself is wrong must not
    // have to know about a second one.
    expect(JOB).toContain('p.force === true ? null : await readCachedTranscript(url)')
  })
})

describe('the cache may not become a new way to fail', () => {
  it('returns null rather than throwing on a miss, a bad row or a bad database', () => {
    expect(CACHE).toContain('catch {\n    return null\n  }')
    expect(CACHE).toContain("typeof t.text !== 'string'")
  })

  it('never throws out of the write path', () => {
    // A failed cache write costs one repeated download later; a cache write that
    // throws costs the transcript obtained a moment ago.
    expect(CACHE).toMatch(/writeCachedTranscript[\s\S]*try \{[\s\S]*catch \(e\)/)
  })

  it('stores what was said, not what the model was shown', () => {
    // ⚠️ MAX_TRANSCRIPT_CHARS is an assessment decision. Recording the capped
    // number here would make a long video look short to anyone reading
    // acquisition costs.
    expect(CACHE).toContain("chars: (t.text ?? '').length")
    expect(CACHE).not.toContain('MAX_TRANSCRIPT_CHARS')
  })
})

describe('the transcripts table is not a product surface', () => {
  it('grants no read to signed-in users', () => {
    // ⚠️ A profile is a product surface; the full text of 4,000 other creators'
    // videos is not.
    expect(MIGRATION).toContain('revoke all on table public.reference_transcripts from anon, authenticated')
    expect(MIGRATION).not.toMatch(/grant select on table public\.reference_transcripts/)
    expect(MIGRATION).toContain('enable row level security')
  })
})
