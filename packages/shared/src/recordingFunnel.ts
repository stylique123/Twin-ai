// WHERE A CREATOR STOPS, WHICH IS THE ONLY QUESTION THIS PRODUCT HAS NOT ASKED.
//
// ⚠️ 41 SCRIPTS GENERATED. 3 RECORDINGS. 0 EXPORTS. 0 EDITS. Measured on
// production, and it is the number that reframes every quality debate we have
// had — resolver fill rates, substance grading, speech polish are all being
// tuned on evidence from nobody who finished a video. A script is not the
// product; a video the creator posts is. Everything between those two is
// currently unobserved.
//
// ⚖️ SO THIS COUNTS STAGES, NOT SCRIPTS. "How good was the script" is a question
// we already ask six ways. "Did they record it" is one we have never asked.
//
// ⚠️ AND A FUNNEL SAYS WHERE PEOPLE DIED, NEVER WHAT KILLED THEM. I wrote
// "Twin's problem is recording friction, not script quality" off the first run
// of this and it does not follow. 39 of 41 never opening the camera is
// consistent with a bad script, an irrelevant premise, an intimidating record
// button, no time, or somebody who was only ever clicking around. Those need
// opposite fixes. `script_intent` exists because the drop is unattributable
// without it, and it is the single most valuable event this product does not
// yet collect.
//
// ⚠️ AND IT IS DERIVED, NOT A NEW SOURCE OF TRUTH. Every stage but the last is
// already recorded somewhere: `generations`, `script_edits`,
// `source_capture_intents`, `media_assets`, `edit_projects`, `edit_outputs`.
// Minting a second record of "did they record" would create two answers to one
// question and guarantee they disagree. This reads what those tables already
// say. The ONE thing nothing can answer is whether the creator would actually
// post it, and that is the only thing added.

/**
 * The stages, in the order a creator passes them.
 *
 * ⚖️ `script_edited` SITS BEFORE `recording_started` ON PURPOSE, and the
 * ordering is load-bearing rather than cosmetic. An edit made BEFORE recording
 * is a creator fixing a script they did not trust; an edit made after is a
 * creator fixing something they heard themselves say. Those are different
 * signals about different failures, and a funnel that pools them can tell you
 * neither.
 */
export const FUNNEL_STAGES = [
  'reference_selected',
  'script_generated',
  'script_edited',
  // ⚠️ THE EVENT THAT MAKES THE DROP READABLE. Everything above is Twin acting;
  // everything below is the creator acting. This is the seam, and it is where
  // 95% are lost — so it is the one place a stated reason converts an
  // unattributable number into a cause.
  'script_intent',
  'recording_started',
  'recording_completed',
  // ⚖️ SPLIT OUT FROM `export_completed` BECAUSE THEY FAIL SEPARATELY. A take
  // that uploads and is then REJECTED by validation never creates an edit
  // project — which is exactly what production shows: one recording rejected for
  // `duration_unknown`, two stuck uploading, zero edit projects ever. Pooling
  // them would have reported "nobody exports" and hidden that we refused the
  // only take anybody finished.
  'edit_project_created',
  'export_completed',
  'publish_intent',
] as const
export type FunnelStage = (typeof FUNNEL_STAGES)[number]

/**
 * Whether a stage happened — and THREE states, not two.
 *
 * ⚠️ `pending` IS NOT `no`, AND CONFLATING THEM IS THE WHOLE TRAP. A generation
 * four minutes old with no recording has not been abandoned; a generation from
 * nine days ago with no recording has. A two-state funnel reports both as a drop
 * and produces an abandonment rate that is mostly just recent activity —
 * a number that gets worse the more people use the product.
 *
 * ⚖️ `not_applicable` IS SEPARATE AGAIN. A creator who never edited the script
 * did not fail the edit stage; that stage is optional by design, and scoring it
 * as a drop would punish a script good enough to record as written — the exact
 * outcome we want.
 */
export const STAGE_STATES = ['reached', 'pending', 'dropped', 'not_applicable'] as const
export type StageState = (typeof STAGE_STATES)[number]

/**
 * Stages a creator may skip without it meaning anything went wrong.
 *
 * ⚠️ BOTH INTENT STAGES ARE HERE BECAUSE WE ASK THEM, THE CREATOR DOES NOT
 * REACH THEM. A question nobody was shown is our omission, not their
 * abandonment — and left required it would absorb the drop and report "dropped
 * at script_intent" for 39 people who were never asked anything, hiding the
 * fact that what they actually did was not open the camera. That is the same
 * mistake `script_edited` made on the first run of this file.
 */
export const OPTIONAL_STAGES: ReadonlySet<FunnelStage> =
  new Set<FunnelStage>(['script_edited', 'script_intent', 'publish_intent'])

