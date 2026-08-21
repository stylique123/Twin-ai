// ASK ONE MODEL THE SAME QUESTION AGAIN, AND CHANGE NOTHING.
//
// ⚠️ #66 RECORDED THREE ARM-A TIMEOUTS at the shared 90s budget and could not
// say whether they were transient service latency or reproducible Pro
// behaviour. Those are different findings with different consequences: the
// first is noise, the second is a reason to move production extraction.
//
// ⚖️ AND THE INVESTIGATION MUST NOT DAMAGE ITS OWN EVIDENCE. Re-running the
// parity job would have upserted over the very rows that record the timeouts,
// on the key (url, model_a, model_b, arms_asymmetric). This path never writes
// to extraction_parity_trials at all — it appends to its own insert-only table.
//
// ⚠️ AND IT IS NOT A GENERIC RERUN BUTTON. It replicates a trial that HAS an
// arm-A timeout, using that trial's own manifest, on that trial's own cached
// transcript. Every one of those is a hard refusal rather than a default,
// because a "rerun anything" endpoint is what this becomes in five weeks
// otherwise.

import { createHash } from 'node:crypto'
import { db, type Job } from '../db.js'
import { geminiJson } from '../gemini.js'
import { parseContentExtraction } from '../referenceExtraction.js'
import { readCachedTranscript } from '../transcriptCache.js'
import { SYSTEM, SCHEMA, VOCAB, MAX_TRANSCRIPT_CHARS } from './assessReference.js'
import { resolveThinkingBudget } from './extractionParity.js'

interface Payload {
  sourceTrialId?: unknown
  model?: unknown
  attemptNumber?: unknown
}

/** ⚖️ THE SAME DIGEST FUNCTION THE MANIFEST WAS BUILT WITH. A replication that
 *  computed its digests differently would report a mismatch on identical input,
 *  or worse, a match on different input. */
const digestOf = (v: unknown): string =>
  createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex').slice(0, 16)

/** ⚠️ WHAT KIND OF FAILURE, NOT WHICH MESSAGE. A rate is computed over classes;
 *  the exact text belongs in the log. `timeout` is deliberately its own outcome
 *  rather than an error subtype — telling it apart from an error is the entire
 *  question this job exists to answer. */
export function classifyFailure(message: string): { outcome: 'timeout' | 'error'; errorClass: string } {
  const m = message.toLowerCase()
  // The AbortController in gemini.ts surfaces its deadline as "This operation
  // was aborted". That string IS the timeout, and #66's three arm-A refusals
  // are all exactly it.
  if (m.includes('abort') || m.includes('timeout') || m.includes('timed out')) {
    return { outcome: 'timeout', errorClass: 'timeout' }
  }
  if (m.includes('429') || m.includes('quota') || m.includes('resource_exhausted')) {
    return { outcome: 'error', errorClass: 'quota' }
  }
  if (m.includes('400')) return { outcome: 'error', errorClass: 'invalid_argument' }
  if (/\b5\d\d\b/.test(m)) return { outcome: 'error', errorClass: 'upstream_5xx' }
  return { outcome: 'error', errorClass: 'other' }
}

/** ⚠️ A TRIAL WITHOUT AN ARM-A TIMEOUT HAS NOTHING TO REPLICATE. This is the
 *  guard that keeps the job from becoming "rerun anything": the question is
 *  "was that timeout real", and a trial where arm A answered fine is not
 *  evidence about that question in either direction. */
export function assertReplicable(trial: { error_a: string | null }): void {
  const cls = trial.error_a === null ? null : classifyFailure(trial.error_a)
  if (cls?.outcome !== 'timeout') {
    throw new Error(
      'extraction_replication: the source trial has no arm-A timeout to replicate. '
      + 'This job answers "was that timeout reproducible" and nothing else — it is not a '
      + 'general re-run of an arbitrary trial.',
    )
  }
}

/** Everything the replication must reuse rather than choose. */
export interface SourceManifest {
  thinkingResolved: number
  timeoutMs: number
  systemSha: string
  vocabSha: string
  schemaSha: string
}

/** ⚠️ THE MANIFEST IS READ, NEVER REBUILT FROM TODAY'S CODE. If the prompt or
 *  schema moved since the trial ran, this must FAIL rather than quietly measure
 *  the new question under the old trial's name. */
export function readManifest(manifest: unknown): SourceManifest {
  const m = (manifest ?? {}) as Record<string, unknown>
  const need = (k: string): string => {
    const v = m[k]
    if (typeof v !== 'string' || v.length === 0) {
      throw new Error(`extraction_replication: the source trial's manifest has no ${k}. `
        + 'A trial written before the manifest existed cannot be replicated, because there is '
        + 'no record of what question it was asked.')
    }
    return v
  }
  const num = (k: string): number => {
    const v = m[k]
    const n = typeof v === 'string' ? Number(v) : v
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      throw new Error(`extraction_replication: the source trial's manifest has no usable ${k}`)
    }
    return n
  }
  return {
    thinkingResolved: num('thinking_resolved'),
    timeoutMs: num('timeout_ms'),
    systemSha: need('system_sha'),
    vocabSha: need('vocabulary_sha'),
    schemaSha: need('schema_sha'),
  }
}

/** ⚠️ THE QUESTION MUST BE THE SAME QUESTION. Production's prompt, schema and
 *  vocabulary are imported, not copied — so if any of them changed since the
 *  trial, the digests disagree and this refuses. That is the difference between
 *  a replication and a new experiment wearing an old name. */
