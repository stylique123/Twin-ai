import type { SupabaseClient } from '@supabase/supabase-js'
import { planFor } from './brand'
import {
  readCapabilityFlags, resolveCapabilities, sanitizeCapabilityFlagsForWrite,
  type CapabilityFlags, type ResolvedCapabilities,
} from './editor/capabilities'
import type { BrandVoice, CreatorDNA, Generation, Platform, Profile, VoiceProfile } from './types'
import { sanitizeBriefForWrite, readStoredBrief, type BriefAnswers } from './preScriptBrief'
import type { HookChoice } from './hookChoice'
import { mapIsUsable, type CommunityMap } from './communityMap'
import { readStoredReferenceProfile, type StoredProfileRow } from './storedReferenceProfile'
import type { ReferenceProfile } from './referenceProfile'
import {
  emptyRestrictions, isEntityRelationship, isEntityType, isPersonalUse, isShowability,
  attestedEntity, isOwned,
  type DraftEntity, type EntityAttestation, type EntityRestrictions,
  type ProductEntityRecord, type Showability,
} from './productEntity'
import {
  EXTRACTED_FIELDS, EXTRACTION_SOURCES, type ExtractedFact,
} from './productExtraction'
import { generationLifecycle, resolveFinishedOutputs, resolveFinishedOutputsResult } from './editor/finishedOutput'
import { refusalText } from './pilot/refusalText'
import { classifyPilotFailure, type PilotFailure } from './pilot/callFailure'

// ---- Client injection ------------------------------------------------------
// The web app is the single client surface. It wires its Supabase client, an
// app origin (for share links), and a file-upload impl into this layer via
// initApi() at startup, keeping browser specifics (window, storage, Blob
// upload) out of the shared code so it stays a pure, testable API surface.

// A recorded take. The web recorder produces a Blob.
export interface TakeFile { contentType: string; blob?: unknown; name?: string }
// onProgress reports upload completion as a 0..1 fraction, or -1 for indeterminate.
// A server-authorized signed-upload target (editor-v2 source flow): the token
// authorizes a PUT of exactly this object — no storage INSERT policy involved.
export interface SignedUploadTarget { bucket: string; path: string; token: string; signedUrl: string; contentType: string }
export type UploadSigned = (target: SignedUploadTarget, file: TakeFile, onProgress?: (fraction: number) => void) => Promise<void>

let _sb: SupabaseClient | undefined
let _appOrigin = ''
let _uploadSigned: UploadSigned | undefined

// `uploadTake` is deliberately absent: the only upload the platform injects now
// is the signed-target one, because that is the only path that carries capture
// provenance. Re-adding a raw bucket uploader here re-opens what 0118 closed.
/** ⚠️ THE UNLOAD BEACON NEEDS A URL AND KEYS THAT ONLY THE APP KNOWS. It cannot
 *  go through `functions.invoke` — that request is cancelled with the page — so
 *  it is a raw `fetch(keepalive: true)` and needs the pieces `invoke` normally
 *  hides. Supplied by the platform at init rather than read from `import.meta`
 *  here, because this package is also imported by non-browser callers.
 *
 *  ⚖️ RETURNS `null` WHEN UNCONFIGURED, and the caller then arms nothing. A
 *  beacon that silently posts to an empty URL would look wired and report
 *  nothing, which is the exact failure `uploadAbandonBeacon`'s header is about. */
let _beacon: (() => { url: string; accessToken: string; apiKey: string } | null) | null = null

export function beaconTarget(): { url: string; accessToken: string; apiKey: string } | null {
  try { return _beacon ? _beacon() : null } catch { return null }
}

export function initApi(opts: {
  client: SupabaseClient
  appOrigin?: string
  uploadSigned?: UploadSigned
  beaconTarget?: () => { url: string; accessToken: string; apiKey: string } | null
}): void {
  _sb = opts.client
  _appOrigin = opts.appOrigin ?? ''
  _beacon = opts.beaconTarget ?? null
  _uploadSigned = opts.uploadSigned
}

function activeClient(): SupabaseClient {
  if (!_sb) throw new Error('TwinAI API not initialized — call initApi({ client }) at app startup.')
  return _sb
}

// The initialized Supabase client, for sibling shared modules (e.g. recordingScriptApi)
// that need direct table access without re-importing the platform wiring.
export function getClient(): SupabaseClient {
  return activeClient()
}

// Upload bytes to a server-signed target (editor/api). Uses the injected
// platform impl (XHR with real progress on web) and falls back to supabase-js
// uploadToSignedUrl. The path/token come from the server intent — this layer
// never invents a path of its own.
export async function uploadToSignedTarget(target: SignedUploadTarget, file: TakeFile, onProgress?: (fraction: number) => void): Promise<void> {
  if (_uploadSigned) { await _uploadSigned(target, file, onProgress); return }
  const { error } = await activeClient().storage
    .from(target.bucket)
    .uploadToSignedUrl(target.path, target.token, file.blob as Blob, { contentType: target.contentType, upsert: true })
  if (error) throw error
  onProgress?.(1)
}

// Proxy so existing `supabase.from(...)` / `.auth` / `.functions` / `.storage`
// call sites work unchanged, forwarding to whichever client initApi() set.
// Methods are bound to the real client so `this` stays correct.
const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    const client = activeClient() as unknown as Record<string | symbol, unknown>
    const value = client[prop]
    return typeof value === 'function' ? value.bind(client) : value
  },
})

// ---- Profile / Creator DNA ----------------------------------------------

// ---- Analytics (data layer) ----------------------------------------------
// Fire-and-forget client event logging for the metrics/data room. NEVER throws —
// analytics must never break a user action. Server events are logged service-side.
export async function logEvent(event: string, props: Record<string, unknown> = {}, timeSavedMinutes = 0): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    await supabase.from('analytics_events').insert({ user_id: auth.user.id, event, props, time_saved_minutes: timeSavedMinutes })
  } catch { /* best-effort */ }
}

export interface Funnel { signup: number; onboarded: number; voice: number; blueprint: number; edit: number; post: number }
export interface RetentionWindow { eligible: number; retained: number }
export interface Retention { d1: RetentionWindow; d7: RetentionWindow; d30: RetentionWindow }
export interface SystemHealth {
  failed_jobs: number; stuck_building: number; ops_24h: number
  recent_ops: { kind: string; severity: string; created_at: string }[]
}
export interface FounderMetrics {
  cohorts: { week: string; size: number; w1: number; w4: number; w8: number }[]
  wow: { week: string; active: number }[]
  second_video: { made_1: number; made_2plus: number }
  cost: { renders: number; avg_render_ms: number }
}
export interface MetricsOverview {
  total_users: number; onboarded_users: number; voices_built: number
  blueprints_generated: number; edits_rendered: number; posts_logged: number
  referrals_redeemed: number; total_hours_saved: number; wau: number; mau: number
  funnel?: Funnel | null; retention?: Retention | null; health?: SystemHealth | null
  founder?: FounderMetrics | null
}
// Admin-only KPI rollup for the live data-room dashboard. Returns null if the
// caller isn't a platform admin (the edge function enforces it).
export async function getMetrics(): Promise<MetricsOverview | null> {
  const { data, error } = await supabase.functions.invoke('admin-metrics', { body: {} })
  if (error) return null
  return data as MetricsOverview
}

export interface CaseStudy {
  name: string | null; email: string; plan: string; joined: string
  blueprints: number; edits: number; posts: number; voices: number; remixes: number
  hours_saved: number; first_seen: string | null; last_seen: string | null; active_days: number
}
// Admin (superadmin): activate a paid plan for a user by email — used to confirm a
// crypto payment and unlock the plan + its credit allowance. Resolves the user via
// the admin `users` search, then calls grant_plan with the plan's full credits.
export async function adminActivatePlan(email: string, plan: string): Promise<{ ok: boolean; error?: string }> {
  const list = await supabase.functions.invoke('admin', { body: { action: 'users', q: email, limit: 1 } })
  if (list.error) return { ok: false, error: 'Lookup failed — admin access required.' }
  const u = ((list.data?.users ?? []) as { id: string; email: string }[])[0]
  if (!u) return { ok: false, error: 'No user with that email.' }
  const credits = planFor(plan).credits
  const g = await supabase.functions.invoke('admin', { body: { action: 'grant_plan', user_id: u.id, plan, credits } })
  if (g.error) return { ok: false, error: 'Activation failed — superadmin required.' }
  return { ok: true }
}

// Admin-only: one creator's case-study rollup, looked up by email.
export async function getCaseStudy(email: string): Promise<CaseStudy | null> {
  const { data, error } = await supabase.functions.invoke('admin-metrics', { body: { email } })
  if (error) return null
  return (data as { case_study?: CaseStudy }).case_study ?? null
}

// Strict profile load for auth/onboarding state machines. The old getProfile()
// collapsed "no session", RLS denial, a missing trigger-created row, and a network
// failure into the same null. That made route guards guess and was the source of
// signup/onboarding loops. Keep the forgiving wrapper for non-critical callers,
// but let critical callers distinguish a real profile from a failed read.
export async function getProfileStrict(): Promise<Profile> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', auth.user.id)
    .single()
  if (error) throw error
  if (!data) throw new Error('Your account profile is not ready yet')
  return data as Profile
}

export async function getProfile(): Promise<Profile | null> {
  try {
    return await getProfileStrict()
  } catch {
    return null
  }
}

// Record that this account has seen the first-run product tour (column-granted
// self-update; best-effort — a failed write just means one more showing later).
export async function markTourSeen(): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return
  await supabase.from('profiles').update({ tour_seen_at: new Date().toISOString() }).eq('id', auth.user.id)
}

export async function saveDNA(dna: CreatorDNA): Promise<Profile> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')
  const { data, error } = await supabase
    .from('profiles')
    .update({ dna, onboarded: true })
    .eq('id', auth.user.id)
    .select('*')
    .single()
  if (error) throw error
  if (!data || data.onboarded !== true) {
    throw new Error('Your Brand DNA was not saved. Please try again.')
  }
  return data as Profile
}

// ---- Platform admin (super-admin / support) -----------------------------

// ---- Blueprint generation (real AI via edge function) -------------------

// ⚠️ THE GOAL ENUM MOVED TO `videoIntent.ts`, AND MOVING IT WAS THE POINT.
// Two lists of the same seven values sat in two files with a comment naming the
// edge function as "the authority" and no test holding them together — which is
// how "Start conversations" and "Get leads" came to share one key that granted
// commercial-CTA intent. One definition, one place, re-exported from the index.
import type { VideoGoal, ContentFocus, ViewerOutcome, ReferenceUse } from './videoIntent'

export interface GenerateInput {
  /** Answers to a prior READINESS_INCOMPLETE refusal, keyed by field. Sending
   *  them retries the same build; the creator-stable ones are persisted so the
   *  question is never asked twice, while goal/angle/cta stay per-video. */
  readiness_answers?: Record<string, string>
  reference_url: string
  reference_note: string
  fidelity: 'close' | 'balanced' | 'loose'
  // How the script should SOUND (delivery energy), independent of fidelity (how
  // close to the reference structure). Optional; defaults to 'balanced' server-side.
  tone?: 'understated' | 'balanced' | 'punchy'
  // What THIS video is for. Per-video rather than per-voice, because one creator
  // makes awareness videos and sell videos from the same voice.
  //
  // ⚠️ The reader for this existed long before any writer did: the edge function
  // read `pre_script_brief.goal`, whose only writer deliberately omits it, so
  // the value was always absent and every script was told "NOT a selling video".
  // Optional here, and absent still means engagement — silence is refusal, and
  // the cost of withholding a pitch is one softer video while the cost of adding
  // one nobody asked for is a creator sounding like an advert to their audience.
  goal?: VideoGoal
  // ⚖️ THE OTHER TWO THIRDS OF THE PER-VIDEO INTENT. Separate fields rather than
  // one object because each has its own reader server-side, and a nested blob
  // would invite a caller to send half of it and a reader to guess the rest.
  focus?: ContentFocus
  outcome?: ViewerOutcome
  // ⚖️ THE FOURTH, AND THE ONLY ONE ABOUT THE REFERENCE RATHER THAN THE CREATOR.
  // Snake-cased to match the wire, like every other field here: the three above
  // are single words, and this is the first that would have to choose.
  reference_use?: ReferenceUse
  // Optional: when the reference was analyzed by the worker (real transcript),
  // pass its transcript_id so the blueprint is built from the actual video.
  transcript_id?: string
  // ONE CLICK-INTENT, ONE REMIX (0119). The building screen runs its build in an
  // effect guarded by a ref, and a ref dies with the component — so navigating
  // away and back, or refreshing, starts a SECOND fully-charged build for the
  // same video. Send the same key for the same intent and the server returns the
  // generation it already made instead of spending again. Mint a NEW key only
  // when the creator deliberately asks for another build.
  idempotency_key?: string
}

// ---- Reference ingestion (worker: transcribe + derive real structure) ----

