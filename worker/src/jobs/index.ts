import type { Job } from '../db.js'
import { handleTranscribe } from './transcribe.js'
import { handleBuildVoice } from './voice.js'
import { handleAutoEdit } from './autoedit.js'
import { handleScrapeDna } from './scrapeDna.js'

export type JobHandler = (job: Job) => Promise<Record<string, unknown>>

// Registry of job type -> handler. Add `publish`, etc. here as phases land.
// (`transcribe` was retired — nothing enqueues it; ingest-reference enqueues `ingest`.)
export const handlers: Record<string, JobHandler> = {
  ingest: handleTranscribe,
  build_voice: handleBuildVoice,
  autoedit: handleAutoEdit,
  scrape_dna: handleScrapeDna,
}
