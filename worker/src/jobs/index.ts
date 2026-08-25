import type { Job } from '../db.js'
import { handleTranscribe } from './transcribe.js'
import { handleBuildVoice } from './voice.js'
import { handleScrapeDna } from './scrapeDna.js'
import { handleValidateSource } from './validateSource.js'
import { handleValidateClip } from './validateClip.js'
import { handleEditorV2 } from './editorV2.js'
import { handlePurgeMedia } from './purgeMedia.js'
import { handleExtractProduct } from './extractProduct.js'
import { handleAssessReference } from './assessReference.js'
import { handleExtractionParity } from './extractionParity.js'
import { extractionReplication } from './extractionReplication.js'
import { handleSampleOwnAccount } from './sampleOwnAccount.js'

export type JobHandler = (job: Job) => Promise<Record<string, unknown>>

// Registry of job type -> handler. Add `publish`, etc. here as phases land.
// (`transcribe` was retired — nothing enqueues it; ingest-reference enqueues `ingest`.
// `autoedit` was removed with the old AI editor and is blocked at the database.
// `validate_source` VALIDATES an uploaded recording — it is not an editor job.
// `validate_clip` MEASURES a screen capture (Phase 12 item 13). It is a
// deliberately separate handler, not a mode of validate_source: a clip carries
// no capture manifest and no script binding, and — the part worth being
// paranoid about — it must never write generations.source_asset_id.
// `editor_v2` is the rebuilt editor's orchestration loop — Phase 3 registers
// it with SIMULATED stage handlers; real stages land in later phases.)
export const handlers: Record<string, JobHandler> = {
  ingest: handleTranscribe,
  build_voice: handleBuildVoice,
  scrape_dna: handleScrapeDna,
  validate_source: handleValidateSource,
  validate_clip: handleValidateClip,
  editor_v2: handleEditorV2,
  // Reads a creator-supplied product page and stores what it says, each fact
  // GRADED by `productExtractionContract`. In the worker rather than the edge
  // because fetching an arbitrary URL is slow, sometimes blocked, and must not
  // die when a browser tab closes — the dependency YouTube DNA was just moved
  // off. See `extractProduct.ts`.
  extract_product: handleExtractProduct,
  assess_reference: handleAssessReference,
  // Looks at a SAMPLE of the creator's OWN videos and records how many are them
  // talking to camera. Its own job rather than part of `scrape_dna` because six
  // downloads plus six model calls is latency a creator would feel during
  // onboarding, and the entire output is an optional warning. See
  // `sampleOwnAccount.ts` for why it does not reuse build_voice's download.
  sample_own_account: handleSampleOwnAccount,
  extraction_parity: handleExtractionParity,
  extraction_replication: extractionReplication,
  // Deletes the BYTES behind a removed media_asset. Enqueued by a database
  // trigger, not by application code, so every route to deletion is covered.
  purge_media: handlePurgeMedia,
}