export interface IngestJob {
  id: string
  status: 'queued' | 'running' | 'done' | 'failed'
  result:
    | {
        transcript_id?: string
        duration_sec?: number
        words?: number
        /** ⚠️ PUBLISHED MID-JOB, BEFORE TRANSCRIPTION. The talking-head check
         *  runs first and writes its three answers here so the screen — which is
         *  polling this row already — can warn in seconds rather than after the
         *  whole analysis. Every field is nullable: null means "we could not
         *  tell", which judgeFit reads as `unsure` and lets straight through. */
        early_look?: {
          someoneTalkingToCamera: boolean | null
          peopleOnCamera: 'none' | 'one' | 'multiple' | null
          looksAnimated: boolean | null
          framesLookedAt: number
          failure: string | null
        }
      }
    | null
  error: string | null
}

// ---- Takes (recording durability) -------------------------------------------

// REMOVED: `uploadTakeToBucket`, the legacy direct-bucket upload.
//
// It PUT bytes straight into `takes/<uid>/…` on the strength of a storage INSERT
// policy, which meant a source asset could exist with no capture intent, no
// finalize record and no etag binding — every guard in 0091 assumes the
// contract path is the only way in, and this was a second way in with none of
// it. 0118 drops the policy; this removes the only code that used it.
//
// Its own comment set the closure condition — zero `legacy_take_upload`
// telemetry. That counter reads zero and proves nothing: it was added
// 2026-07-28, after the last object landed (2026-07-15) and after the callers
// were removed. An instrument installed once the traffic has stopped always
// reads zero. What supports removal is that no caller exists anywhere, and that
// nothing has entered the bucket in the 24 days since the callers went.
//
// Recording is unaffected. New takes go through source-asset → signed upload
// token → finalize → validate_source, which is `uploadToSignedTarget` above.

// Kick off real analysis of a reference URL. Returns the worker job id to watch.
export async function ingestReference(url: string, platform?: string): Promise<{ jobId: string; transcriptId?: string }> {
  const { data, error } = await supabase.functions.invoke('ingest-reference', {
    body: { url, platform },
  })
  if (error) {
    let msg = (error as { message?: string }).message ?? 'Could not start analysis'
    const ctx = (error as { context?: Response }).context
    if (ctx?.json) {
      try {
        const body = await ctx.json()
        if (body?.error) msg = body.error
      } catch {
        /* keep msg */
      }
    }
    throw new Error(msg)
  }
  // On a cache hit the function returns the transcript_id directly — the caller
  // can skip polling entirely (instant instead of a multi-second transcribe wait).
  const d = data as { job_id: string; transcript_id?: string }
  return { jobId: d.job_id, transcriptId: d.transcript_id }
}

// Poll a worker job (RLS lets a user read only their own jobs).
export async function getJob(id: string): Promise<IngestJob | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select('id, status, result, error')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return data as IngestJob
}

/** What the creator did when Twin warned them about a video.
 *
 *  ⚠️ BOTH CHOICES ARE RECORDED, NOT ONLY THE OVERRIDES. A log of overrides
 *  alone has no denominator — "40 people ignored the warning" is unreadable
 *  without knowing whether 45 saw it or 4,500. These rows are the only evidence
 *  that will ever say whether this gate is worth having.
 *
 *  ⚖️ AND IT NEVER FAILS THE BUILD. Losing a record costs us a measurement;
 *  throwing here would cost the creator the video they asked for. The write is
 *  best-effort and the caller does not branch on it.
 *
 *  ⚠️ THE ROW IS WHAT TWIN SAID, NOT WHAT TWIN WOULD SAY TODAY. `reason` is
 *  copied from the warning the creator actually saw, so if the rules change
 *  later these rows still explain the decision they were reacting to. */
export async function recordTalkingHeadChoice(input: {
  jobId: string | null
  reason: 'ANIMATED' | 'NOBODY_ON_CAMERA' | 'NOBODY_TALKING_TO_CAMERA'
  framesLookedAt: number | null
  choice: 'used_anyway' | 'picked_another'
}): Promise<void> {
  try {
    const client = getClient()
    const { data: auth } = await client.auth.getUser()
    const owner = auth?.user?.id
    // ⚠️ NO OWNER, NO ROW. RLS would refuse it anyway; failing quietly here
    // keeps an unauthenticated edge case from surfacing as an error a creator
    // has to read.
    if (!owner) return
    await client.from('talking_head_overrides').insert({
      owner_id: owner,
      job_id: input.jobId,
      reason: input.reason,
      frames_looked_at: input.framesLookedAt,
      choice: input.choice,
    })
  } catch {
    /* a lost measurement must never cost the creator their video */
  }
}

/** A field the planner could not settle, and the question that settles it. */
export interface ReadinessQuestion { field: string; question: string }
/** Nothing was charged; 1-3 answers unblock the build. */
export const READINESS_INCOMPLETE_CODE = 'READINESS_INCOMPLETE'
/** ⚖️ NOTHING WAS CHARGED, AND NO ANSWER UNBLOCKS IT. Unlike readiness, this is
 *  not a missing input — the goal and the library CONTRADICT each other, and the
 *  creator has to change one of them. So it carries remedies rather than
 *  questions: things to go and do, not boxes to fill in here. */
export const SELL_WITHOUT_TARGET_CODE = 'SELL_WITHOUT_COMMERCIAL_TARGET'

export async function generateBlueprint(input: GenerateInput): Promise<Generation> {
  // Calls the Supabase Edge Function `generate-blueprint`, which runs the
  // LLM call server-side (keeps the API key off the client), decrements
  // credits atomically, and persists the generation.
  const { data, error } = await supabase.functions.invoke('generate-blueprint', {
    body: input,
  })
  if (error) {
    // supabase-js puts non-2xx responses in error.context (a Response), not in
    // error.message, read the function's JSON body so the real reason
    // (e.g. "Not enough credits") reaches the UI.
    let msg = (error as { message?: string }).message ?? 'Generation failed'
    let code: string | undefined
    let questions: ReadinessQuestion[] | undefined
    let remedies: string[] | undefined
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.json()
        if (body?.error) msg = body.error
        // The function distinguishes refusals that are not failures — an
        // unreadable reference, an unset brand voice — by `code`. Dropping it
        // forced the UI to regex the sentence to tell "nothing was charged and
        // here is what to do" apart from "we hit a snag", which breaks the
        // moment the copy is reworded.
        if (typeof body?.code === 'string') code = body.code
        // ⚖️ A REFUSAL THAT ASKS FOR SOMETHING MUST CARRY WHAT IT ASKS FOR.
        // READINESS_INCOMPLETE means nothing was charged and 1-3 answers would
        // unblock the build. Dropping `questions` here would leave the UI a
        // code with no way to act on it, which is a dead end wearing a
        // sentence — and this project's standing rule is that a question ships
        // with its reader or it does not ship.
        if (Array.isArray(body?.questions)) questions = body.questions
        // ⚖️ SAME RULE, OTHER SHAPE. A refusal that names three things the
        // creator could do is worth nothing if the client shows only the
        // sentence — the remedies ARE the way out.
        if (Array.isArray(body?.remedies)) remedies = body.remedies.map(String)
      } catch {
        /* fall back to msg */
      }
    }
    const err = new Error(msg) as Error & {
      code?: string; questions?: ReadinessQuestion[]; remedies?: string[]
    }
    if (code) err.code = code
    if (questions) err.questions = questions
    if (remedies) err.remedies = remedies
    throw err
  }
  return data as Generation
}

export async function listGenerations(): Promise<Generation[]> {
  const { data, error } = await supabase
    .from('generations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []) as Generation[]
}

// THE BUILD THAT ALREADY HAPPENED.
//
// 0119 gave every build INTENT a key and made the server converge retries of it
// onto one row. That stopped the double charge, but it left the client replaying
// a build it had already paid for: a remount re-ran the whole sequence — the
// ~72s reference read included — and only discovered at the end that the server
// had been handing back the same generation the entire time.
//
// This is the client-side half of the same contract. Ask first: is there already
// a generation for this key? If so there is nothing to build, only somewhere to
// go. It also delivers the behaviour a creator expects for free — leave while it
// writes, come back, and the finished plan opens itself.
//
// RLS scopes `generations` to the owner, so the key alone is a sufficient
// lookup; a key is only ever meaningful next to the person who minted it.
export async function findGenerationByKey(key: string): Promise<Generation | null> {
  const { data, error } = await supabase
    .from('generations')
    .select('*')
    .eq('idempotency_key', key)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) return null
  return (data?.[0] as Generation | undefined) ?? null
}

export async function getGeneration(id: string): Promise<Generation | null> {
  const { data, error } = await supabase.from('generations').select('*').eq('id', id).single()
  if (error) return null
  return data as Generation
}

// Persist the creator's hook choice on their generation. Column grants restrict
// the update to `selected_hook` (recording), so this is safe from the client.
// `edit_style` (old manual-editor field) is no longer accepted here — its client
// UPDATE grant is revoked in migration 0074. Returns false on failure (caller is
// optimistic).
export async function updateGenerationChoice(
  id: string,
  patch: { selected_hook?: string; hook_choice?: HookChoice },
): Promise<boolean> {
  // `!error` IS NOT SUCCESS. A PostgREST UPDATE that matches no row — because
  // RLS filtered it, or the id is not this user's — returns NO error, so a hook
  // choice the user could not write reported as saved. Requiring the row back
  // is the check. (A missing column GRANT is the other failure mode and DOES
  // error; that one was always caught. This closes the silent one.)
  const { data, error } = await supabase.from('generations').update(patch).eq('id', id).select('id')
  return !error && Array.isArray(data) && data.length > 0
}

/**
 * Agency approval: mark a video client-approved, or take it back to pending.
 *
 * THROUGH `set_generation_approval`, NOT a bare column write, and the difference
 * is two live bugs rather than a preference.
 *
 * This used to be `update({ approved })`. After 0111 that leaves
 * `approved_output_asset_id` NULL, which `approvalState` reads as `unbound` —
 * approved, but we do not know of what. `publishAllowed` deliberately refuses
 * `unbound` at publish time, so on a brand with `needs_approval: true` the
 * owner's own approval produced a video that could never be posted and a
 * "Needs approval" chip that re-approving could never clear.
 *
 * The UNAPPROVE direction was worse: on a row already bound by the review link,
 * setting `approved = false` while the binding columns stayed set violates
 * 0111's `generations_approval_binding_coherent` CHECK, so the write failed and
 * the UI silently reverted the toggle.
 *
 * The RPC writes the flag and the binding in ONE statement — which is why it
 * exists — so neither state is reachable.
 */
export async function setGenerationApproved(id: string, approved: boolean): Promise<boolean> {
  const { error } = await supabase.rpc('set_generation_approval', {
    p_generation: id,
    p_approved: approved,
    // The review_status is the REVIEW's word, not the owner's toggle. Passing
    // null leaves it untouched (the RPC coalesces), so an owner un-approving
    // does not silently overwrite what a client said.
    p_review_status: null,
  })
  return !error
}

export type DeleteGenerationResult =
  | { ok: true; assetsPurged: number; projectsDeleted: number }
  /** The row is not there, or is not yours. The RPC answers identically to both
   *  ON PURPOSE — a distinct "not yours" would let anyone probe which ids
   *  exist — so this cannot separate them either, and does not pretend to. */
  | { ok: false; reason: 'not_found' }
  /** 0114 is not applied here yet. Reported rather than swallowed: a delete
   *  that silently did nothing is the worst possible outcome for this call. */
  | { ok: false; reason: 'unavailable' }
  | { ok: false; reason: 'failed' }

/**
 * Delete a video and everything that only existed because of it.
 *
 * THROUGH THE RPC, not through `.from('generations').delete()`, and the
 * difference is the whole feature. A plain row delete leaves every
 * `media_assets` row behind — `media_assets.generation_id` is ON DELETE SET
 * NULL, verified against the live catalog — so 0099's purge trigger never
 * fires and the raw take, a recording of the creator's face and voice, stays in
 * storage forever. `delete_generation` removes the projects, then the assets,
 * then the row, and it is the asset delete that queues the byte purge.
 *
 * The order is load-bearing and lives in SQL rather than here, because a
 * transaction is the only place it can be guaranteed. Two client statements can
 * be interrupted between them, and the interruption would leave a generation
 * deleted with its footage still stored — the exact state this exists to
 * prevent, reached by the code meant to prevent it.
 *
 * POSTS SURVIVE. A post is a fact about the world: something went out, on a
 * date, to an audience. Deleting our working copy does not unpublish it, and
 * erasing the record would leave a creator unable to answer "did I post that?"
 * about a video still on the platform.
 */
export async function deleteGeneration(id: string): Promise<DeleteGenerationResult> {
  const { data, error } = await supabase.rpc('delete_generation', { p_generation: id })
  if (!error) {
    const row = (Array.isArray(data) ? data[0] : data) as
      { assets_purged?: number; projects_deleted?: number } | null
    return {
      ok: true,
      assetsPurged: Number(row?.assets_purged ?? 0),
      projectsDeleted: Number(row?.projects_deleted ?? 0),
    }
  }
  const code = (error as { code?: string }).code
  // 42883 = undefined_function. The migration has not been applied here.
  if (code === '42883' || code === 'PGRST202') return { ok: false, reason: 'unavailable' }
  // P0002 = no_data_found, which the RPC raises for both "no such row" and
  // "not yours".
  if (code === 'P0002') return { ok: false, reason: 'not_found' }
  return { ok: false, reason: 'failed' }
}

