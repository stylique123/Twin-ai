import type { Job } from '../db.js'
import { handleTranscribe } from './transcribe.js'
import { handleBuildVoice } from './voice.js'

export type JobHandler = (job: Job) => Promise<Record<string, unknown>>

// Registry of job type -> handler. Add `render`, `publish`, etc. here as phases land.
export const handlers: Record<string, JobHandler> = {
  ingest: handleTranscribe,
  transcribe: handleTranscribe,
  build_voice: handleBuildVoice,
}
