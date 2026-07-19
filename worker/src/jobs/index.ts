import type { Job } from '../db.js'
import { handleTranscribe } from './transcribe.js'
import { handleBuildVoice } from './voice.js'
import { handleScrapeDna } from './scrapeDna.js'
import { handleValidateSource } from './validateSource.js'
import { handleEditorV2 } from './editorV2.js'

export type JobHandler = (job: Job) => Promise<Record<string, unknown>>

// Registry of job type -> handler. Add `publish`, etc. here as phases land.
// (`transcribe` was retired — nothing enqueues it; ingest-reference enqueues `ingest`.
// `autoedit` was removed with the old AI editor and is blocked at the database.
// `validate_source` VALIDATES an uploaded recording — it is not an editor job.
// `editor_v2` is the rebuilt editor's orchestration loop — Phase 3 registers
// it with SIMULATED stage handlers; real stages land in later phases.)
export const handlers: Record<string, JobHandler> = {
  ingest: handleTranscribe,
  build_voice: handleBuildVoice,
  scrape_dna: handleScrapeDna,
  validate_source: handleValidateSource,
  editor_v2: handleEditorV2,
}