export type BrandTruthResult =
  | { ok: true; id: string; sha256: string; reused: boolean }
  /** The function is not deployed here yet. Reported rather than swallowed:
   *  a caller that treated this as "no snapshot" would go on to build a plan
   *  with no lineage, which is the state C3 exists to end. */
  | { ok: false; reason: 'unavailable' }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'failed' }

/**
 * Issue (or reuse) the brand-truth snapshot a creative-transfer plan pins.
 *
 * C3. `creativeTransferPlan.ts` refuses a plan whose `brandTruthSnapshotId` and
 * `brandTruthSha256` the SERVER did not issue — and until now nothing issued
 * one, so those mismatch checks had never been able to fire and the lineage
 * they enforce was decorative.
 *
 * ── WHY THIS IS A THIN CALL AND NOT A PROJECTION ──────────────────────────
 *
 * It sends a SELECTOR and nothing else. 0095 grants `brand_truth_snapshots` to
 * service_role alone and states the reason: "a client that could insert one
 * could assert its own brand truth, which is authority level 1." A projection
 * computed here and posted would be that insert wearing a hat, so the edge
 * function reads `profiles.dna` and the `brand_voices` row itself and projects
 * from what is actually stored.
 *
 * Calling it twice with an unchanged brand returns the SAME id — 0095's unique
 * index on (owner_id, snapshot_sha256) makes that a property of the data rather
 * than of the caller's discipline.
 */
export async function ensureBrandTruthSnapshot(brandVoiceId?: string): Promise<BrandTruthResult> {
  const { data, error } = await supabase.functions.invoke('brand-truth', {
    body: brandVoiceId ? { brand_voice_id: brandVoiceId } : {},
  })
  if (!error && data && typeof (data as { id?: string }).id === 'string') {
    const d = data as { id: string; sha256: string; reused?: boolean }
    return { ok: true, id: d.id, sha256: d.sha256, reused: d.reused === true }
  }
  const status = (error as { context?: Response } | null)?.context?.status
  // 404 from the function is "no such brand voice", which it answers
  // identically to "not yours" so nobody can probe which ids exist.
  if (status === 404) return { ok: false, reason: 'not_found' }
  // A function that was never deployed answers 404 at the GATEWAY too, which is
  // indistinguishable here — so `not_found` is the honest report for both, and
  // `unavailable` is reserved for the transport failing outright.
  if (error && status === undefined) return { ok: false, reason: 'unavailable' }
  return { ok: false, reason: 'failed' }
}

// ---- Team seats / shared workspace -----------------------------------------
export interface WorkspaceState {
  members: { member_id: string; created_at: string }[] // teammates I host
  memberOf: string | null // the owner_id whose workspace I'm a teammate in
}
export async function getWorkspace(): Promise<WorkspaceState> {
  const { data: auth } = await supabase.auth.getUser()
  const me = auth.user?.id
  const { data } = await supabase.from('workspace_members').select('owner_id, member_id, created_at')
  const rows = (data ?? []) as { owner_id: string; member_id: string; created_at: string }[]
  return {
    members: rows.filter((r) => r.owner_id === me).map((r) => ({ member_id: r.member_id, created_at: r.created_at })),
    memberOf: rows.find((r) => r.member_id === me)?.owner_id ?? null,
  }
}
export async function createWorkspaceInvite(): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_workspace_invite')
  if (error || !data) return null
  return `${_appOrigin}/join/${data}`
}
export async function removeWorkspaceMember(memberId: string): Promise<void> {
  await supabase.from('workspace_members').delete().eq('member_id', memberId)
}
export async function acceptWorkspaceInvite(token: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('accept_workspace_invite', { p_token: token })
  if (error) return { ok: false, error: error.message }
  return (data ?? { ok: false }) as { ok: boolean; error?: string }
}

// ---- In-app notifications (video ready, client approval decisions) ---------
export interface AppNotification {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  created_at: string
}
export async function listNotifications(limit = 20): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error || !data) return []
  return data as AppNotification[]
}
export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (!ids.length) return
  await supabase.from('notifications').update({ read: true }).in('id', ids)
}

// ---- Client approval: agency shares /review/:token with a client -----------
// The client watches the rendered reel + reads the script and approves or
// requests changes, no account. Minting the token is owner-gated (RPC); the
// public read/submit go through the `review` edge fn (service role signs media).
export async function createReviewLink(generationId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('ensure_review_token', { p_gen: generationId })
  if (error || !data) return null
  return `${_appOrigin}/review/${data}`
}

export interface ReviewPayload {
  brand: string
  brand_logo: string | null
  hook: string
  script: string[]
  reference_url: string | null
  video_url: string | null
  thumb_url: string | null
  // 'none' = the generation was never shared (DB default, migration 0046) — widen
  // the union so callers reading an unshared generation handle it.
  status: 'none' | 'pending' | 'approved' | 'changes'
  note: string | null
  created_at: string
}

export async function getReview(token: string): Promise<ReviewPayload | null> {
  const { data, error } = await supabase.functions.invoke('review', { body: { action: 'get', token } })
  if (error || !data || (data as { error?: string }).error) return null
  return data as ReviewPayload
}

export async function submitReview(
  token: string,
  decision: 'approved' | 'changes',
  note: string,
): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('review', {
    body: { action: 'submit', token, decision, note },
  })
  return !error && !!(data as { ok?: boolean })?.ok
}

// Sign storage paths in the private `edits` bucket (rendered MP4s + cover JPEGs)
// so the Library can show finished work. Returns a path->signedUrl map; any path
// that fails to sign is simply omitted (caller falls back to a placeholder).
export async function signEditUrls(paths: string[]): Promise<Record<string, string>> {
  const clean = [...new Set(paths.filter(Boolean))]
  if (!clean.length) return {}
  const { data, error } = await supabase.storage.from('edits').createSignedUrls(clean, 60 * 60 * 24)
  if (error || !data) return {}
  const out: Record<string, string> = {}
  for (const row of data) {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl
  }
  return out
}

// Sign a raw take in the private 'takes' bucket (mirrors signEditUrls for 'edits')
// so the review screen can always offer the original footage for download — even
// while the edit is still rendering or if it failed, so a take is never stranded.
export async function signTakeUrl(path: string): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage.from('takes').createSignedUrl(path, 60 * 60 * 24)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

// On-demand: render an AI cover image from this generation's packaging brief.
// Server-side (paid image model), rate-limited, and only ever called on a tap —
// so it costs nothing unless the creator asks. Returns a signed URL to display
// plus the stored path (persisted on the generation so it re-shows for free).
// GENERATE ONCE, then re-sign. The edge function short-circuits when
// `ai_thumb_path` is already set: it re-signs the stored object, does not call
// the paid image model, and does not write a new one — so calling this twice is
// safe and returns the SAME cover. `reused` says which happened, which is the
// difference between "we made you a cover" and "here is your cover".
//
// That guarantee used to live only in a client-side conditional deciding
// whether to render the button, which a second tab or a stale cache defeated.
export async function generateThumbnail(
  generationId: string,
): Promise<{ url: string; path: string; reused?: boolean }> {
  const { data, error } = await supabase.functions.invoke('generate-thumbnail', { body: { generation_id: generationId } })
  if (error) throw new Error(await readInvokeError(error))
  return data as { url: string; path: string; reused?: boolean }
}

// ---- Dashboard (Phase 7: real stats from data we already own) ------------

// ONE lifecycle, derived from the generation (the "remix") — never from the jobs
// table (which outlives its generation and drifts). Stages are mutually exclusive
// so drafts + ready + published = your total remixes, and every screen (Dashboard
// tiles + Library filter chips) reads them identically:
//   draft     = a script with no finished video yet ("left in the middle")
//   ready     = a finished video, not posted yet ("full loop done")
//   published = a finished video that's been posted
export interface DashboardStats {
  drafts: number
  ready: number
  published: number
  recreationsLeft: number
  /**
   * Whether the readiness lookup behind `drafts`/`ready` actually ran.
   *
   * False means those two numbers are NOT WRONG SO MUCH AS UNKNOWN: a failed
   * resolve leaves every generation looking unfinished, so `drafts` silently
   * absorbs the whole library and the dashboard tells a creator none of their
   * videos are done. `published` is unaffected — it comes from `posts`, which
   * is a separate query, and a video that went out is finished regardless.
   *
   * The caller's job is to render the difference. A number that might be a
   * fabrication is worse than no number, because nothing on the screen marks it
   * as one.
   */
  outputsComplete: boolean
}

export async function getDashboardStats(creditsLeft: number): Promise<DashboardStats> {
  const [{ data: gens }, { data: posts }] = await Promise.all([
    supabase.from('generations').select('id, edit_path'),
    supabase.from('posts').select('generation_id').eq('status', 'posted'),
  ])
  const publishedIds = new Set(((posts ?? []) as { generation_id: string | null }[]).map((p) => p.generation_id).filter(Boolean))
  const rows = (gens ?? []) as { id: string; edit_path: string | null }[]
  // OUTPUT-1. This counted `edit_path` alone, so an editor-v2 render that
  // succeeded — bytes in storage, validated, reviewed — was counted as a DRAFT.
  // The creator's dashboard told them the video they had just watched was not
  // finished.
  const finished = await resolveFinishedOutputsResult(rows)
  let drafts = 0, ready = 0, published = 0
  for (const g of rows) {
    switch (generationLifecycle(g.id, finished.outputs, publishedIds, finished.complete)) {
      case 'published': published++; break
      case 'ready': ready++; break
      // `unknown` is counted as neither. It used to reach `default` and be
      // counted as a draft, which is exactly how a lookup failure became the
      // sentence "you have 14 drafts" on someone's home screen.
      case 'unknown': break
      default: drafts++
    }
  }
  return {
    drafts, ready, published,
    recreationsLeft: Math.floor(creditsLeft / 10),
    outputsComplete: finished.complete,
  }
}

// ---- Posts (Phase 7: publish tracking) -----------------------------------

export interface Post {
  id: string
  generation_id: string | null
  platform: string
  caption: string | null
  // 'posting' is a transient claim state (during publish); 'failed' carries `error`.
  status: 'scheduled' | 'posted' | 'failed' | 'posting'
  scheduled_for: string | null
  posted_at: string | null
  external_url: string | null
  error: string | null
  views: number | null
  likes: number | null
  created_at: string
}

export async function listPosts(): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select('id, generation_id, platform, caption, status, scheduled_for, posted_at, external_url, error, views, likes, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return [] // table may not be migrated yet, fail soft
  return (data ?? []) as Post[]
}

// Self-reported performance now lives in `outcomeLog.ts` as `recordPostStats`,
// which writes these columns AND appends the reading to §7b's log.
//
// The cache-only writer that used to sit here is deliberately gone rather than
// deprecated. It overwrote `posts.views` with no trace of the previous number,
// so every call destroyed history that cannot be reconstructed — and a function
// that does that, left in reach with a reasonable name, gets called again.

/**
 * The video a post is ABOUT, recorded when the post is created rather than when
 * it goes out.
 *
 * PUBLISH-1's second half. 0098 added `posts.edit_project_id` and
 * `posts.output_asset_id`, and `social/index.ts` now writes them at the moment a
 * publish SUCCEEDS. That is enough to answer "what did we post" afterwards and
 * not enough to answer the question a creator actually has, which is asked
 * BEFORE the fact:
 *
 *   A creator schedules Tuesday's video on Sunday. On Monday they re-edit it —
 *   a different hook, a caption fix, a take swapped out. On Tuesday the cron
 *   publishes whatever `currentOutput` resolves to, which is now the Monday
 *   render. Nothing lied and nothing failed; the post simply became about a
 *   different video than the one that was scheduled, with no moment at which
 *   anyone decided that.
 *
 * This is the same defect 0111 closes for approvals, one surface along:
 * scheduling, like approving, is a judgement about a SPECIFIC render, and a
 * judgement that does not name its subject cannot be superseded — it can only
 * be silently reassigned.
 *
 * ── NULL IS "SCHEDULED BEFORE WE RECORDED WHICH", NOT "NO VIDEO" ──────────
 *
 * Returns an EMPTY OBJECT, not explicit nulls, so an insert that spreads it is
 * indistinguishable from the pre-binding one. Every scheduled post that already
 * exists carries NULL here, and the publish path must keep treating that as
 * "resolve it at publish time" — the three-state rule, at the place where
 * collapsing it would refuse to publish a real creator's real scheduled post.
 *
 * ── A LEGACY GENERATION BINDS TO NOTHING, HONESTLY ────────────────────────
 *
 * Both columns are v2 identities. A legacy `edit_path` has no project and no
 * asset to name, so there is nothing to record and this returns empty — the
 * publish path falls through to `edit_path` exactly as before. Inventing an id
 * to make the row look complete would be worse than the gap.
 *
 * ── AND IT NEVER BLOCKS THE SCHEDULE ──────────────────────────────────────
 *
 * A failed resolve degrades to "unbound". Refusing to schedule a post because
 * we could not work out which render it was for would trade a lineage gap for a
 * creator who cannot use their calendar.
 */
async function bindCurrentOutput(
  generationId: string,
): Promise<{ edit_project_id?: string; output_asset_id?: string }> {
  try {
    const resolved = await resolveFinishedOutputs([{ id: generationId }])
    const out = resolved.get(generationId)
    if (!out || out.authority !== 'editor_v2' || !out.editProjectId || !out.outputAssetId) return {}
    return { edit_project_id: out.editProjectId, output_asset_id: out.outputAssetId }
  } catch {
    return {}
  }
}