/**
 * How long a stage may sit untouched before silence means abandonment.
 *
 * ⚖️ 48 HOURS BECAUSE RECORDING IS A CHORE WITH A MOOD, not a click. Creators
 * generate at night and film at the weekend; an hour-long window would call that
 * a drop. This is a judgement and it is written down as one so it can be argued
 * with, rather than buried as a magic number.
 */
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000

/**
 * WOULD YOU MAKE THIS VIDEO? — asked at the script, before the camera.
 *
 * ⚠️ THIS IS NOT `publish_intent` EARLIER. "Would you post this finished video"
 * and "would you bother filming this script" are different judgements about
 * different artefacts, and publish intent cannot diagnose an upstream script
 * rejection — by the time it is asked, everyone who rejected the script is
 * already gone and uncounted.
 */
export const SCRIPT_INTENTS = ['would_record', 'would_edit_first', 'would_not_record'] as const
export type ScriptIntent = (typeof SCRIPT_INTENTS)[number]

export const SCRIPT_INTENT_LABELS: Record<ScriptIntent, string> = {
  would_record: 'Yes, let’s record',
  would_edit_first: 'Maybe — I want to change something',
  would_not_record: 'No',
}

/**
 * WHY NOT — and the options are the actual competing explanations, not a
 * satisfaction scale.
 *
 * ⚖️ EACH ONE SENDS US SOMEWHERE DIFFERENT. Irrelevant topic is a Gallery
 * problem; generic or off-voice is a writer problem; "I don't have what I need"
 * is a Product Library and premise-compatibility problem; "too hard to record"
 * is a production problem; "not right now" and "just looking" are neither and
 * must be separable, or ordinary browsing gets counted as creative rejection and
 * every quality number is poisoned by it.
 */
export const NO_RECORD_REASONS = [
  'topic_not_relevant',
  'script_generic',
  'not_my_voice',
  'cannot_film_it',
  'recording_too_hard',
  'no_time',
  'just_exploring',
  'other',
] as const
export type NoRecordReason = (typeof NO_RECORD_REASONS)[number]

/** ⚠️ PLAIN ENGLISH. A creator reads these, so nothing here names a subsystem. */
export const NO_RECORD_REASON_LABELS: Record<NoRecordReason, string> = {
  topic_not_relevant: 'This topic isn’t right for me',
  script_generic: 'It feels generic',
  not_my_voice: 'It doesn’t sound like me',
  cannot_film_it: 'I don’t have what I’d need to film it',
  recording_too_hard: 'Recording looks like too much work',
  no_time: 'Not right now',
  just_exploring: 'I’m just looking around',
  other: 'Something else',
}

/**
 * ⚠️ TWO OF THESE ARE NOT REJECTIONS OF THE SCRIPT AND MUST NEVER BE COUNTED AS
 * ONE. Somebody browsing at 2am who says "just looking" is not evidence the
 * writer failed; pooling them is how a quality metric gets quietly dominated by
 * tourist traffic.
 */
export const NOT_A_SCRIPT_REJECTION: ReadonlySet<NoRecordReason> =
  new Set<NoRecordReason>(['no_time', 'just_exploring'])

/** What the creator would actually do with it — the one thing no table knows. */
export const PUBLISH_INTENTS = ['would_post', 'needs_changes', 'would_not_post'] as const
export type PublishIntent = (typeof PUBLISH_INTENTS)[number]

/**
 * ⚠️ PLAIN ENGLISH, BECAUSE A CREATOR READS THIS. No "publish intent", no
 * "conversion", nothing about Twin's insides. A first-time creator with no
 * marketing knowledge should understand every choice in under two seconds.
 */
export const PUBLISH_INTENT_LABELS: Record<PublishIntent, string> = {
  would_post: 'Yes, I’d post this',
  needs_changes: 'Only if I changed some of it',
  would_not_post: 'No',
}

/** The timestamps this reads, all of which some table already holds. */
export interface FunnelInput {
  /** When the reference was picked. Falls back to the generation time. */
  referenceSelectedAt?: string | null
  generatedAt?: string | null
  /** Earliest script edit, whenever it happened. */
  firstEditAt?: string | null
  scriptIntent?: ScriptIntent | null
  scriptIntentAt?: string | null
  recordingStartedAt?: string | null
  editProjectCreatedAt?: string | null
  recordingCompletedAt?: string | null
  exportCompletedAt?: string | null
  publishIntent?: PublishIntent | null
  /** "Now", supplied rather than read, so a funnel is reproducible. */
  asOf: string
}

const ms = (t: string | null | undefined): number | null => {
  if (typeof t !== 'string' || t === '') return null
  const n = Date.parse(t)
  return Number.isNaN(n) ? null : n
}

export interface StageResult {
  stage: FunnelStage
  state: StageState
  at: string | null
}

/**
 * Read one creator's journey.
 *
 * ⚠️ A LATER STAGE PROVES AN EARLIER ONE. If a video exported, it was recorded,
 * whatever the recording table says. Instrumentation misses events — a crash
 * between two writes, a client that closed — and a funnel that reported "exported
 * but never started recording" would be reporting on our logging rather than on
 * the creator. So reaching any stage back-fills every stage before it.
 */