export function assertQuestionUnchanged(m: SourceManifest): void {
  const now = { system_sha: digestOf(SYSTEM), vocabulary_sha: digestOf(VOCAB), schema_sha: digestOf(SCHEMA) }
  const want = { system_sha: m.systemSha, vocabulary_sha: m.vocabSha, schema_sha: m.schemaSha }
  const moved = (Object.keys(want) as (keyof typeof want)[]).filter((k) => want[k] !== now[k])
  if (moved.length > 0) {
    throw new Error(
      `extraction_replication: ${moved.join(', ')} changed since the source trial ran. `
      + 'Replaying the model against a different prompt or schema would answer a different '
      + 'question and file it under the original trial id.',
    )
  }
}

export async function extractionReplication(job: Job): Promise<Record<string, unknown>> {
  const p = (job.payload ?? {}) as Payload
  const sourceTrialId = typeof p.sourceTrialId === 'string' ? p.sourceTrialId : null
  const model = typeof p.model === 'string' ? p.model : null
  const attemptNumber = typeof p.attemptNumber === 'number' ? p.attemptNumber : null
  if (!sourceTrialId) throw new Error('extraction_replication: sourceTrialId is required')
  if (!model) throw new Error('extraction_replication: model is required — a replication never guesses which model to re-ask')
  if (attemptNumber === null || !Number.isInteger(attemptNumber) || attemptNumber < 1) {
    throw new Error('extraction_replication: attemptNumber must be an integer >= 1')
  }

  const { data: trial, error: readErr } = await db
    .from('extraction_parity_trials')
    .select('id, url, transcript_sha256, model_a, error_a, manifest')
    .eq('id', sourceTrialId)
    .maybeSingle()
  if (readErr) throw new Error(`extraction_replication: could not read the source trial: ${readErr.message}`)
  if (!trial) throw new Error(`extraction_replication: no trial with id ${sourceTrialId}`)

  // ⚖️ THE MODEL MUST BE THE ONE THAT TIMED OUT. Replicating arm A's timeout by
  // running a different model measures that other model, which is a parity
  // question and belongs in a parity trial.
  if (model !== trial.model_a) {
    throw new Error(
      `extraction_replication: requested model ${model} is not the source trial's arm A (${trial.model_a}). `
      + 'A replication re-asks the model that failed, not a substitute for it.',
    )
  }

  assertReplicable(trial as { error_a: string | null })
  const manifest = readManifest(trial.manifest)
  assertQuestionUnchanged(manifest)

  // ⚠️ CACHE ONLY. NEVER ACQUIRE. If the transcript is gone, this must fail —
  // re-downloading would hand the model different bytes, and #66 proved fresh
  // acquisition disagrees with what was stored (133 chars became 5).
  const cached = await readCachedTranscript(trial.url)
  if (!cached) {
    throw new Error(
      'extraction_replication: no cached transcript for this url. A replication reads the '
      + 'durable cache and never re-acquires — a fresh download is different bytes, and the '
      + 'comparison would be meaningless.',
    )
  }

  const full = cached.transcript.text ?? ''
  const text = full.slice(0, MAX_TRANSCRIPT_CHARS)
  const sha = createHash('sha256').update(text).digest('hex')
  if (sha !== trial.transcript_sha256) {
    throw new Error(
      'extraction_replication: the cached transcript no longer matches the digest the source '
      + 'trial recorded. The model would be answering about different bytes under the same trial id.',
    )
  }

  const startedAt = new Date()
  let outcome: 'ok' | 'timeout' | 'error'
  let errorClass: string | null = null
  let fieldsAccepted: number | null = null
  try {
    const raw = await geminiJson(SYSTEM, `${VOCAB}\n\nTranscript:\n${text}`, SCHEMA,
      manifest.timeoutMs, resolveThinkingBudget(manifest.thinkingResolved), model)
    const parsed = parseContentExtraction(raw, {
      referenceId: trial.url, niche: null, assessedAt: startedAt.toISOString(), transcriptAvailable: true,
    })
    outcome = 'ok'
    fieldsAccepted = parsed.fieldsAccepted
  } catch (e) {
    const cls = classifyFailure(e instanceof Error ? e.message : String(e))
    outcome = cls.outcome
    errorClass = cls.errorClass
  }
  const completedAt = new Date()

  // ⚠️ INSERT, NOT UPSERT. A duplicate attempt must fail loudly. Evidence that
  // silently replaces itself is not evidence.
  const { error: wrote } = await db.from('extraction_parity_replications').insert({
    source_trial_id: trial.id,
    url: trial.url,
    model,
    attempt_number: attemptNumber,
    transcript_sha256: sha,
    system_digest: manifest.systemSha,
    vocab_digest: manifest.vocabSha,
    schema_digest: manifest.schemaSha,
    thinking_budget: manifest.thinkingResolved,
    timeout_ms: manifest.timeoutMs,
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    latency_ms: completedAt.getTime() - startedAt.getTime(),
    outcome,
    error_class: errorClass,
    fields_accepted: fieldsAccepted,
  })
  // ⚖️ THIS ONE THROWS. Unlike telemetry, the row IS the deliverable: a
  // replication whose result was not stored did not happen.
  if (wrote) throw new Error(`extraction_replication: could not store the replication: ${wrote.message}`)

  return {
    source_trial_id: trial.id, url: trial.url, model, attempt_number: attemptNumber,
    outcome, error_class: errorClass, fields_accepted: fieldsAccepted,
    latency_ms: completedAt.getTime() - startedAt.getTime(),
  }
}