export async function markPosted(input: {
  generationId: string
  platform: string
  caption?: string
  externalUrl?: string
}): Promise<Post> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')
  const { data, error } = await supabase
    .from('posts')
    .insert({
      owner_id: auth.user.id,
      generation_id: input.generationId,
      platform: input.platform,
      caption: input.caption ?? null,
      status: 'posted',
      posted_at: new Date().toISOString(),
      external_url: input.externalUrl ?? null,
      // The creator posted this themselves, somewhere we do not publish to. The
      // render is still the thing the outcome will be attributed to, so it is
      // recorded here for the same reason the publish path records it.
      ...(await bindCurrentOutput(input.generationId)),
    })
    .select('id, generation_id, platform, caption, status, scheduled_for, posted_at, external_url, created_at')
    .single()
  if (error) throw error
  return data as Post
}

// Schedule a post for a future date on a chosen platform, from a library item.
// status='scheduled'; the calendar shows it on `scheduled_for`. Real auto-posting
// IS live for connected accounts (platform OAuth adapters + the publish_due cron);
// for anything not connected this remains a calendar + caption holder so the
// creator posts on time with everything ready.
export async function schedulePost(input: {
  generationId: string
  platform: string
  scheduledFor: string // ISO timestamp
  caption?: string
}): Promise<Post> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')
  const bound = await bindCurrentOutput(input.generationId)
  const { data, error } = await supabase
    .from('posts')
    .insert({
      owner_id: auth.user.id,
      generation_id: input.generationId,
      platform: input.platform,
      caption: input.caption ?? null,
      status: 'scheduled',
      scheduled_for: input.scheduledFor,
      ...bound,
    })
    .select('id, generation_id, platform, caption, status, scheduled_for, posted_at, external_url, created_at')
    .single()
  if (error) throw error
  return data as Post
}

// Flip a scheduled post to posted (the creator confirms they published it).
export async function markScheduledPosted(postId: string, externalUrl?: string): Promise<void> {
  const { error } = await supabase
    .from('posts')
    .update({ status: 'posted', posted_at: new Date().toISOString(), external_url: externalUrl ?? null })
    .eq('id', postId)
  if (error) throw error
}

// Remove a scheduled (or posted) entry from the calendar.
export async function deletePost(postId: string): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', postId)
  if (error) throw error
}

// ---- Social connections (one-click posting) ----------------------------
// The token columns are locked down server-side; we only ever read the descriptor.
export interface PlatformConnection {
  id: string
  platform: string
  account_label: string | null
  status: string
  created_at: string
}

export async function listConnections(): Promise<PlatformConnection[]> {
  const { data, error } = await supabase
    .from('platform_connections')
    .select('id, platform, account_label, status, created_at')
  if (error) return [] // table may not be migrated everywhere; fail soft
  return (data ?? []) as PlatformConnection[]
}

export interface ConnectResult { url?: string; unconfigured?: boolean; platform?: string; needs?: string[] }
export async function startConnect(platform: string): Promise<ConnectResult> {
  const { data, error } = await supabase.functions.invoke('social', { body: { action: 'start', platform } })
  if (error) throw new Error(await readInvokeError(error))
  return data as ConnectResult
}

export async function disconnectPlatform(platform: string): Promise<void> {
  const { error } = await supabase.functions.invoke('social', { body: { action: 'disconnect', platform } })
  if (error) throw new Error(await readInvokeError(error))
}

export async function publishPost(postId: string): Promise<{ ok?: boolean; external_url?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('social', { body: { action: 'publish', post_id: postId } })
  if (error) throw new Error(await readInvokeError(error))
  return data as { ok?: boolean; external_url?: string; error?: string }
}

// ---- Brand voices (Phase 2, DNA from handle) ---------------------------

// supabase-js puts non-2xx function responses in error.context (a Response),
// not error.message. Read the function's JSON body so the real reason reaches
// the UI (shared by every edge-function call below).
async function readInvokeError(error: unknown): Promise<string> {
  let msg = (error as { message?: string }).message ?? 'Request failed'
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json()
      if (body?.error) msg = body.error
    } catch {
      /* keep msg */
    }
  }
  return msg
}

export interface StartDnaResult {
  brand_voice_id: string
  job_id: string | null
  // 'ready' is returned on a DNA cache hit (start-dna returns it directly);
  // 'manual' when the creator opted to describe their voice by hand (no scan);
  // 'building' otherwise.
  status: 'building' | 'ready' | 'manual'
}

// ---- Referrals -----------------------------------------------------------
// Where we stash a referral code from a ?ref= link until the new user has a
// session to redeem it against (survives signup + email confirmation).
export const REFERRAL_CODE_KEY = 'twinai_ref_code'

// The caller's own shareable code (lazily allocated server-side).
export async function getReferralCode(): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('referral', { body: { action: 'code' } })
  if (error) return null
  return (data as { code?: string })?.code ?? null
}

// Redeem a code the user arrived with. Returns the outcome so the caller can
// decide whether to celebrate, ignore, or clear the stored code.
export async function redeemReferral(code: string): Promise<{ ok: boolean; reason?: string; reward?: number }> {
  const { data, error } = await supabase.functions.invoke('referral', { body: { action: 'redeem', code } })
  if (error) return { ok: false, reason: 'error' }
  return data as { ok: boolean; reason?: string; reward?: number }
}

// ---- Billing / checkout --------------------------------------------------
export interface CheckoutResult {
  kind?: 'redirect' | 'crypto' | 'manual' | 'unconfigured'
  url?: string
  asset?: string
  address?: string
  amount_usd?: number
  message?: string
  provider?: string
  error?: string
}

// Start a real checkout for a paid plan. Returns a redirect URL (card), crypto
// details, or a manual/unconfigured message — the caller routes the user.
export async function startCheckout(plan: string): Promise<CheckoutResult> {
  const { data, error } = await supabase.functions.invoke('billing', { body: { action: 'checkout', plan } })
  if (error) throw new Error(await readInvokeError(error))
  return data as CheckoutResult
}

export interface BrandStats { drafts: number; ready: number; published: number }
// Per-client stats scoped to one brand voice (agency view). Owner-checked server-side.
export async function getBrandStats(brandVoiceId: string): Promise<BrandStats | null> {
  const { data, error } = await supabase.rpc('brand_stats', { p_brand: brandVoiceId })
  if (error) return null
  return data as BrandStats | null
}

// `refresh` re-scans the caller's OWN existing voice (fresh stats + sharper
// profile) without hitting the "you already have a voice" wall or the cache.
// `replace` (onboarding only) repoints the user's single voice slot to a NEW
// handle/platform — so backing out of a scan and retrying never traps them on
// the one-voice limit or the "you already have a voice" wall.
export async function startDna(handle: string, platform: Platform, refresh = false, replace = false): Promise<StartDnaResult> {
  const { data, error } = await supabase.functions.invoke('start-dna', {
    body: { handle, platform, make_default: true, refresh, replace },
  })
  if (error) throw new Error(await readInvokeError(error))
  return data as StartDnaResult
}

// Create an empty voice slot the creator fills in by hand (the "describe your
// voice" path) — no scan, no worker, no Apify. Used so a creator with no big
// social account (or when the scan is down) can still get a real, editable voice
// and enter the studio. The confirm form then saves the profile + marks it ready.
export async function startManualVoice(platform: Platform, handle = ''): Promise<StartDnaResult> {
  const { data, error } = await supabase.functions.invoke('start-dna', {
    body: { handle, platform, make_default: true, manual: true },
  })
  if (error) throw new Error(await readInvokeError(error))
  return data as StartDnaResult
}

export interface DnaPollResult {
  status: 'building' | 'ready' | 'failed'
  profile?: VoiceProfile
  error?: string
}

export async function pollDna(brandVoiceId: string): Promise<DnaPollResult> {
  const { data, error } = await supabase.functions.invoke('dna-poll', {
    body: { brand_voice_id: brandVoiceId },
  })
  if (error) throw new Error(await readInvokeError(error))
  return data as DnaPollResult
}

export async function listBrandVoices(): Promise<BrandVoice[]> {
  const { data, error } = await supabase
    .from('brand_voices')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as BrandVoice[]
}

// Persist user edits from the confirm card (the editable chips). Confirming a
// profile also marks the voice READY: a voice the creator has reviewed and saved
// is usable by definition, so it must never be left in a 'building'/'failed' scan
// state that would later block remixing (the "import your brand DNA" snag).
export async function saveVoiceProfile(id: string, profile: VoiceProfile): Promise<void> {
  const { data, error } = await supabase
    .from('brand_voices')
    .update({ profile, status: 'ready', error: null })
    .eq('id', id)
    .select('id')
    .single()
  if (error) throw error
  if (!data) throw new Error('Your brand voice was not saved. Please try again.')
}

/**
 * Record capability answers as this brand's DEFAULTS (0103's
 * `brand_voices.default_capability_flags`).
 *
 * MERGED, NEVER REPLACED. The three flags are asked in different places at
 * different times — onboarding asks about the screen, a per-video surface may
 * later ask about objects — and a whole-column write would silently unset every
 * answer the current caller did not happen to hold. That is the same
 * missing-value-read-as-real defect the column's own migration was written
 * against, arriving through the writer instead of the reader.
 *
 * `sanitizeCapabilityFlagsForWrite` is what decides what may be stored: only the
 * three known names, only real booleans, with `null` preserved as a deliberate
 * "withdraw this answer" and an omitted key left exactly as it was. An
 * ANSWERLESS call writes nothing at all rather than writing `{}` — a creator who
 * skipped the question must stay unanswered, not acquire an empty answer.
 */
/**
 * Record the pre-script brief as this brand's answers (0109's
 * `brand_voices.pre_script_brief`).
 *
 * THE ANSWER THAT WAS BEING THROWN AWAY. Before this, `workKind` and
 * `forbiddenClaims` were collected by the onboarding scan, written into a
 * `localStorage` draft, and never persisted anywhere else — a doctor telling us
 * what they may never claim, kept in one browser until it was cleared.
 *
 * MERGED, NEVER REPLACED, for the reason `saveCapabilityDefaults` is: the brief
 * is filled in across two screens, so a whole-object write from the first would
 * erase the second's answers. And an ANSWERLESS call writes nothing rather than
 * writing `{}` — a creator who skipped every question must stay unanswered.
 *
 * A FAILED WRITE THROWS. `saveRecordingScript` deliberately swallows its error
 * because the script survives in memory and the screen still works; nothing here
 * survives, and a compliance answer that silently failed to save is exactly the
 * state this function exists to end.
 */
export async function savePreScriptBrief(
  brandVoiceId: string,
  answers: BriefAnswers,
): Promise<void> {
  const incoming = sanitizeBriefForWrite(answers)
  if (Object.keys(incoming).length === 0) return
  const { data, error } = await supabase
    .from('brand_voices')
    .select('pre_script_brief')
    .eq('id', brandVoiceId)
    .single()
  if (error) throw error
  const merged = { ...sanitizeBriefForWrite(readStoredBrief(data?.pre_script_brief)), ...incoming }
  const { error: writeError } = await supabase
    .from('brand_voices')
    .update({ pre_script_brief: merged })
    .eq('id', brandVoiceId)
  if (writeError) throw writeError
}

/** This brand's stored brief, or an empty one. Unknown and malformed values are
 *  dropped by `readStoredBrief` rather than surfaced — a stored `goal` outside
 *  the enum would otherwise reach a prompt as if the creator had chosen it. */
export async function loadPreScriptBrief(brandVoiceId: string): Promise<BriefAnswers> {
  const { data, error } = await supabase
    .from('brand_voices')
    .select('pre_script_brief')
    .eq('id', brandVoiceId)
    .maybeSingle()
  if (error) throw error
  return readStoredBrief(data?.pre_script_brief)
}

export async function saveCapabilityDefaults(
  brandVoiceId: string,
  flags: CapabilityFlags,
): Promise<void> {
  const incoming = sanitizeCapabilityFlagsForWrite(flags)
  if (Object.keys(incoming).length === 0) return
  const { data, error } = await supabase
    .from('brand_voices')
    .select('default_capability_flags')
    .eq('id', brandVoiceId)
    .single()
  if (error) throw error
  const merged = { ...readCapabilityFlags(data?.default_capability_flags), ...incoming }
  const { error: writeError } = await supabase
    .from('brand_voices')
    .update({ default_capability_flags: merged })
    .eq('id', brandVoiceId)
  if (writeError) throw writeError
}

/**
 * The creator's answer for THIS video, which the resolver already prefers.
 *
 * ⚠️ THE PRECEDENCE RULE HAS NEVER BEEN ABLE TO FIRE. `resolveCapabilities`
 * documents `generations.capability_flags` as winning "whenever it is present,
 * including when it says false", 0103 declares it the half that stops a setting
 * from sorting the person, and `loadCapabilities` reads it on every Result and
 * DeclaredClips mount — and until now NOTHING WROTE IT. The only writer in the
 * product was `saveCapabilityDefaults`, which writes the ACCOUNT default. So a
 * creator who could not record their screen today had two options: leave the
 * slot they cannot film, or change what is true of them permanently.
 *
 * ⚖️ AND THAT IS THE TRAP 0103 NAMES BY NAME — "a setting that sorts the person
 * and cannot be escaped for one video". The account default was acting as the
 * only answer, which makes the per-video answer advisory in exactly the way the
 * migration set out to prevent.
 *
 * ⚠️ IT DOES NOT MERGE WITH THE ACCOUNT DEFAULT, UNLIKE `saveCapabilityDefaults`.
 * It merges with the video's OWN previous answer, because the two scopes are
 * deliberately not derived from each other: folding the default in here would
 * make an unanswered flag look like a per-video decision, and the resolver could
 * no longer say which scope answered.
 */
