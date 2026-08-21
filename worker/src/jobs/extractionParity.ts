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

/** ⚖️ ONE TIMEOUT, SHARED. A per-arm timeout would be another way for the arms
 *  to differ without anybody deciding to differ them. */
const TIMEOUT_MS = 90_000

interface Payload {
  url?: unknown
  /** Defaults to whatever `extract` resolves to today, so arm A is production. */
  modelA?: unknown
  /** ⚠️ EXPLICIT, BECAUSE `undefined` IS NOT "THE DEFAULT". gemini.ts resolves an
   *  absent budget to GEMINI_THINKING_BUDGET or 2048, so passing nothing silently
   *  buys 2048 tokens of reasoning. Arm A leaves it absent ON PURPOSE — that IS
   *  what production does — and arm B names its own. */
  thinkingBudgetA?: unknown
  thinkingBudgetB?: unknown
  /** ⚠️ THE ESCAPE HATCH FOR A DELIBERATE FOLLOW-UP, and nothing else. Absent
   *  means the arms must be identical apart from the model. */
  allowAsymmetry?: unknown
  /** The challenger. Named explicitly — there is no "the flash model" constant
   *  here, because a model id guessed from memory is the chosen-not-measured
   *  mistake this eval exists to avoid. */
  modelB?: unknown
  route?: unknown
}

/** Everything about an arm EXCEPT which model runs it.
 *
 *  ⚠️ THIS TYPE EXISTS SO THE SYMMETRY CHECK HAS SOMETHING TO COMPARE. A trial
 *  whose arms differ in more than the model id cannot answer "do the models
 *  differ" — it answers "do these two configurations differ", which is a
 *  different question wearing the same numbers. */
export interface ArmConfig {
  thinkingBudget: number | undefined
  timeoutMs: number
  systemSha: string
  promptSha: string
  schemaSha: string
}

const digestOf = (v: unknown): string =>
  createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex').slice(0, 16)

/** What gemini.ts will ACTUALLY use for a given budget argument.
 *
 *  ⚠️ COMPARED BY RESOLVED VALUE, NOT BY SOURCE SYNTAX. `undefined` and an
 *  explicit 2048 are the same behaviour and must not be reported as a difference
 *  — the experiment cares what the model was given, not how two callers happened
 *  to spell it. The mirror error is worse and is what this whole assertion
 *  exists for: `undefined` and `0` LOOK similar and are 2048 apart. */
export function resolveThinkingBudget(
  budget: number | undefined, environment: NodeJS.ProcessEnv = process.env,
): number {
  return budget ?? Number(environment.GEMINI_THINKING_BUDGET ?? '2048')
}

/**
 * Refuse to run unless the arms differ ONLY by model id.
 *
 * ⚠️ REFUSE, NOT WARN. A warning on a batch job is read by nobody and the
 * resulting numbers look exactly like valid ones. The first version of this
 * eval gave arm B a thinking budget of 0 while arm A inherited production's
 * 2048 — a deliberate choice, and still the wrong FIRST experiment: it
 * confounded the model with its configuration. Isolate the model id, then vary
 * configuration in a second trial if the first one loses.
 *
 * ⚖️ ASYMMETRY IS REACHABLE, BUT ONLY ON PURPOSE. `allowAsymmetry` exists for
 * exactly that follow-up, and it is recorded on the row so a later reader can
 * never mistake a configuration experiment for a model experiment.
 */
