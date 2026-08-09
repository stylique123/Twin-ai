import type { SupabaseClient } from '@supabase/supabase-js'
import { planFor } from './brand'
import {
  readCapabilityFlags, resolveCapabilities, sanitizeCapabilityFlagsForWrite,
  type CapabilityFlags, type ResolvedCapabilities,
} from './editor/capabilities'
import type { BrandVoice, CreatorDNA, Generation, Platform, Profile, VoiceProfile } from './types'
import { sanitizeBriefForWrite, readStoredBrief, type BriefAnswers } from './preScriptBrief'
import {
  emptyRestrictions, isEntityRelationship, isEntityType, isPersonalUse, isShowability,
  type DraftEntity, type EntityRestrictions, type ProductEntityRecord,
} from './productEntity'
import { generationLifecycle, resolveFinishedOutputs, resolveFinishedOutputsResult } from './editor/finishedOutput'

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
export function initApi(opts: { client: SupabaseClient; appOrigin?: string; uploadSigned?: UploadSigned }): void {
  _sb = opts.client
  _appOrigin = opts.appOrigin ?? ''
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

export interface GenerateInput {
  reference_url: string
  reference_note: string
  fidelity: 'close' | 'balanced' | 'loose'
  // How the script should SOUND (delivery energy), independent of fidelity (how
  // close to the reference structure). Optional; defaults to 'balanced' server-side.
  tone?: 'understated' | 'balanced' | 'punchy'
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
      } catch {
        /* fall back to msg */
      }
    }
    const err = new Error(msg) as Error & { code?: string }
    if (code) err.code = code
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
  patch: { selected_hook?: string },
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
  visibility: 'public' | 'private'
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
}

const ENTITY_COLUMNS =
  'id, name, type, relationship, personal_use, showability, product_url, affiliate_url, evidence, restrictions, source, user_confirmed, updated_at'

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
  }
}

/** Every entity this creator holds. Unreadable rows are DROPPED rather than
 *  surfaced — see `readEntityRow`. */
export async function loadProductEntities(): Promise<ProductEntityRecord[]> {
  const { data, error } = await supabase
    .from('product_entities')
    .select(ENTITY_COLUMNS)
    .order('created_at', { ascending: true })
  if (error) throw error
  return ((data ?? []) as ProductEntityRow[])
    .map(readEntityRow)
    .filter((e): e is ProductEntityRecord => e !== null)
}

/**
 * Write the entity Q3 minted, exactly once per voice.
 *
 * IDEMPOTENT BY CONSTRUCTION, and that is not optional. `Onboarding`'s confirm
 * step re-runs on remount — the same class of defect as the V2Building replay
 * that charged three times for one video — so a plain insert would give a
 * creator who navigates back and forward a duplicate product on every pass.
 * `product_entities_one_owned_per_voice` makes that unrepresentable; this
 * upserts onto it so the second pass CORRECTS the first rather than failing.
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
  const { data, error } = await supabase
    .from('product_entities')
    .upsert({
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
    }, { onConflict: 'voice_id', ignoreDuplicates: false })
    .select(ENTITY_COLUMNS)
    .single()
  if (error) throw error
  return readEntityRow(data as ProductEntityRow)
}