export async function saveVideoCapabilities(
  generationId: string,
  flags: CapabilityFlags,
): Promise<void> {
  const incoming = sanitizeCapabilityFlagsForWrite(flags)
  // ⚖️ NOTHING TO SAY IS NOT AN ANSWER. An empty write would replace a real
  // per-video decision with silence, and silence resolves to the account.
  if (Object.keys(incoming).length === 0) return
  const { data, error } = await supabase
    .from('generations')
    .select('capability_flags')
    .eq('id', generationId)
    .single()
  if (error) throw error
  const merged = { ...readCapabilityFlags(data?.capability_flags), ...incoming }
  const { error: writeError } = await supabase
    .from('generations')
    .update({ capability_flags: merged })
    .eq('id', generationId)
  if (writeError) throw writeError
}

/**
 * The capability answers in force for one video, and WHO answered each.
 *
 * Both halves are read because both exist and neither is derived from the
 * other: `generations.capability_flags` is what is true of THIS video and wins
 * whenever it is present, including when it says false, and
 * `brand_voices.default_capability_flags` is what is usually true of the setup.
 * `resolveCapabilities` records which one answered, so a surface that did not
 * appear can be traced to the video or the brand rather than to a rule nobody
 * can see.
 *
 * A read failure resolves to UNSET rather than to false. Silence from the
 * database is not a creator saying no, and treating it as one would hide a
 * surface on a transient error with nothing anywhere reporting it.
 */
export async function loadCapabilities(generationId: string): Promise<ResolvedCapabilities> {
  const [gen, voices] = await Promise.all([
    supabase.from('generations').select('capability_flags').eq('id', generationId).maybeSingle(),
    supabase.from('brand_voices').select('default_capability_flags, is_default')
      .order('is_default', { ascending: false }).limit(1),
  ])
  const account = (voices.data ?? [])[0] as { default_capability_flags?: unknown } | undefined
  return resolveCapabilities(
    (gen.data as { capability_flags?: unknown } | null)?.capability_flags,
    account?.default_capability_flags,
  )
}

// Upload a brand-kit logo (data URL) via the service-role edge fn; returns the
// storage path to save into the brand kit.
export async function uploadBrandLogo(dataUrl: string): Promise<string> {
  const content_type = dataUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png'
  const { data, error } = await supabase.functions.invoke('brand-logo', { body: { image_base64: dataUrl, content_type } })
  if (error) throw new Error(await readInvokeError(error))
  return (data as { path: string }).path
}

/** Upload one photo of a product and get back its storage path.
 *
 *  ⚖️ THE PATH IS NOT EVIDENCE UNTIL SOMETHING READS IT. Storing an image grants
 *  nothing on its own — `extract_product` reads the paths and `imageFactAllowed`
 *  decides what the result may establish. A caller that uploads and never queues
 *  the extraction has produced a file, not a fact.
 */
export async function uploadProductImage(dataUrl: string): Promise<string> {
  const content_type = dataUrl.startsWith('data:image/jpeg') ? 'image/jpeg'
    : dataUrl.startsWith('data:image/webp') ? 'image/webp'
      : 'image/png'
  const { data, error } = await supabase.functions.invoke('product-image', {
    body: { image_base64: dataUrl, content_type },
  })
  if (error) throw new Error(await readInvokeError(error))
  return (data as { path: string }).path
}

// Brand kit: caption-style + highlight-color defaults for a workspace's renders.
export async function saveBrandKit(brandId: string, kit: import('./types').BrandKit): Promise<void> {
  const { error } = await supabase.from('brand_voices').update({ brand_kit: kit }).eq('id', brandId)
  if (error) throw error
}

export async function setDefaultBrandVoice(id: string): Promise<void> {
  const { error } = await supabase.from('brand_voices').update({ is_default: true }).eq('id', id)
  if (error) throw error
}

// Agency white-label: a login-free CLIENT REPORT link per brand.
export interface BrandReport { label: string; handle: string; blueprints: number; edits: number; posts: number; views: number; hours_saved: number }
// Generate (lazily) + return the shareable token for a brand the caller owns.
export async function ensureBrandShareToken(brandId: string): Promise<string> {
  const { data, error } = await supabase.rpc('ensure_brand_share_token', { p_brand: brandId })
  if (error) throw error
  return data as string
}
// Public (no login): a token → that brand's aggregate results, for the client page.
export async function getBrandReport(token: string): Promise<BrandReport | null> {
  const { data, error } = await supabase.rpc('brand_report', { p_token: token })
  if (error || !data) return null
  return data as BrandReport
}

// Rename a brand's friendly label (the per-client name agencies set).
export async function renameBrandVoice(id: string, label: string): Promise<void> {
  const { error } = await supabase.from('brand_voices').update({ label }).eq('id', id)
  if (error) throw error
}

// Mark onboarding complete (used by the handle path, which has no quiz DNA).
export async function markOnboarded(): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')
  const { data, error } = await supabase
    .from('profiles')
    .update({ onboarded: true })
    .eq('id', auth.user.id)
    .select('id, onboarded')
    .single()
  if (error) throw error
  if (!data || data.onboarded !== true) {
    throw new Error('Your account setup was not completed. Please try again.')
  }
}

// ---- Gallery v2 (contributed feed: public/private submissions) ----------

export interface GalleryItem {
  id: string
  owner_id: string | null
  platform: string
  url: string
  niche: string
  creator: string | null
  title: string | null
  why: string | null
  reach: string | null
  likes: string | null
  // ⚠️ `hidden` IS A THIRD STATE AND NOT A SYNONYM FOR `private`. Private means
  // A CREATOR'S OWN ITEM, visible to them; hidden means WITHDRAWN FROM THE FEED
  // by an operator — 689 scraped `/explore/tags/` rows that are hashtag pages
  // rather than videos. Collapsing them into `private` would lose that
  // distinction the first time anyone queried the table. No client sees one:
  // the RLS read policy admits `visibility = 'public' or owner_id = auth.uid()`,
  // and these have no owner.
  visibility: 'public' | 'private' | 'hidden'
  created_at: string
  // 0106. Three-state, ALWAYS: true, false, and nobody-has-assessed-this-card.
  // Every scraped row is null until something looks, and null read as false
  // would tell a creator who cannot film objects that the whole gallery suits
  // them — which is §7a's most expensive mistake.
  requires_filming_objects?: boolean | null
  requires_screen_recording?: boolean | null
  requirements_source?: 'human' | 'model' | null
}

// RLS returns public items + the caller's own (incl. their private ones).
export async function listGalleryItems(): Promise<GalleryItem[]> {
  const { data, error } = await supabase
    .from('gallery_items')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return []
  return (data ?? []) as GalleryItem[]
}

/**
 * What the transcript batch learned about these videos.
 *
 * ⚠️ ONE QUERY PER PAGE OF CARDS, NOT ONE PER CARD. The gallery renders up to
 * 200 references; a per-card read would be 200 round trips to colour in a list
 * that has already rendered, and the ranking cannot run until they all land.
 *
 * ⚖️ A MISSING ROW IS THE NORMAL CASE AND NOT AN ERROR. Thirty-five videos of
 * 9,504 have been assessed, so almost every card comes back absent — the map
 * simply has no entry, and `readStoredReferenceProfile` turns that into an
 * unassessed profile which decides nothing.
 */
export async function loadReferenceProfiles(
  urls: readonly string[],
): Promise<Map<string, ReferenceProfile>> {
  const out = new Map<string, ReferenceProfile>()
  const unique = [...new Set(urls.filter((u) => typeof u === 'string' && u.length > 0))]
  // Chunked because a URL list goes into the query string, and one oversized
  // request would fail the whole page rather than one slice of it.
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100)
    const { data, error } = await supabase
      .from('reference_content_profiles')
      .select('url, schema_version, profile, error')
      .in('url', chunk)
    // ⚠️ A FAILED READ LEAVES THE GALLERY EXACTLY AS IT IS TODAY. The assessment
    // is an enrichment; losing it must never cost a creator the feed itself.
    if (error) continue
    for (const row of (data ?? []) as StoredProfileRow[]) {
      const url = typeof row.url === 'string' ? row.url : null
      if (url === null) continue
      out.set(url, readStoredReferenceProfile(row, url))
    }
  }
  return out
}

// NOTE: user-contributed gallery items (submit/delete) are intentionally not
// exposed from the client yet — the public feed is curated by the discovery
// scraper (service role), and migration 0032 locks authenticated inserts to
// private-only until there's a moderation flow. Re-add a submit helper alongside
// that flow when public contributions ship.

// ---------------------------------------------------------------------------
// THE PRODUCT LIBRARY — entities, not one global subtype
// ---------------------------------------------------------------------------

/** The row shape, mapped to the contract's camelCase. Kept private: every
 *  caller outside this file works in `ProductEntityRecord`, so a column rename
 *  is one edit here rather than a search across the app. */
interface ProductEntityRow {
  id: string
  name: string | null
  type: string
  relationship: string
  personal_use: string
  showability: string
  product_url: string | null
  affiliate_url: string | null
  evidence: unknown
  restrictions: unknown
  source: string
  user_confirmed: boolean
  updated_at: string
  archived_at?: string | null
  knowledge?: unknown
  knowledge_extracted_at?: string | null
  knowledge_source_url?: string | null
  knowledge_failed_at?: string | null
  knowledge_error?: string | null
  community_map?: unknown
}

const ENTITY_COLUMNS =
  'id, name, type, relationship, personal_use, showability, product_url, affiliate_url, evidence, restrictions, source, user_confirmed, updated_at, archived_at, knowledge, knowledge_extracted_at, knowledge_source_url, knowledge_failed_at, knowledge_error, community_map'

/** Read `restrictions` back defensively. `approvedClaims` is the field §5a.5
 *  turns on — an outcome claim needs a permission that EXISTS — so a malformed
 *  block must degrade to "nothing approved", never to "unrestricted". */
function readRestrictions(raw: unknown): EntityRestrictions {
  const base = emptyRestrictions()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const src = raw as Record<string, unknown>
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []
  return {
    approvedClaims: list(src.approvedClaims),
    forbiddenClaims: list(src.forbiddenClaims),
    complianceNotes: typeof src.complianceNotes === 'string' && src.complianceNotes.trim() !== ''
      ? src.complianceNotes.trim()
      : null,
  }
}

/**
 * A stored row as the contract sees it.
 *
 * VALIDATED, NOT CAST. The CHECK constraints make an out-of-vocabulary value
 * unwritable through this app, but a row can predate a constraint or arrive
 * through the service role — and a `relationship` outside the enum would reach
 * the blueprint prompt as though the creator had chosen it. Anything
 * unreadable returns null and the caller drops the entity, which is the same
 * rule `readStoredBrief` follows for the brief.
 */
function readEntityRow(row: ProductEntityRow): ProductEntityRecord | null {
  if (!isEntityType(row.type)) return null
  if (!isEntityRelationship(row.relationship)) return null
  const name = typeof row.name === 'string' && row.name.trim() !== '' ? row.name.trim() : null
  return {
    id: row.id,
    name,
    type: row.type,
    relationship: row.relationship,
    // A malformed personal-use value falls back to the SAFE side, never the
    // permissive one: NOT_CONFIRMED withholds a first-person experience claim,
    // and withholding one the creator could have made is a smaller failure than
    // writing one they never earned.
    personalUse: isPersonalUse(row.personal_use) ? row.personal_use : 'NOT_CONFIRMED',
    // UNKNOWN on anything unreadable, which is the honest fallback and also the
    // conservative one: `mayShowOnScreen` refuses it, so a malformed value
    // withholds a product-display scene rather than inventing a shot the creator
    // may not be able to take.
    showability: isShowability(row.showability) ? row.showability : 'UNKNOWN',
    productUrl: row.product_url ?? null,
    affiliateUrl: row.affiliate_url ?? null,
    evidence: row.evidence === 'declined'
      ? 'declined'
      : row.evidence && typeof row.evidence === 'object'
        ? (row.evidence as ProductEntityRecord['evidence'])
        : null,
    restrictions: readRestrictions(row.restrictions),
    source: row.source === 'user_answer' ? 'user_answer' : 'inferred',
    userConfirmed: row.user_confirmed === true,
    updated: row.updated_at,
    // ⚖️ ANYTHING NOT A STRING READS AS LIVE. A malformed value must not archive
    // an entity the creator never withdrew — that would silently remove a
    // product from their videos. The safe degradation is the state they had.
    archivedAt: typeof row.archived_at === 'string' ? row.archived_at : null,
    // ⚖️ NULL AND [] ARE DIFFERENT ANSWERS AND BOTH SURVIVE THE READ. Null means
    // nobody has extracted yet — the UI offers a link field. `[]` means we read
    // a page and found nothing usable, which is a result, not an absence.
    knowledge: Array.isArray(row.knowledge)
      ? (row.knowledge as unknown[]).map(readStoredFact).filter((f): f is ExtractedFact => f !== null)
      : null,
    knowledgeExtractedAt: typeof row.knowledge_extracted_at === 'string' ? row.knowledge_extracted_at : null,
    knowledgeSourceUrl: typeof row.knowledge_source_url === 'string' ? row.knowledge_source_url : null,
    // ⚠️ READ, NOT INFERRED. The pair is enforced in the database (0169), and a
    // row that somehow carries one without the other is treated as no failure
    // at all — a half-written failure is not a state a creator can act on.
    knowledgeFailedAt: typeof row.knowledge_failed_at === 'string' && typeof row.knowledge_error === 'string'
      ? row.knowledge_failed_at : null,
    knowledgeError: typeof row.knowledge_failed_at === 'string' && typeof row.knowledge_error === 'string'
      ? row.knowledge_error : null,
    // ⚠️ READ THROUGH THE SAME TEST EVERY CONSUMER USES, NEVER TRUSTED RAW.
    // `mapIsUsable` is what decides whether a community scene may be written at
    // all; a row that fails it must read as NO MAP here rather than reaching a
    // caller that would then have to re-check. A half-map that reads as present
    // and behaves as absent is the exact shape `buildCommunityMap` refuses to
    // create, and the read must not reintroduce it.
    //
    // ⚖️ AND THE DEGRADATION IS TOWARDS SILENCE, which is the safe direction.
    // No map means the writer says nothing about the community; a malformed one
    // treated as usable would let it name surfaces nobody confirmed exist.
    communityMap: mapIsUsable(row.community_map as CommunityMap | null)
      ? (row.community_map as CommunityMap)
      : null,
  }
}