export function assertArmsDifferOnlyByModel(
  modelA: string, modelB: string, a: ArmConfig, b: ArmConfig, allowAsymmetry: boolean,
): void {
  if (modelA === modelB) {
    throw new Error('extraction_parity: modelB must differ from modelA — a trial of one model against itself measures nothing')
  }
  if (allowAsymmetry) return
  // ⚖️ RESOLVED, NOT LITERAL. See resolveThinkingBudget: absent and an explicit
  // 2048 are the same experiment.
  const resolved = (c: ArmConfig) => ({ ...c, thinkingBudget: resolveThinkingBudget(c.thinkingBudget) })
  const ra = resolved(a), rb = resolved(b)
  const differing = (Object.keys(ra) as (keyof ArmConfig)[]).filter((k) => ra[k] !== rb[k])
  if (differing.length > 0) {
    throw new Error(
      `extraction_parity: the arms differ in ${differing.join(', ')} as well as the model. `
      + 'The first parity trial must isolate the model id as the only variable — otherwise the '
      + 'result answers "do these two configurations differ", not "do these two models differ". '
      + 'Pass allowAsymmetry:true ONLY for a deliberate follow-up experiment, which is recorded as such.',
    )
  }
}

/** One arm. Returns its own failure rather than throwing, so a model that
 *  refuses is RECORDED as having refused instead of destroying the other arm's
 *  answer — which is the more interesting half of a parity result. */
