// A CREATOR PASTES THE VIDEO SHE WISHES SHE HAD MADE, AND NOTHING LOOKED AT IT.
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-14, NOT REASONED. 891 `visual_profile` rows
// exist and every one is a `gallery_items` row we scraped ourselves; 0 are
// pasted references and 0 are the creator's own posts. Of 134 `ingest` jobs
// across 77 distinct pasted URLs, ZERO requested frames — `frames` is an
// `assess_reference` payload key and the ingest path enqueued nothing. The two
// paths had never exchanged a URL.
//
// ⚖️ AND THE ACTUAL BLOCKER WAS THE CACHE, NOT THE ENQUEUE. `framesOnly` refuses
// on a cache miss by design, and `reference_transcripts` is keyed on the raw url
// while this path writes `transcripts` keyed on `url_key` — different tables. So
// an enqueue without the cache write would have produced a sweep that skipped
// every single row and logged `no_cached_transcript` for all of them.
//
// ⚠️ WHOLE-LINE COMMENTS ARE STRIPPED BEFORE MATCHING. This file names every one
// of these symbols in prose while explaining the rule, and a naive `toContain`
// would be satisfied by the documentation rather than the code — the
// mention-versus-call trap this repo has hit twice. Whole lines only, never
// everything after `//`, which would delete real code following a string
// containing a slash.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const strip = (src: string): string => src.split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n')

const RAW = readFileSync(join(REPO, 'worker/src/jobs/transcribe.ts'), 'utf8')
const CODE = strip(RAW)
// ⚠️ THE SECOND PATH, AND IT CARRIES 30% OF THE TRAFFIC. Measured on production
// 2026-09-14: of 134 `ingest` jobs, 40 were inserted `done` by the edge function
// on a transcript-cache hit and NEVER claimed by the worker. A frames enqueue
// that lives only in `handleTranscribe` covers 85 of 125 completed pastes and
// misses the rest — with every test green, because the worker copy is correct.
const EDGE = strip(readFileSync(join(REPO, 'supabase/functions/ingest-reference/index.ts'), 'utf8'))

describe('a pasted reference reaches the visual pass', () => {
  it('enqueues an assess_reference job from the ingest path', () => {
    // ⚠️ THE READER-REMOVAL ASSERTION. Delete the enqueue and this fails.
    expect(CODE).toContain("type: 'assess_reference'")
  })

  it('asks for frames with EXACTLY true on both flags', () => {
    // A truthy-but-not-true value enables neither the spend nor the refusal —
    // the rule `parseRoute` follows for the paid rungs. `frames: 1` would read
    // as a request and buy nothing.
    expect(CODE).toMatch(/frames:\s*true/)
    expect(CODE).toMatch(/framesOnly:\s*true/)
  })

  it('writes the transcript cache, and writes it BEFORE the enqueue', () => {
    expect(CODE).toContain('writeCachedTranscript(url, t)')
    // ⚠️ THE ORDER IS THE WHOLE CLAIM. Enqueued first, the job can start before
    // the cache row exists and refuse on a miss for a transcript we already had.
    // ⚠️ THE CALL SITE, NOT THE IMPORT. Anchoring on the bare symbol matched
    // the import line, which precedes everything — so the assertion passed
    // vacuously and could not have caught an enqueue placed before the write.
    // The test was wrong, not the code.
    expect(CODE.indexOf('writeCachedTranscript(url, t)'))
      .toBeLessThan(CODE.indexOf("'assess_reference'"))
  })

  it('imports the cache writer rather than reaching into the table', () => {
    expect(CODE).toContain("from '../transcriptCache.js'")
    // One place decides what a cached transcript looks like. A local upsert here
    // would be a second definition that drifts from the reader's.
    expect(CODE).not.toMatch(/from\('reference_transcripts'\)/)
  })

  it('never retries: a retry re-spends the video download', () => {
    expect(CODE).toMatch(/max_attempts:\s*1/)
  })

  it('does both only for ingest, never for a creator own post', () => {
    // `transcribe` is one of HER posts, picked by the DNA scan. Those belong to
    // the own-posts pass (0209) with its own median/top selection and its own
    // cooldown; caching them as "references" would put her voice in a reference
    // cache and hand a stranger's ladder her own video.
    const at = CODE.indexOf('writeCachedTranscript(url, t)')
    const guard = CODE.lastIndexOf("job.type === 'ingest'", at)
    expect(guard).toBeGreaterThan(-1)
    expect(at - guard).toBeLessThan(200)
  })

  it('runs after the transcript is safely stored, never before', () => {
    // The insert can throw. Spending a download on a reference whose transcript
    // was lost buys frames nothing will ever read alongside words.
    expect(CODE.indexOf('if (error) throw error')).toBeLessThan(CODE.indexOf("'assess_reference'"))
  })

  it('cannot cost the paste: the enqueue failure is recorded, not thrown', () => {
    expect(CODE).toMatch(/reference_frames_unqueued/)
    const block = CODE.slice(CODE.indexOf("'assess_reference'"))
    expect(block).toMatch(/catch \(err\)/)
    // ⚠️ A CATCH THAT RETHROWS IS NOT A CATCH, AND ASSERTING ONLY THAT ONE
    // EXISTS LET THAT MUTANT LIVE. Caught here and re-thrown, a queue failure
    // fails the whole ingest job and the creator loses the transcript she was
    // waiting on — the precise outcome this branch exists to prevent, reported
    // as a success by the first version of this assertion.
    const handler = block.slice(block.indexOf('catch (err)'), block.indexOf('return {'))
    expect(handler).not.toMatch(/\bthrow\b/)
  })

  describe('the cache-hit path, which never reaches the worker', () => {
    it('enqueues the frames pass from the edge function too', () => {
      // ⚠️ READER-REMOVAL FOR THE SECOND PATH. Delete this enqueue and 30% of
      // pastes get no visual pass while every worker-side test still passes.
      expect(EDGE).toContain("type: 'assess_reference'")
    })

    it('asks with EXACTLY true on both flags, like the worker copy', () => {
      expect(EDGE).toMatch(/frames:\s*true/)
      expect(EDGE).toMatch(/framesOnly:\s*true/)
    })

    it('enqueues inside the cache-hit branch, not on every request', () => {
      // Outside the `if (cachedId)` branch this would fire on the queued path
      // as well, double-queueing every ordinary paste.
      const branch = EDGE.indexOf('if (cachedId)')
      const enqueue = EDGE.indexOf("type: 'assess_reference'")
      const ret = EDGE.indexOf('cached: true })', enqueue)
      expect(branch).toBeGreaterThan(-1)
      expect(enqueue).toBeGreaterThan(branch)
      expect(ret).toBeGreaterThan(enqueue)
    })

    it('never retries, and never fails a served cache hit', () => {
      expect(EDGE).toMatch(/max_attempts:\s*1/)
      const block = EDGE.slice(EDGE.indexOf("type: 'assess_reference'"))
      const handler = block.slice(block.indexOf('catch (err)'), block.indexOf('return json'))
      // A catch that rethrows would turn a transcript we already cloned and
      // could have served into an error the creator sees.
      expect(handler).not.toMatch(/\bthrow\b/)
    })

    it('both copies spell the payload the same way', () => {
      // Two enqueues of the same job type in two languages is exactly where a
      // flag drifts. The parity is asserted, not assumed.
      const shape = /frames:\s*true,\s*framesOnly:\s*true/
      expect(CODE).toMatch(shape)
      expect(EDGE).toMatch(shape)
    })
  })
})