/** Read one stored fact back defensively.
 *
 *  ⚠️ THE STORED `trust` IS HONOURED RATHER THAN RECOMPUTED, and that is the
 *  whole reason it is stored. Re-grading on read would mean a later tightening
 *  of the classifier silently changed the status of facts a creator had already
 *  reviewed — and re-grading a `user_confirmed` fact would throw away the
 *  confirmation entirely.
 *
 *  ⚖️ BUT AN UNREADABLE GRADE DEGRADES TO `needs_confirmation`, never to
 *  `usable`. Junk in the column must not become permission. */
function readStoredFact(raw: unknown): ExtractedFact | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const field = String(r.field ?? '')
  const value = String(r.value ?? '').trim()
  if (value === '' || !EXTRACTED_FIELDS.includes(field as never)) return null
  return {
    field: field as ExtractedFact['field'],
    value,
    source: EXTRACTION_SOURCES.includes(r.source as never)
      ? (r.source as ExtractedFact['source'])
      : 'marketing_copy',
    sourceUrl: typeof r.sourceUrl === 'string' ? r.sourceUrl : null,
    trust: r.trust === 'usable' ? 'usable' : 'needs_confirmation',
    extractedAt: typeof r.extractedAt === 'string' ? r.extractedAt : '',
  }
}

/** Ask the worker to read a product page.
 *
 *  ⚖️ ENQUEUED RATHER THAN AWAITED, because the fetch-and-extract can take tens
 *  of seconds and must survive the creator closing the tab — the dependency
 *  YouTube DNA was just moved off. The page polls the entity for `knowledge`
 *  rather than the job, so a reload picks the result up wherever it got to. */
export async function requestProductExtraction(
  ownerId: string, entityId: string, url: string,
  /** ⚖️ IMAGES ARE A SECOND SOURCE, NOT A SUBSTITUTE FOR THE URL. A creator may
   *  have both — a store page and their own photos — and they establish
   *  different things: the page states the offer, the photos show the object.
   *  Passing them together is what lets one job produce both. */
  imagePaths: readonly string[] = [],
): Promise<void> {
  const clean = url.trim()
  // ⚠️ REFUSED HERE AS WELL AS IN THE WORKER. The worker's check is the one that
  // protects the credentialed process; this one exists so the creator is told
  // immediately rather than watching a job fail silently.
  // ⚠️ IMAGES ALONE ARE A COMPLETE SOURCE. Plenty of products have no page worth
  // reading — a service, a community, something unlaunched — and demanding a URL
  // for those would make the link the price of admission to the whole feature.
  // ⚖️ A URL THAT IS PRESENT MUST STILL BE REAL. This refuses a malformed link
  // rather than quietly dropping it, because a silently ignored link looks
  // exactly like a link that was read and found nothing.
  if (clean === '' && imagePaths.length === 0) {
    throw new Error('Add a link or at least one photo so Twin has something to read.')
  }
  if (clean !== '' && !/^https:\/\//i.test(clean)) throw new Error('Please paste a full https:// link.')
  const { error } = await supabase.from('jobs').insert({
    owner_id: ownerId,
    type: 'extract_product',
    status: 'queued',
    max_attempts: 3,
    // ⚠️ ONLY REAL PATHS, AND NEVER AN EMPTY ARRAY. An empty list and an absent
    // key mean the same thing to the worker, and storing the first would create
    // a fourth state that reads as "images were supplied" to anyone counting.
    payload: imagePaths.length > 0
      ? { entity_id: entityId, url: clean, image_paths: imagePaths.filter((p) => typeof p === 'string' && p.trim() !== '') }
      : { entity_id: entityId, url: clean },
  })
  if (error) throw error
}

/** Promote the facts a creator has checked.
 *
 *  ⚠️ THIS IS THE ONLY PATH FROM `needs_confirmation` TO `usable`, and it exists
 *  because a person acted. `source` becomes `user_confirmed` so the reason is
 *  recorded rather than just the outcome — a fact that reads `usable` with a
 *  `marketing_copy` source would be indistinguishable from a classifier bug.
 *
 *  ⚖️ CONFIRMING IS PER-FACT, NOT PER-PRODUCT. "Confirm everything" on a page of
 *  extracted claims is a single tap that grants a dozen permissions, which is
 *  the same escalation the claim flow refuses. */
export async function confirmProductFacts(
  entityId: string, values: readonly string[],
): Promise<ProductEntityRecord | null> {
  const wanted = new Set(values)
  const { data: current, error: readErr } = await supabase
    .from('product_entities').select('knowledge').eq('id', entityId).single()
  if (readErr) throw readErr
  const facts = Array.isArray((current as { knowledge?: unknown })?.knowledge)
    ? ((current as { knowledge: unknown[] }).knowledge)
    : []
  const next = facts.map((raw) => {
    const f = readStoredFact(raw)
    if (!f || !wanted.has(f.value)) return raw
    return { ...f, source: 'user_confirmed', trust: 'usable' }
  })
  const { data, error } = await supabase
    .from('product_entities').update({ knowledge: next }).eq('id', entityId)
    .select(ENTITY_COLUMNS).single()
  if (error) throw error
  return readEntityRow(data as ProductEntityRow)
}

/** Every entity this creator holds. Unreadable rows are DROPPED rather than
 *  surfaced — see `readEntityRow`. */
export async function loadProductEntities(
  opts: { includeArchived?: boolean } = {},
): Promise<ProductEntityRecord[]> {
  // ⚠️ ARCHIVED ROWS ARE EXCLUDED BY DEFAULT, AND THAT DEFAULT IS THE WHOLE
  // POINT OF THE COLUMN. An archived entity that still reached a caller would
  // keep granting the permission the creator withdrew — which is precisely the
  // failure that argued against a flag in the first place. Callers who want the
  // archive must ask for it by name.
  let q = supabase
    .from('product_entities')
    .select(ENTITY_COLUMNS)
    .order('created_at', { ascending: true })
  if (!opts.includeArchived) q = q.is('archived_at', null)
  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as ProductEntityRow[])
    .map(readEntityRow)
    .filter((e): e is ProductEntityRecord => e !== null)
}

/** A product the creator has TALKED ABOUT, which is not the same as one they own.
 *
 *  `text` is the extracted claim, not a name — "Early is an iOS alarm clock app
 *  that requires push-ups to turn it off" rather than "Early". That is
 *  deliberate: the creator recognises their own material faster than they
 *  recognise a noun we guessed at, and showing the claim is also showing our
 *  evidence for raising it at all. */
export interface ProductSuggestion {
  id: string
  text: string
  basis: 'stated' | 'demonstrated' | 'inferred'
  source: string | null
  timesSeen: number
}

/** Products this creator has mentioned but never claimed.
 *
 *  ⚠️ THIS IS A SUGGESTION LIST AND MAY NEVER BECOME A BACKFILL. It is tempting
 *  to write these straight into `product_entities` and call the empty-table
 *  problem solved. That would be exactly the traceability-versus-entitlement
 *  confusion this codebase exists to prevent: knowing a creator SAID "Peak
 *  Design Phone Tripod" is evidence they mentioned it, and no evidence at all
 *  that they own it, use it, or may make a claim about it. `relationship` and
 *  `personalUse` come from the creator asserting them, or they do not come.
 *
 *  ⚖️ SO THE ONLY THING THIS BUYS IS TYPING. It turns "add your product" from a
 *  blank field into a list of things they actually talked about, which is the
 *  difference between a page nobody fills in and one they can complete in a tap
 *  plus an attestation. The attestation is still required.
 *
 *  Rows already represented by an entity are dropped, matched on the entity name
 *  appearing in the claim — deliberately loose, because showing a duplicate is a
 *  smaller failure than hiding a product they have not registered yet. */
export async function loadProductSuggestions(
  claimed: ReadonlyArray<ProductEntityRecord> = [],
): Promise<ProductSuggestion[]> {
  const { data, error } = await supabase
    .from('creator_knowledge')
    .select('id, text, basis, source, times_seen')
    .eq('kind', 'product')
    .order('times_seen', { ascending: false })
  if (error) throw error

  const names = claimed
    .map((e) => (e.name ?? '').trim().toLowerCase())
    .filter((n) => n.length > 2)

  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((r) => ({
      id: String(r.id ?? ''),
      text: String(r.text ?? '').trim(),
      // ⚖️ An unreadable basis degrades to `inferred`, never to `stated` — the
      // same rule `readKnowledgeItem` uses. A guess must not present as speech.
      basis: r.basis === 'stated' ? 'stated' as const
        : r.basis === 'demonstrated' ? 'demonstrated' as const
          : 'inferred' as const,
      source: typeof r.source === 'string' ? r.source : null,
      timesSeen: typeof r.times_seen === 'number' ? r.times_seen : 1,
    }))
    .filter((s) => s.id !== '' && s.text !== '')
    .filter((s) => !names.some((n) => s.text.toLowerCase().includes(n)))
}

/** Raised when the plan's Product Library allowance is used up.
 *
 *  ⚠️ THIS IS A DIFFERENT KIND OF FAILURE FROM `OwnedEntityExistsError`, AND
 *  CONFLATING THEM WOULD MISLEAD EVERY USER WHO HIT EITHER.
 *
 *      OwnedEntityExistsError   a CORRECTNESS guard fired. Something is already
 *                               there; adding again would duplicate it. Nothing
 *                               the creator can buy changes this.
 *      ProductLibraryFullError  a COMMERCIAL limit fired. The request is
 *                               perfectly valid; they are simply past what
 *                               their plan covers.
 *
 *  ⚖️ AND A COMMERCIAL LIMIT MUST NEVER WEAR A TECHNICAL ERROR'S CLOTHES. "This
 *  product has already been added" shown to someone who hit a plan cap sends
 *  them hunting for a duplicate that does not exist; "you've reached your limit"
 *  shown to a replayed mint invites them to buy their way out of a bug. The
 *  messages are separate because the situations are.
 *
 *  `limit` travels with the error so the caller can say what the allowance IS
 *  rather than only that it was exceeded. */
export class ProductLibraryFullError extends Error {
  readonly limit: number
  constructor(limit: number) {
    super(`You've reached your Product Library limit of ${limit}.`)
    this.name = 'ProductLibraryFullError'
    this.limit = limit
  }
}

/** How many live entities a plan may hold.
 *
 *  ⚠️ CONFIGURATION, NOT A HARD-CODED ASSUMPTION INSIDE PRODUCT KNOWLEDGE. The
 *  numbers belong to pricing and will change without this module changing. An
 *  unknown plan gets `Infinity` rather than zero: failing open costs a few rows,
 *  failing closed locks paying customers out of a feature over a rename.
 *
 *  ⚖️ ARCHIVED ENTITIES DO NOT COUNT. The limit is on what Twin is actively
 *  maintaining knowledge about, so archiving is a real way to make room — which
 *  is exactly what the upgrade-or-archive prompt offers. */
export function productLibraryLimit(entitlements: Record<string, unknown> | null | undefined): number {
  const raw = entitlements?.product_library_limit
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : Infinity
}

/** Raised when a creator claims a SECOND owned product for the same voice.
 *
 *  ⚠️ THE ALTERNATIVE WAS SILENT DATA LOSS. `saveMintedEntity` answers a 23505
 *  from the partial unique index by UPDATING the existing owned row, which is
 *  right there — that path exists for a remount replay arriving twice, where
 *  both writes are the same product. It is exactly wrong here: a creator
 *  claiming a second, different product would have their first one overwritten
 *  in place, silently, with no way to notice. So this path refuses and says why.
 *
 *  ⚖️ AND THE REFUSAL IS THE HONEST ANSWER, NOT A LIMITATION TO ROUTE AROUND.
 *  The database allows ONE owned product per voice by design — the whole
 *  entitlement model assumes "the thing this creator sells" is singular. A
 *  creator who genuinely has two needs a second voice or a schema change, and
 *  both are decisions someone should make deliberately. */