export function readFunnel(input: FunnelInput): StageResult[] {
  const now = ms(input.asOf) ?? 0
  const at: Record<FunnelStage, number | null> = {
    reference_selected: ms(input.referenceSelectedAt) ?? ms(input.generatedAt),
    script_generated: ms(input.generatedAt),
    script_edited: ms(input.firstEditAt),
    script_intent: input.scriptIntent ? (ms(input.scriptIntentAt) ?? ms(input.generatedAt)) : null,
    recording_started: ms(input.recordingStartedAt),
    recording_completed: ms(input.recordingCompletedAt),
    edit_project_created: ms(input.editProjectCreatedAt),
    export_completed: ms(input.exportCompletedAt),
    publish_intent: input.publishIntent ? (ms(input.exportCompletedAt) ?? now) : null,
  }

  // ⚠️ AN EDIT AFTER RECORDING IS NOT AN EDIT BEFORE IT. The stage asks whether
  // they rewrote the script BEFORE committing it to camera; a later edit is a
  // different act and must not fill this slot.
  const started = at.recording_started
  if (at.script_edited !== null && started !== null && at.script_edited > started) {
    at.script_edited = null
  }

  const lastReachedIdx = FUNNEL_STAGES.reduce(
    (acc, s, i) => (at[s] !== null ? i : acc), -1)

  return FUNNEL_STAGES.map((stage, i) => {
    if (at[stage] !== null) {
      return { stage, state: 'reached' as StageState, at: new Date(at[stage]!).toISOString() }
    }
    // Back-fill: something later happened, so this one did too, unrecorded.
    if (i < lastReachedIdx) {
      return {
        stage,
        state: OPTIONAL_STAGES.has(stage) ? 'not_applicable' : 'reached',
        at: null,
      }
    }
    // ⚠️ AN OPTIONAL STAGE IS NEVER WHERE SOMEBODY QUIT. Skipped as unreached it
    // would absorb the drop and mask the real one: a stale generation with no
    // recording reported "dropped at script_edited", which says the creator gave
    // up rather than rewrite — when what actually happened is they never filmed.
    // The drop belongs to the next stage they were REQUIRED to pass.
    if (OPTIONAL_STAGES.has(stage)) {
      return { stage, state: 'not_applicable' as StageState, at: null }
    }
    // Nothing later happened. Is this a drop, or are they still going?
    const prior = lastReachedIdx >= 0 ? at[FUNNEL_STAGES[lastReachedIdx]] : null
    if (prior === null) return { stage, state: 'pending' as StageState, at: null }
    // ⚖️ ONLY THE NEXT REQUIRED STAGE CAN BE DROPPED. If they stopped after
    // recording, "export" is the drop and "would publish" is simply never
    // reached — calling both a drop would count one abandonment twice and make
    // late stages look catastrophically worse than they are.
    const nextRequired = FUNNEL_STAGES.findIndex(
      (st, k) => k > lastReachedIdx && !OPTIONAL_STAGES.has(st) && at[st] === null)
    if (i !== nextRequired) return { stage, state: 'pending' as StageState, at: null }
    const stale = now - prior > STALE_AFTER_MS
    return { stage, state: stale ? 'dropped' : 'pending', at: null }
  })
}

/** Where this creator stopped, or null if they finished. */
export function droppedAt(results: readonly StageResult[]): FunnelStage | null {
  return results.find((r) => r.state === 'dropped')?.stage ?? null
}

export interface FunnelTotals {
  of: number
  reached: Record<FunnelStage, number>
  dropped: Record<FunnelStage, number>
  /** ⚠️ Still in flight, and excluded from any rate. Counting an unfinished
   *  journey as a failure is how a funnel reports recent growth as decline. */
  pending: Record<FunnelStage, number>
}

/**
 * Roll many journeys up.
 *
 * ⚖️ RATES ARE NOT COMPUTED HERE, DELIBERATELY. `reached / of` is the wrong
 * denominator while journeys are in flight, and picking one silently is how a
 * funnel starts lying. The counts are reported; whoever needs a rate states
 * which denominator they mean.
 */
export function totals(all: readonly (readonly StageResult[])[]): FunnelTotals {
  const zero = () => Object.fromEntries(
    FUNNEL_STAGES.map((s) => [s, 0])) as Record<FunnelStage, number>
  const t: FunnelTotals = { of: all.length, reached: zero(), dropped: zero(), pending: zero() }
  for (const journey of all) {
    for (const r of journey) {
      if (r.state === 'reached') t.reached[r.stage]++
      else if (r.state === 'dropped') t.dropped[r.stage]++
      else if (r.state === 'pending') t.pending[r.stage]++
    }
  }
  return t
}
