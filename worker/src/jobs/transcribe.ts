import { db, type Job } from '../db.js'
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
    })
    .select('id')
    .single()
  if (error) throw error

  return {
    transcript_id: data.id,
    language: t.language,
    words: t.words.length,
    structured: structure !== null,
    structure_error: structureError,
  }
}
