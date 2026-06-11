import { db, type Job } from '../db.js'
import { transcribeFromUrl } from '../media.js'

// Handles `ingest` and `transcribe` jobs.
// payload: { url: string, platform?: string }
// Result: persists a transcripts row and returns its id.
export async function handleTranscribe(job: Job): Promise<Record<string, unknown>> {
  const url = String((job.payload as Record<string, unknown>).url ?? '').trim()
  if (!url) throw new Error('payload.url is required')
  const platform = (job.payload as Record<string, unknown>).platform as string | undefined

  const t = await transcribeFromUrl(url)

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
    })
    .select('id')
    .single()
  if (error) throw error

  return { transcript_id: data.id, language: t.language, words: t.words.length }
}
