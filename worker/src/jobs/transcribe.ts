import { db, type Job } from '../db.js'
import { transcribeFromUrl } from '../media.js'
import { deriveStructure } from '../structure.js'

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
  let structure: unknown = null
  if (job.type === 'ingest') {
    try {
      structure = await deriveStructure(t)
    } catch (err) {
      console.error('deriveStructure failed:', err instanceof Error ? err.message : err)
    }
  }

  const { data, error } = await db
    .from('transcripts')
    .insert({
      owner_id: job.owner_id,
      source_url: url,
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

  return { transcript_id: data.id, language: t.language, words: t.words.length, structured: structure !== null }
}
