import { db, publishEarlyLook, type Job } from '../db.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadReference } from '../media.js'
import { parseRoute } from '../downloadRoute.js'
import { earlyLook } from '../earlyLook.js'
import { earlyLookStep } from '../earlyLookStep.js'
import { transcribeFromUrl } from '../media.js'
import { deriveStructure } from '../structure.js'

// Normalized cache key for a reference URL: host (minus www) + path, plus the
// YouTube ?v= id (which lives in the query). Drops other query/hash noise so the
// same video pasted by different users hits the cache. Must match ingest-reference.
function urlKey(raw: string): string {
  try {
    const u = new URL(raw)
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    const v = u.searchParams.get('v')
    const path = u.pathname.replace(/\/+$/, '').toLowerCase()
    return host + path + (v ? `?v=${v.toLowerCase()}` : '')
  } catch {
    return raw.toLowerCase().trim()
  }
}

// Handles `ingest` and `transcribe` jobs.
// payload: { url: string, platform?: string }
// Result: persists a transcripts row (+ derived structure for `ingest`) and returns its id.
export async function handleTranscribe(job: Job): Promise<Record<string, unknown>> {
  const url = String((job.payload as Record<string, unknown>).url ?? '').trim()
  if (!url) throw new Error('payload.url is required')
  const platform = (job.payload as Record<string, unknown>).platform as string | undefined

  // ⚠️ THE TALKING-HEAD CHECK RUNS FIRST, AND THAT IS THE WHOLE POINT. TwinAI is
  // talking-head only, and the requirement is that a creator hears "this won't
  // work well" in seconds rather than after a full analysis. Transcription is
  // the slow part, so the check goes in front of it and publishes its answer to
  // the job row on the way past — the screen is polling that row already.
  //
  // ⚖️ AND ONLY FOR `ingest`, the path a creator actually waits on. `transcribe`
  // is retired and nothing enqueues it; paying for a triage download on a batch
  // path with nobody watching would buy a warning no one reads.
  //
  // ⚠️ IT NEVER BLOCKS, NEVER THROWS, AND NEVER DECIDES. The verdict and the
  // words live in @twinai/shared; this records three raw answers. Every failure
  // is an all-null answer, which reads as `unsure` and passes silently.
  if (job.type === 'ingest') {
    const dir = await mkdtemp(join(tmpdir(), 'twinai-triage-'))
    try {
      await earlyLookStep(join(dir, 'triage.mp4'), {
        // ⚖️ `triage`, NOT `video`: 360p, because a check whose entire purpose
        // is to be early must not wait on a 720p master to arrive.
        download: async (outPath) => {
          await downloadReference(url, parseRoute(undefined), { medium: 'triage', outPath, timeoutMs: 45_000 })
        },
        look: earlyLook,
        persist: (r) => publishEarlyLook(job.id, r),
      })
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  }

  const t = await transcribeFromUrl(url)

  // For reference ingestion, derive the real structure now (best-effort: a
  // structure failure must not lose the transcript we already paid to produce).
  // We also surface the failure reason into the job result so it's diagnosable
  // from the DB — not just the worker host's local logs.
  let structure: unknown = null
  let structureError: string | null = null
  if (job.type === 'ingest') {
    try {
      structure = await deriveStructure(t)
    } catch (err) {
      structureError = err instanceof Error ? err.message : String(err)
      console.error('deriveStructure failed:', structureError)
    }
  }

  const { data, error } = await db
    .from('transcripts')
    .insert({
      owner_id: job.owner_id,
      source_url: url,
      url_key: urlKey(url),
      platform: platform ?? null,
      language: t.language,
      duration_sec: t.duration_sec,
      text: t.text,
      words: t.words,
      segments: t.segments,
      structure,
      // ⚠️ WHOSE VOICE THIS IS, RECORDED WHERE IT IS STILL KNOWN (0135). This
      // function is the only place that can tell: `ingest` is a reference being
      // analysed, `transcribe` is one of the creator's own posts picked by the
      // DNA scan. One line later the rows are identical, and a voice compiler
      // reading the wrong ones would teach the writer a stranger's cadence under
      // a label that says to weight it above every other signal.
      subject: job.type === 'ingest' ? 'reference' : 'own',
    })
    .select('id')
    .single()
  if (error) throw error

  return {
    transcript_id: data.id,
    language: t.language,
    words: t.words.length,
    // DECLARED BY THE CLIENT ALL ALONG AND NEVER EMITTED. `IngestJob.result`
    // (packages/shared/src/api.ts) has carried an optional `duration_sec` since
    // it was written; nothing ever set it, so every reader saw `undefined` and
    // had no way to tell that from a reference with no duration.
    //
    // It matters now because reference validation needs exactly two facts —
    // how long it is and how much is said in it — and a caller that cannot see
    // the first cannot distinguish "a twelve-minute podcast" from "we did not
    // measure", which is the one distinction that whole check is built around.
    duration_sec: t.duration_sec,
    structured: structure !== null,
    structure_error: structureError,
  }
}