export class OwnedEntityExistsError extends Error {
  constructor() {
    super('You already have a product registered for this voice. Only one owned product is supported per voice.')
    this.name = 'OwnedEntityExistsError'
  }
}

/** Turn a mention the creator has CLAIMED into an entity that carries permissions.
 *
 *  ⚠️ NOTHING CALLS THIS FROM AN EXTRACTOR, AND NOTHING MAY. The argument is an
 *  `EntityAttestation` — a set of answers — precisely so this cannot be handed
 *  the output of a scan. Reaching `product_entities` from `creator_knowledge`
 *  without a creator answering in between is the traceability-versus-entitlement
 *  confusion that keeps this whole module honest: knowing someone MENTIONED a
 *  product is not knowing they may CLAIM one.
 *
 *  `voiceId` is null for a library row — a product the creator has a relationship
 *  with that is not the thing this voice sells. Only owned entities are scoped to
 *  a voice, which is what the partial unique index encodes. */
export async function claimProductEntity(
  ownerId: string,
  voiceId: string | null,
  attestation: EntityAttestation,
  /** The plan's entitlements. Absent means unlimited — a caller that has not
   *  wired entitlements yet must not silently start refusing writes. */
  entitlements?: Record<string, unknown> | null,
): Promise<ProductEntityRecord | null> {
  // ⚠️ WITHOUT THIS, EVERY PRODUCT ADDED FROM THE LIBRARY WAS BORN UNSHOWABLE.
  // `attestedEntity` derives showability from capability flags, and the Library
  // passed none — so `inferShowability(type, {})` returned UNKNOWN, and
  // generate-blueprint renders UNKNOWN as "the creator CANNOT put it on screen.
  // Write NO shot that requires showing, holding or demonstrating it." A creator
  // who had already answered "yes, I can film objects" during onboarding got a
  // talking-only script for the product they had just added.
  //
  // ⚖️ THIS READS AN ANSWER, IT DOES NOT INVENT ONE. The account default is what
  // the creator told us about their setup; applying it here is the same
  // derivation the onboarding mint already does (`mintFromWorkKind` passes
  // `{ canRecordScreen, canFilmObjects }`). An unanswered flag stays unanswered
  // and showability stays UNKNOWN — silence must never become permission any
  // more than it becomes refusal.
  //
  // ⚠️ AN EXPLICIT `flags` ON THE ATTESTATION STILL WINS. A caller that asked the
  // creator about THIS product has a better answer than the account default, and
  // folding the default in would overwrite it.
  let flags = attestation.flags
  if (!flags) {
    try {
      const { data: voiceRow } = await supabase
        .from('brand_voices')
        .select('default_capability_flags, is_default')
        .eq('owner_id', ownerId)
        .order('is_default', { ascending: false })
        .limit(1)
        .maybeSingle()
      const account = readCapabilityFlags(
        (voiceRow as { default_capability_flags?: unknown } | null)?.default_capability_flags,
      )
      // ⚖️ `?? null` RATHER THAN `?? false`. Absent is not a denial — that is the
      // trap 0103 names, and `inferShowability` already reads null as UNKNOWN.
      flags = {
        canRecordScreen: account.can_record_screen ?? null,
        canFilmObjects: account.can_film_objects ?? null,
      }
    } catch {
      // ⚖️ A FAILED READ MUST NOT REFUSE THE CLAIM. The product exists because a
      // person said it is theirs; a transient error reading their setup leaves
      // showability UNKNOWN, which is exactly what it was before this block.
      flags = undefined
    }
  }
  const entity = attestedEntity({ ...attestation, flags })

  // ⚖️ THE ORDER IS CORRECTNESS FIRST, THEN ENTITLEMENT, AND IT IS NOT
  // ARBITRARY. A duplicate mint arriving from an onboarding replay is a BUG; it
  // must be refused as a duplicate whether or not the creator has room, or a
  // customer at their limit would be told to upgrade in order to fix our
  // remount. The correctness check lives in the insert's 23505 handler below —
  // the database is the only place that can answer it without a race — so this
  // check is placed where it cannot mask that one.
  const limit = productLibraryLimit(entitlements)
  if (Number.isFinite(limit)) {
    const { count, error: countErr } = await supabase
      .from('product_entities')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId)
      // ⚠️ LIVE ROWS ONLY. Counting archived entities would make "archive one to
      // make room" — the exact remedy the limit message offers — do nothing.
      .is('archived_at', null)
    // ⚖️ A FAILED COUNT MUST NOT REFUSE THE WRITE. Reading the allowance is not
    // the same as being over it, and treating an unreadable count as "full"
    // would block paying customers on a transient error.
    if (!countErr && typeof count === 'number' && count >= limit) {
      throw new ProductLibraryFullError(limit)
    }
  }
  const owned = isOwned(entity.relationship)
  const row = {
    owner_id: ownerId,
    // ⚖️ A NON-OWNED ENTITY IS NEVER SCOPED TO A VOICE. Writing `voice_id` for an
    // affiliate row would make it collide with the owned-product index the
    // moment the creator later claims something they own.
    voice_id: owned ? voiceId : null,
    name: entity.name,
    type: entity.type,
    relationship: entity.relationship,
    personal_use: entity.personalUse,
    showability: entity.showability,
    product_url: entity.productUrl,
    affiliate_url: entity.affiliateUrl,
    evidence: entity.evidence,
    restrictions: entity.restrictions,
    source: entity.source,
    user_confirmed: entity.userConfirmed,
    // ⚠️ WRITTEN ONLY WHEN IT IS USABLE, AND null OTHERWISE. The column's check
    // constraint (0170) refuses anything that is not a JSON object, so sending
    // a half-map would fail the INSERT — and the creator would be told their
    // product could not be added, for a reason that has nothing to do with the
    // product. Filtering here means a bad map costs the map, never the row.
    community_map: mapIsUsable(attestation.communityMap as CommunityMap | null)
      ? attestation.communityMap
      : null,
  }

  const { data, error } = await supabase
    .from('product_entities')
    .insert(row)
    .select(ENTITY_COLUMNS)
    .single()
  if (error) {
    // 23505 here means the partial unique index caught a SECOND owned product.
    // Unlike the mint path, the correct answer is to refuse — see the error.
    if (error.code === '23505') throw new OwnedEntityExistsError()
    throw error
  }
  return readEntityRow(data as ProductEntityRow)
}

/** Withdraw an entity from future videos, keeping it for the ones already made.
 *
 *  ⚖️ ARCHIVE IS THE DEFAULT WAY OUT, AND DELETE IS THE EXCEPTION. #354 shipped
 *  delete as the only option, arguing a `retired` flag would have no reader and
 *  that a retired row the generator failed to filter would keep granting a
 *  withdrawn permission. The danger was real; the conclusion was wrong. The
 *  answer is to WRITE the reader — `loadProductEntities` and the generator's
 *  owned-entity read both exclude archived rows — not to make withdrawal
 *  destructive and lose the provenance of scripts already written.
 *
 *  ⚠️ ARCHIVING DOES NOT FREE THE OWNED SLOT. The one-owned-per-voice index is a
 *  guard against onboarding remount replay, not a quota, so archiving an owned
 *  product does not let another be minted. Swapping the product a creator sells
 *  is a deliberate act that deserves its own flow. */
