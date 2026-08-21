// THE SAME QUESTION, ASKED OF TWO MODELS, ON ONE TRANSCRIPT.
//
// ⚠️ THIS EXISTS BECAUSE THE ROUTING LOOKS INVERTED AND NOBODY CHOSE IT.
// `decide` — the Director, which shapes every video — runs on flash. `extract`
// — schema-constrained parsing, whose own env comment says a flash model costs
// "no quality loss on these schema-constrained tasks" — runs on pro. The
// catalog that recorded this says the next move is an EVAL, not an edit, and
// this is that eval.
//
// ⚖️ IT IMPORTS PRODUCTION'S PROMPT, SCHEMA AND VOCABULARY RATHER THAN COPYING
// THEM. A copy would measure the copy. This repo has made that exact mistake:
// a re-declared NOT_DETERMINED sentinel filed every honest refusal as malformed.
//
// ⚠️ AND IT CHANGES NO ROUTING. Both models are named per call. `modelForTask`
// is untouched, `decide` stays frozen, and nothing about production extraction
// moves until somebody reads the result and decides.

import { createHash } from 'node:crypto'
import { db, type Job } from '../db.js'
import { parseRoute } from '../downloadRoute.js'
import { transcribeFromUrl } from '../media.js'
import { geminiJson } from '../gemini.js'
import { modelForTask } from '../modelRouting.js'
import { parseContentExtraction } from '../referenceExtraction.js'
import { readCachedTranscript, writeCachedTranscript } from '../transcriptCache.js'
import { SYSTEM, SCHEMA, VOCAB, MAX_TRANSCRIPT_CHARS } from './assessReference.js'

/** Below this there is no speech worth reading, and no comparison worth making:
 *  both models would be asked to extract structure from a caption. Mirrors
 *  assessReference's own floor. */
const MIN_TRANSCRIPT_CHARS = 120

interface Payload {
  url?: unknown
  /** Defaults to whatever `extract` resolves to today, so arm A is production. */
  modelA?: unknown
  /** The challenger. Named explicitly — there is no "the flash model" constant
   *  here, because a model id guessed from memory is the chosen-not-measured
   *  mistake this eval exists to avoid. */
  modelB?: unknown
  route?: unknown
}

/** One arm. Returns its own failure rather than throwing, so a model that
 *  refuses is RECORDED as having refused instead of destroying the other arm's
 *  answer — which is the more interesting half of a parity result. */
async function runArm(model: string, text: string, url: string) {
  try {
    const raw = await geminiJson(SYSTEM, `${VOCAB}\n\nTranscript:\n${text}`, SCHEMA,
      90_000, undefined, model)
    const { profile, rejections, fieldsAccepted } = parseContentExtraction(raw, {
      referenceId: url, niche: null, assessedAt: new Date().toISOString(),
      transcriptAvailable: true,
    })
    return { profile, rejections, fieldsAccepted, error: null as string | null }
  } catch (e) {
    return {
      profile: null, rejections: null, fieldsAccepted: null,
      error: (e instanceof Error ? e.message : String(e)).slice(0, 500),
    }
  }
}

export async function handleExtractionParity(job: Job): Promise<Record<string, unknown>> {
  const p = (job.payload ?? {}) as Payload
  const url = typeof p.url === 'string' ? p.url.trim() : ''
  if (url === '') throw new Error('extraction_parity: payload.url is required')

  const modelA = typeof p.modelA === 'string' && p.modelA.trim() !== ''
    ? p.modelA.trim() : modelForTask('extract')
  const modelB = typeof p.modelB === 'string' ? p.modelB.trim() : ''
  if (modelB === '') throw new Error('extraction_parity: payload.modelB is required')
  if (modelB === modelA) throw new Error('extraction_parity: modelB must differ from modelA')

  // ⚖️ ONE ACQUISITION. The cache means a trial on an already-read reference
  // costs no download at all, which is the whole point of 0153.
  const cached = await readCachedTranscript(url)
  const transcript = cached ? cached.transcript : await transcribeFromUrl(url, parseRoute(p.route))
  if (!cached) await writeCachedTranscript(url, transcript)

  const full = transcript.text ?? ''
  if (full.trim().length < MIN_TRANSCRIPT_CHARS) {
    return { url, skipped: 'no_speech', transcript_chars: full.length }
  }
  const text = full.slice(0, MAX_TRANSCRIPT_CHARS)

  // ⚠️ THE DIGEST IS OF WHAT THE MODELS ACTUALLY SAW — after the cap, not before.
  // Digesting the full transcript would assert identical input while the arms
  // read a truncation of it.
  const sha = createHash('sha256').update(text).digest('hex')

  // ⚖️ SEQUENTIAL, NOT CONCURRENT. Two simultaneous calls against a 250/day
  // allowance make a quota refusal land on an arbitrary arm; in sequence, a
  // refusal is attributable and the first arm's answer survives it.
  const a = await runArm(modelA, text, url)
  const b = await runArm(modelB, text, url)

  const { error: wrote } = await db.from('extraction_parity_trials').upsert({
    url,
    transcript_sha256: sha,
    transcript_chars: text.length,
    model_a: modelA, model_b: modelB,
    profile_a: a.profile, profile_b: b.profile,
    rejections_a: a.rejections, rejections_b: b.rejections,
    fields_accepted_a: a.fieldsAccepted, fields_accepted_b: b.fieldsAccepted,
    error_a: a.error, error_b: b.error,
  }, { onConflict: 'url,model_a,model_b' })
  if (wrote) throw new Error(`extraction_parity: could not store the trial: ${wrote.message}`)

  return {
    url, model_a: modelA, model_b: modelB,
    fields_a: a.fieldsAccepted, fields_b: b.fieldsAccepted,
    rejected_a: a.rejections?.length ?? null, rejected_b: b.rejections?.length ?? null,
    error_a: a.error, error_b: b.error,
  }
}