async function runArm(model: string, text: string, url: string, thinkingBudget?: number) {
  try {
    const raw = await geminiJson(SYSTEM, `${VOCAB}\n\nTranscript:\n${text}`, SCHEMA,
      TIMEOUT_MS, thinkingBudget, model)
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

/** Refuse to continue if a stored trial for this key was run under a different
 *  manifest.
 *
 *  ⚖️ A MISSING ROW IS NOT A MISMATCH. The first run of a trial has nothing to
 *  disagree with, and treating absence as a failure would make the eval
 *  unrunnable. `unknown` is not `different` — the same three-state discipline
 *  the rest of this codebase keeps. */
export async function assertManifestUnchanged(
  url: string, manifest: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await db.from('extraction_parity_trials')
    .select('manifest')
    .eq('url', url).eq('model_a', manifest.model_a as string)
    .eq('model_b', manifest.model_b as string)
    .eq('asymmetric', manifest.asymmetric as boolean)
    .maybeSingle()
  // A read that failed tells us nothing about the manifest; it must not be read
  // as agreement OR as disagreement.
  if (error || !data || !data.manifest) return
  const stored = data.manifest as Record<string, unknown>
  const moved = Object.keys(manifest).filter((k) => String(stored[k]) !== String(manifest[k]))
  if (moved.length > 0) {
    throw new Error(
      `extraction_parity: this trial already ran under a different manifest — ${moved.join(', ')} `
      + 'changed. A trial id names one experiment; overwriting it would replace the answer to one '
      + 'question with the answer to another. Delete the stored trial deliberately, or run the new '
      + 'configuration as its own experiment.',
    )
  }
}

export async function handleExtractionParity(job: Job): Promise<Record<string, unknown>> {
  const p = (job.payload ?? {}) as Payload
  const url = typeof p.url === 'string' ? p.url.trim() : ''
  if (url === '') throw new Error('extraction_parity: payload.url is required')

  const modelA = typeof p.modelA === 'string' && p.modelA.trim() !== ''
    ? p.modelA.trim() : modelForTask('extract')
  const modelB = typeof p.modelB === 'string' ? p.modelB.trim() : ''
  // ⚖️ ARM B INHERITS ARM A'S THINKING CONFIGURATION BY DEFAULT. The first
  // parity trial isolates the model id; giving the cheap model a different
  // thinking budget would confound the two and produce a number that cannot
  // answer either question. A follow-up trial may vary it deliberately, and must
  // say so via allowAsymmetry.
  const thinkingA = typeof p.thinkingBudgetA === 'number' ? p.thinkingBudgetA : undefined
  const thinkingB = typeof p.thinkingBudgetB === 'number' ? p.thinkingBudgetB : thinkingA
  const allowAsymmetry = p.allowAsymmetry === true
  if (modelB === '') throw new Error('extraction_parity: payload.modelB is required')

  // ⚠️ ASSERTED BEFORE THE DOWNLOAD, NOT BEFORE THE MODEL CALL. An asymmetric
  // trial that discovers itself after acquiring the video has already spent the
  // expensive part to learn something a comparison could have told it for free.
  const armA: ArmConfig = {
    thinkingBudget: thinkingA, timeoutMs: TIMEOUT_MS,
    systemSha: digestOf(SYSTEM), promptSha: digestOf(VOCAB), schemaSha: digestOf(SCHEMA),
  }
  const armB: ArmConfig = {
    thinkingBudget: thinkingB, timeoutMs: TIMEOUT_MS,
    systemSha: digestOf(SYSTEM), promptSha: digestOf(VOCAB), schemaSha: digestOf(SCHEMA),
  }
  assertArmsDifferOnlyByModel(modelA, modelB, armA, armB, allowAsymmetry)

  // ⚠️ THE MANIFEST IS THE EXPERIMENT'S IDENTITY, and it is pinned before either
  // arm runs. A retry or a partially resumed batch must not be able to change
  // what is being compared underneath the same trial — that would silently turn
  // one experiment into a mixture of two, and the row would look fine.
  const manifest = {
    model_a: modelA, model_b: modelB,
    thinking_resolved: resolveThinkingBudget(thinkingA),
    timeout_ms: TIMEOUT_MS,
    system_sha: armA.systemSha, vocabulary_sha: armA.promptSha, schema_sha: armA.schemaSha,
    asymmetric: allowAsymmetry,
  }

  // ⚖️ READABLE ON PURPOSE. Logs are not the source of truth — the row is — but
  // when something goes sideways at 2am a readable line is the last primitive
  // tool anybody has.
  console.log([
    'PARITY TRIAL ACCEPTED',
    `  A: ${modelA}`,
    `  B: ${modelB}`,
    `  thinking:   ${allowAsymmetry ? `A=${resolveThinkingBudget(thinkingA)} B=${resolveThinkingBudget(thinkingB)}` : 'identical'}`,
    `  timeout:    ${allowAsymmetry ? 'see manifest' : 'identical'}`,
    `  system:     ${manifest.system_sha}`,
    `  vocabulary: ${manifest.vocabulary_sha}`,
    `  schema:     ${manifest.schema_sha}`,
    `  asymmetric: ${allowAsymmetry}`,
  ].join('\n'))

  // ⚠️ AND IT MAY NOT MOVE. An existing trial for this key whose manifest
  // disagrees means the question changed between runs; overwriting it would
  // replace an answer to one question with an answer to another under the same
  // id. Refuse and say which field moved.
  await assertManifestUnchanged(url, manifest)

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
  const a = await runArm(modelA, text, url, thinkingA)
  const b = await runArm(modelB, text, url, thinkingB)

  const { error: wrote } = await db.from('extraction_parity_trials').upsert({
    url,
    transcript_sha256: sha,
    transcript_chars: text.length,
    model_a: modelA, model_b: modelB,
    // Recorded, so 'which configuration was compared' never has to be inferred
    // from a commit date. null on arm A means 'production's own resolution'.
    thinking_budget_a: thinkingA ?? null, thinking_budget_b: thinkingB ?? null,
    asymmetric: allowAsymmetry,
    manifest,
    profile_a: a.profile, profile_b: b.profile,
    rejections_a: a.rejections, rejections_b: b.rejections,
    fields_accepted_a: a.fieldsAccepted, fields_accepted_b: b.fieldsAccepted,
    error_a: a.error, error_b: b.error,
  }, { onConflict: 'url,model_a,model_b,asymmetric' })
  if (wrote) throw new Error(`extraction_parity: could not store the trial: ${wrote.message}`)

  return {
    url, model_a: modelA, model_b: modelB,
    thinking_a: thinkingA ?? null, thinking_b: thinkingB ?? null,
    asymmetric: allowAsymmetry,
    identical: ['system', 'vocabulary', 'schema', 'input', 'thinking', 'timeout', 'parser', 'validator'],
    fields_a: a.fieldsAccepted, fields_b: b.fieldsAccepted,
    rejected_a: a.rejections?.length ?? null, rejected_b: b.rejections?.length ?? null,
    error_a: a.error, error_b: b.error,
  }
}
