import { db, publishEarlyLook, type Job } from '../db.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadReference } from '../media.js'
import { parseRoute } from '../downloadRoute.js'
import { earlyLook } from '../earlyLook.js'
import { earlyLookStep } from '../earlyLookStep.js'
import { transcribeFromUrl, readReferenceVideoFacts, scrapeProfile } from '../media.js'
import { env } from '../env.js'
import {
  workerReferenceMetrics, EMPTY_WORKER_REFERENCE_METRICS,
  type WorkerReferenceMetrics,
} from '../referenceMetrics.js'
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

  // ⚠️⚠️ WHAT THE VIDEO DID, CAPTURED WHERE IT IS STILL KNOWABLE. Measured in
  // production 2026-09-12: 125 references in `transcripts`, every one carrying
  // the words and not one carrying a view count. Creators paste the videos they
  // wish they had made — a taste-filtered sample no scraper can produce — and
  // Layer D forgot every one of them the moment it was used.
  //
  // ⚖️ AFTER THE TRANSCRIPT, NEVER BEFORE IT. The transcript is what the creator
  // is waiting on; a metadata call in front of it would add seconds to every
  // paste to buy a number shown later. And `readReferenceVideoFacts` cannot
  // throw, so the reference survives its own measurement failing.
  const metrics: WorkerReferenceMetrics = job.type === 'ingest'
    ? await readReferenceMetrics(url, platform)
    : EMPTY_WORKER_REFERENCE_METRICS

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
      // ⚠️ NULL, NOT 0, ALL THE WAY DOWN — and the database refuses a 0 anyway
      // (0201). 0 is how the scraped corpus spells "captured nothing", and 945
      // gallery rows already prove what reading it as a quantity does to a
      // median.
      views: metrics.views,
      creator_audience: metrics.creatorAudience,
      creator_handle: metrics.creatorHandle,
      relative_lift: metrics.relativeLift,
      relative_basis: metrics.relativeBasis,
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

/**
 * The two reads behind one reference's numbers.
 *
 * ⚠️ THE FREE READ ALWAYS RUNS; THE PAID ONE IS A SWITCH. The video's own views,
 * the uploader's follower count and the uploader's name come from a metadata
 * call that costs nothing. The uploader's OTHER videos — the only way to know
 * whether this one beat their normal — is a billed Actor run per pasted link on
 * YouTube and Instagram, so it waits behind `REFERENCE_SIBLING_SCRAPE`.
 *
 * ⚖️ AND A FAILED SIBLING READ KEEPS THE FREE FACTS. `workerReferenceMetrics`
 * already refuses a lift it cannot attribute or cannot base on enough videos, so
 * there is no branch here deciding when a median is safe — one floor, in one
 * place, is why it cannot be quietly opted out of.
 */
async function readReferenceMetrics(
  url: string, platform: string | undefined,
): Promise<WorkerReferenceMetrics> {
  const facts = await readReferenceVideoFacts(url)
  let siblingReaches: number[] = []
  if (env.referenceSiblingScrape && facts.creatorHandle !== null && platform) {
    try {
      const { posts } = await scrapeProfile(facts.creatorHandle, platform, env.referenceSiblingLimit)
      // ⚠️ `plays` IS ALREADY THREE-STATE IN ScrapedPost, and that is why the
      // nulls are dropped rather than defaulted. A post whose play count the
      // source omitted is not a post nobody watched.
      siblingReaches = posts.map((p) => p.plays).filter((v): v is number => v !== null)
    } catch (err) {
      console.warn(JSON.stringify({
        event: 'reference_siblings_unread',
        reason: err instanceof Error ? err.message : String(err),
      }))
    }
  }
  return workerReferenceMetrics({ ...facts, siblingReaches })
}