export async function archiveProductEntity(id: string, now?: string): Promise<void> {
  const { error } = await supabase
    .from('product_entities')
    .update({ archived_at: now ?? new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** Bring an archived entity back. The sponsorship restarted, the product
 *  relaunched. Null means live — the same three-state discipline used for
 *  `basis`: unrecorded is not false. */
export async function restoreProductEntity(id: string): Promise<void> {
  const { error } = await supabase
    .from('product_entities')
    .update({ archived_at: null })
    .eq('id', id)
  if (error) throw error
}

/** Remove an entity the creator no longer has a relationship with.
 *
 *  ⚖️ A HARD DELETE, NOT A `retired` FLAG, AND THAT IS DELIBERATE. The tidier
 *  design is a status column so the record of what was asserted survives. But
 *  NOTHING WOULD READ IT: `generate-blueprint` selects the owned entity by
 *  relationship, and a `retired` row it did not filter would keep granting the
 *  permissions the creator just withdrew. Adding a field no reader checks is how
 *  this codebase acquired `lastObservedAt` sitting unread for months, and here it
 *  would be worse than unread — it would be actively wrong.
 *
 *  ⚠️ SO THE PERMISSION GOES WHEN THE ROW GOES. A creator who stops selling
 *  something is withdrawing the entitlement, and the next generation must not be
 *  able to find it. If provenance for withdrawn claims is ever needed, it wants a
 *  real audit table with a real reader, not a boolean nobody consults. */
export async function deleteProductEntity(id: string): Promise<void> {
  const { error } = await supabase.from('product_entities').delete().eq('id', id)
  if (error) throw error
}

/** THE ONLY FIELDS A CREATOR MAY EDIT AFTER THE FACT, as a type rather than a
 *  rule someone has to remember.
 *
 *  ⚠️ THE FIELDS LEFT OUT ARE THE POINT. `relationship` and `personalUse` are
 *  what the entitlement ladder reads to decide what this person is ALLOWED to
 *  say — whether a commercial CTA is permitted, whether disclosure is required,
 *  whether a marketing claim may be attributed to them at all. A settings page
 *  that let a creator set `relationship = OWN_PRODUCT` and
 *  `personalUse = CONFIRMED` from a dropdown would unlock every one of those
 *  permissions with a tap and no assertion on record. That is not an edit; it is
 *  a bypass of the whole traceability-versus-entitlement split.
 *
 *  ⚖️ SO THE RESTRICTION IS STRUCTURAL, NOT EDITORIAL. Enforcing it in the form
 *  would mean the guarantee holds only as long as every future page remembers
 *  to. Making the entitlement fields INEXPRESSIBLE in the writer's argument type
 *  means a page that tries to change them does not compile — the same reason
 *  this codebase prefers a contract check to a prompt rule wherever the defect
 *  is decidable. Ownership changes go through an attestation flow that records
 *  what the creator claimed and when, never through here. */
export interface EntityPresentationEdit {
  name?: string | null
  productUrl?: string | null
  showability?: Showability
}

/** Edit the presentation of an entity the creator already declared.
 *
 *  Returns the re-read row so the caller renders what the database now holds
 *  rather than what it hoped it wrote — a mismatch here is exactly the silent
 *  divergence that left `product_entities` empty while onboarding believed it
 *  had saved. */
export async function updateEntityPresentation(
  id: string,
  edit: EntityPresentationEdit,
): Promise<ProductEntityRecord | null> {
  // ⚠️ BUILT KEY BY KEY, NEVER SPREAD. `{ ...edit }` would forward whatever a
  // caller actually passed at runtime — including an `any` carrying
  // `relationship` — straight past the type that exists to forbid it. The
  // compile-time guarantee is only worth what the runtime one is.
  const row: Record<string, unknown> = {}
  if ('name' in edit) row.name = edit.name === null ? null : String(edit.name).trim() || null
  if ('productUrl' in edit) row.product_url = edit.productUrl === null ? null : String(edit.productUrl).trim() || null
  if ('showability' in edit) row.showability = edit.showability
  // An empty edit must not issue a no-op UPDATE that only bumps `updated_at`,
  // which would read afterwards as a change the creator never made.
  if (Object.keys(row).length === 0) return null

  const { data, error } = await supabase
    .from('product_entities')
    .update(row)
    .eq('id', id)
    .select(ENTITY_COLUMNS)
    .single()
  if (error) throw error
  return readEntityRow(data as ProductEntityRow)
}

/**
 * Write the entity Q3 minted, exactly once per voice.
 *
 * IDEMPOTENT BY CONSTRUCTION, and that is not optional. `Onboarding`'s confirm
 * step re-runs on remount — the same class of defect as the V2Building replay
 * that charged three times for one video — so a plain insert would give a
 * creator who navigates back and forward a duplicate product on every pass.
 * `product_entities_one_owned_per_voice` makes that unrepresentable; this
 * writes onto it so the second pass CORRECTS the first rather than failing.
 *
 * ⚠️ NOT AN UPSERT, AND THAT IS THE WHOLE POINT. This used to be
 * `.upsert(row, { onConflict: 'voice_id' })`, which makes PostgREST emit a bare
 * `ON CONFLICT (voice_id)`. The only unique index on `voice_id` is PARTIAL
 * (`where relationship in (…) and voice_id is not null`), and Postgres cannot
 * infer a partial index as an arbiter unless the statement repeats the index
 * predicate — which PostgREST has no way to express. So the write raised
 * (expected `42P10`, "no unique or exclusion constraint matching the ON CONFLICT
 * specification"; inferred from the index/statement mismatch rather than
 * observed against a live database) on EVERY mint.
 *
 * It then failed invisibly: `Onboarding` catches and `console.warn`s, so the
 * creator saw "We'll treat X as your own SaaS", the Product Library stayed
 * empty, and `generate-blueprint` — finding no owned entity — emitted the
 * `DO NOT USE — this creator has no product` block for creators who had one.
 * The confirm screen and the script disagreed, and nothing surfaced it.
 *
 * ⚖️ The read-then-write below is NOT weaker than the upsert it replaces. The
 * partial unique index is still the authority: a lost race raises 23505, which
 * is caught and retried as the update it should have been. The index enforces;
 * this function merely stops asking Postgres a question it cannot answer.
 *
 * Returns null when Q3 implied no entity. That is a different fact from "they
 * have nothing", and callers must not render it as one.
 */
export async function saveMintedEntity(
  ownerId: string,
  voiceId: string,
  entity: DraftEntity | null,
): Promise<ProductEntityRecord | null> {
  if (!entity) return null
  const row = {
    owner_id: ownerId,
    voice_id: voiceId,
    name: entity.name,
    type: entity.type,
    relationship: entity.relationship,
    personal_use: entity.personalUse,
    showability: entity.showability,
    product_url: entity.productUrl,
    affiliate_url: entity.affiliateUrl,
    evidence: entity.evidence,
    restrictions: entity.restrictions,
    source: entity.source,
    user_confirmed: entity.userConfirmed,
  }

  // Scoped exactly like the partial index, so "already minted" here means the
  // same thing it means to the database.
  const updateOwned = async () => {
    const { data, error } = await supabase
      .from('product_entities')
      .update(row)
      .eq('voice_id', voiceId)
      .in('relationship', ['OWN_PRODUCT', 'OWN_SERVICE'])
      .select(ENTITY_COLUMNS)
      .single()
    if (error) throw error
    return readEntityRow(data as ProductEntityRow)
  }

  const { data: existing, error: readErr } = await supabase
    .from('product_entities')
    .select('id')
    .eq('voice_id', voiceId)
    .in('relationship', ['OWN_PRODUCT', 'OWN_SERVICE'])
    .maybeSingle()
  if (readErr) throw readErr
  if (existing) return await updateOwned()

  const { data, error } = await supabase
    .from('product_entities')
    .insert(row)
    .select(ENTITY_COLUMNS)
    .single()
  // 23505 is the partial unique index doing its job against a concurrent mint —
  // the remount replay this function exists for, arriving twice at once. The
  // other pass won, so the correct outcome is the update we would have done.
  if (error) {
    if (error.code === '23505') return await updateOwned()
    throw error
  }
  return readEntityRow(data as ProductEntityRow)
}

// ── the visual pilot's labelling page ────────────────────────────────────────
// The review lives INSIDE Twin, at /internal/review/visual/:pilotRunId, behind
// a normal authenticated admin session. Every one of these calls goes to the
// pilot-review edge function, which re-checks platform_admins with the service
// role -- the route guard is convenience, the function is the boundary.
export type PilotLabel = 'SUPPORTED' | 'UNSUPPORTED' | 'INDETERMINATE' | 'WRONG_EVIDENCE'

export interface PilotClaim {
  id: string; url: string; claim_path: string; answered: boolean
  claim_value: unknown; cited_frames: number[] | null; canonical_values: string[] | null
  current: { label: PilotLabel | null; corrected_value: unknown } | null
}
export interface PilotFrame {
  url: string; frame_index: number; sha256: string
  at_seconds: number | null; schedule_basis: string | null; signed_url: string | null
}
export interface PilotPacket {
  run: {
    id: string; status: string; frozen_size: number; sample_digest: string
    selection_version: string; locked_at: string | null; review_version: number
  }
  references: Array<Record<string, unknown>>
  claims: PilotClaim[]
  frames: PilotFrame[]
  vocabulary: Record<string, string>
  claim_paths: string[]
}

/** A pilot-review failure carrying the classified facts, not just a string.
 *  ⚠️ The page needs to know whether a reply ARRIVED; `message` alone cannot
 *  say. See pilot/callFailure.ts for why that distinction is load-bearing. */
export class PilotCallError extends Error {
  readonly failure: PilotFailure
  constructor(failure: PilotFailure) { super(failure.message); this.failure = failure }
}

const pilot = async <T>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke('pilot-review', { body })
  // ⚠️ A FAILED CALL IS NOT AN EMPTY RESULT. Returning null here would let the
  // page render "0 claims remaining" over a request that never landed, and the
  // Finish button would light up on a run nobody labelled.
  // Same fixed-string trap as the pilot-start helper — read the body.
  if (error) {
    const said = await refusalText(error, 'the review service refused')
    // ⚠️ `context` is the Response for a non-2xx, and ABSENT for a transport
    // failure. Its absence is the evidence that nothing reached the server.
    const ctx = (error as { context?: unknown }).context
    const res = ctx instanceof Response ? ctx : null
    throw new PilotCallError(
      classifyPilotFailure(String(body.action ?? 'unknown'), said, res))
  }
  if ((data as { error?: string })?.error) {
    // A 200 carrying {error} is the server speaking, so it is a REFUSED with a
    // response -- not a transport failure.
    throw new PilotCallError(classifyPilotFailure(
      String(body.action ?? 'unknown'), (data as { error: string }).error, { status: 200 }))
  }
  return data as T
}

export const getPilotPacket = (pilotRunId: string) =>
  pilot<PilotPacket>({ action: 'packet', pilot_run_id: pilotRunId })

/** Autosave. The label is persisted server-side before the reviewer moves on;
 *  null is an explicit SKIP and is recorded as one, not as an absence. */
export const savePilotLabel = (
  pilotRunId: string, claimId: string, label: PilotLabel | null, correctedValue?: unknown,
) => pilot<{ ok: true }>({
  action: 'label', pilot_run_id: pilotRunId, claim_id: claimId, label, corrected_value: correctedValue ?? null,
})

/** ⚖️ THE FRICTION LOG IS THE ONLY INPUT TO #69. Requirements come from what was
 *  slow and repetitive in a real session, not from a memo written beforehand. */
export const logPilotEvent = (pilotRunId: string, kind: string, detail?: unknown) =>
  pilot<{ ok: true }>({ action: 'event', pilot_run_id: pilotRunId, kind, detail: detail ?? null })

export const finishPilotReview = (pilotRunId: string) =>
  pilot<{ ok: true; decision: unknown; report: unknown }>({ action: 'finish', pilot_run_id: pilotRunId })

// ── starting a pilot ────────────────────────────────────────────────────────
//
// ⚠️ THIS CLIENT CANNOT SEND MORE THAN THE ENDPOINT ACCEPTS, AND THAT IS NOT
// THE BOUNDARY. pilot-start refuses unknown keys itself; these helpers simply
// have no parameter for a URL list, a payload, or a backlog flag, so a caller
// cannot fumble one in by accident either. The server check is the real one.

export interface PilotQuote {
  references: number
  /** ⚠️ TWO PER REFERENCE. force:true re-acquires AND pulls frames. */
  downloads: number
  visionCalls: number
}

const start = async <T>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke('pilot-start', { body })
  if (error) throw new Error(await refusalText(error, 'the pilot service refused'))
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
  return data as T
}

/**
 * The pilot that is already in flight, if there is one.
 *
 * ⚖️ RECOVERY, NOT DISCOVERY. It returns an id the caller may poll, which is
 * how a run that was started in some other session — or before a fix shipped —
 * becomes reachable again without starting, re-enqueuing or re-paying anything.
 */
export const activePilot = () =>
  start<{ ok: true; pilot_run_id: string | null; status: string | null }>({ action: 'active' })

/** What it would cost. Touches no table and enqueues nothing, so the bill can
 *  be seen without running the version that spends it. */
export const quotePilot = (size: number, costCeilingDownloads: number) =>
  start<{ ok: true; quoted: PilotQuote; ceiling: number; enqueued: 0 }>({
    action: 'quote', size, cost_ceiling_downloads: costCeilingDownloads,
  })

/** Freeze a sample and enqueue exactly it. Refuses while another pilot is
 *  live, and refuses if the real bill exceeds the ceiling the caller stated. */
/** Which population a pilot draws from. `speech` is the one that can exercise
 *  the content-beats arm; `no_speech` cannot, because a silent reference has no
 *  content profile to take beats from. */
export type PilotCohort = 'no_speech' | 'speech'

export const startPilot = (size: number, costCeilingDownloads: number, cohort: PilotCohort = 'no_speech') =>
  start<{ ok: true; pilot_run_id: string; frozen: number; enqueued: number; quoted: PilotQuote; ceiling: number }>({
    action: 'start', size, cost_ceiling_downloads: costCeilingDownloads, cohort,
  })

export interface PilotStatus {
  ok: true
  pilot_run_id: string
  status: string
  collecting: boolean
  progress: {
    /** ⚠️ THE DENOMINATOR. Never the survivors — a 6-of-8 pilot must not read as 100%. */
    selected: number
    ready_for_label: number
    failed: number
    unreadable: number
    still_running: number
  }
  attrition: Record<string, unknown>
  /** What the server stored, the moment it stored it. Null until it could. */
  packet: { references: number; ready: number; claims: number } | null
  /**
   * ⚠️ WHY THE PACKET WAS REFUSED, VERBATIM. "a reference has no terminal state",
   * "no reference produced claims", "the packet does not match the attrition
   * report" — each is a reason this run must not be labelled yet, and each is
   * shown rather than flattened into a spinner.
   */
  packet_error: string | null
  /**
   * ⚠️ GATED ON A PERSISTED, NON-EMPTY PACKET — NOT ON PROGRESS. Progress reads
   * reference_content_profiles; the review page reads visual_pilot_claims. A
   * real pilot once handed over this URL on the strength of the first while the
   * second was empty, and eight references of paid-for evidence rendered as
   * "Claim 1 of 0".
   */
  review_url: string | null
}

/** Poll a run. Read-only; refuses unknown keys exactly like start does. */
export const pilotStatus = (pilotRunId: string) =>
  start<PilotStatus>({ action: 'status', pilot_run_id: pilotRunId })

// ── the watched session (D1) ───────────────────────────────────────────────
//
// ⚖️ THE MACHINE COLLECTS, THE OBSERVER ASKS WHY. Every call below either moves
// the session's state or records what a human typed. None of them produces a
// blocker, and no client-side default may ever supply one.

export interface WatchedSessionGap { event_name: string; reason: string }
export interface WatchedSessionFinish {
  ok: true
  status: string
  events_captured: number
  /** ⚠️ NAMED, NOT COUNTED. "uninstrumented" is a fact about the code;
   *  "unknown" is an honest shrug. Neither means the creator did not do it. */
  blind_spots: WatchedSessionGap[]
  required_events: number
}

const watched = async <T>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke('watched-session', { body })
  if (error) throw new Error(error.message ?? 'the session service refused')
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
  return data as T
}

export const createWatchedSession = (subjectUserId: string) =>
  watched<{ ok: true; watched_session_id: string }>({ action: 'create', subject_user_id: subjectUserId })

/** Records the yes. The server refuses to start watching without it. */
export const consentWatchedSession = (id: string) =>
  watched<{ ok: true }>({ action: 'consent', watched_session_id: id })

export const startWatchedSession = (id: string) =>
  watched<{ ok: true; status: string }>({ action: 'start', watched_session_id: id })

export const finishWatchedSession = (id: string) =>
  watched<WatchedSessionFinish>({ action: 'finish', watched_session_id: id })

/** ⚠️ THE ONLY HUMAN WRITE. `creatorReason` is the creator's own words and the
 *  server refuses an empty one — a blocker code alone says nothing. */
export const observeWatchedSession = (id: string, blocker: string, creatorReason: string) =>
  watched<{ ok: true }>({
    action: 'observe', watched_session_id: id, blocker, creator_reason: creatorReason,
  })

export const lockWatchedSession = (id: string) =>
  watched<{ ok: true; status: string; observations: number }>({ action: 'lock', watched_session_id: id })

// ── the owner console ──────────────────────────────────────────────────────
//
// ⚠️ WHAT IS LEFT TO DO, ANSWERED BY THE DATABASE. Every field below is
// computed from rows and schema probes at read time, so a card cannot be stale
// — there is nowhere for it to be stale from.
//
// ⚖️ APPENDED AT THE END DELIBERATELY. The pilot helpers above are being edited
// on another branch; putting an unrelated addition in the middle of them buys a
// merge conflict for no reason.

export type OwnerCardState = 'done' | 'action_needed' | 'working' | 'blocked' | 'waiting' | 'unknown'

export interface OwnerCard {
  card: 'production_schema' | 'visual_pilot' | 'recordings' | 'watched_session' | 'key_rotation'
  state: OwnerCardState
  /** Null whenever there is nothing for a person to do — never a filler task. */
  ownerAction: string | null
  detail: string
  href?: string
  checklist?: string[]
  /** Pending migration files, in the order they must be applied. */
  steps?: Array<{ id: string; file: string; because: string }>
  /** Cards this one blocks; a blocked card is never offered as "next". */
  blocks?: string[]
}

export interface OwnerConsoleView {
  ok: true
  cards: OwnerCard[]
  /** Exactly one thing, or null. A list of five is the problem, not the answer. */
  next: OwnerCard | null
  generated_at: string
}

/** Read-only. Starts nothing, enqueues nothing, spends nothing. */
export const ownerConsole = async (): Promise<OwnerConsoleView> => {
  const { data, error } = await supabase.functions.invoke('owner-console', { body: { action: 'cards' } })
  if (error) throw new Error(error.message ?? 'the owner console could not be read')
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
  return data as OwnerConsoleView
}
