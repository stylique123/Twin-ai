import type { Job } from '../db.js'
import { handleTranscribe } from './transcribe.js'
import { handleBuildVoice } from './voice.js'
import { handleScrapeDna } from './scrapeDna.js'

export type JobHandler = (job: Job) => Promise<Record<string, unknown>>

// Registry of job type -> handler. Add `publish`, etc. here as phases land.
// (`transcribe` was retired — nothing enqueues it; ingest-reference enqueues `ingest`.
// `autoedit` was removed with the old AI editor; the rebuilt editor registers its
// own job type here.)
export const handlers: Record<string, JobHandler> = {
  ingest: handleTranscribe,
  build_voice: handleBuildVoice,
  scrape_dna: handleScrapeDna,
}
