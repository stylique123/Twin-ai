import type { SupabaseClient } from '@supabase/supabase-js'
import { planFor } from './brand'
import type { BrandVoice, CreatorDNA, EditDecisionList, Generation, Platform, Profile, VoiceProfile } from './types'

// ---- Client injection ------------------------------------------------------
// The web app is the single client surface. It wires its Supabase client, an
// app origin (for share links), and a file-upload impl into this layer via
// initApi() at startup, keeping browser specifics (window, storage, Blob
// upload) out of the shared code so it stays a pure, testable API surface.

// A recorded take. The web recorder produces a Blob.
export interface TakeFile { contentType: string; blob?: unknown; name?: string }
// onProgress reports upload completion as a 0..1 fraction, or -1 for indeterminate.
export type UploadTake = (path: string, file: TakeFile, onProgress?: (fraction: number) => void) => Promise<void>

let _sb: SupabaseClient | undefined
let _appOrigin = ''
let _uploadTake: UploadTake | undefined

export function initApi(opts: { client: SupabaseClient; appOrigin?: string; uploadTake?: UploadTake }): void {
  _sb = opts.client
  _appOrigin = opts.appOrigin ?? ''
  _uploadTake = opts.uploadTake
}

function activeClient(): SupabaseClient {
  if (!_sb) throw new Error('TwinAI API not initialized — call initApi({ client }) at app startup.')
  return _sb
}

// The initialized Supabase client, for sibling shared modules (e.g. timelineApi)
// that need direct table access without re-importing the platform wiring.
export function getClient(): SupabaseClient {
  return activeClient()
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

export async function getProfile(): Promise<Profile | null> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', auth.user.id)
    .single()
  if (error) return null
  return data as Profile
}

export async function saveDNA(dna: CreatorDNA): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')
  const { error } = await supabase
    .from('profiles')
    .update({ dna, onboarded: true })
    .eq('id', auth.user.id)
  if (error) throw error
}

export async function updateDisplayName(name: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: name.trim() || null })
    .eq('id', auth.user.id)
  if (error) throw error
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
}

// ---- Reference ingestion (worker: transcribe + derive real structure) ----

export interface IngestJob {
  id: string
  status: 'queued' | 'running' | 'done' | 'failed'
  result:
    | {
        transcript_id?: string
        output_url?: string
        output_path?: string
        duration_sec?: number
        words?: number
        edl_path?: string // path to the EDL JSON in the edits bucket (for Refine)
        // Live progress while the job is still running (worker updates this).
        progress?: { phase: string; pct: number; label: string; instant_url?: string }
      }
    | null
  error: string | null
}

// ---- Auto-editor (Phase 6: worker burns captions + vertical + loudness) ----

// Upload a recorded take to private storage, then enqueue an `autoedit` job.
// Returns the job id to poll with getJob; on `done`, result.output_url is the
// finished, signed MP4 URL.
// First auto-edit is FREE (bundled with the blueprint). Uploads the take, then
// enqueues THROUGH the edge function, the only credit-enforced path. The server
// decides free-vs-paid, so the client can't grant itself a free render.
// `shots` describes the per-scene structure of a recorded take.
// - bounds/total/lines: cumulative cut points (contiguous scenes) — original contract.
// - segments: explicit keep-windows [{start,end,line}] in seconds. When present, the
//   worker trims to ONLY these windows and concatenates them (so a re-taken/flubbed
//   stretch between windows is dropped), captioning each window from its line. This is
//   what makes per-scene Retake correct on a single continuous recording.
export interface TakeShots {
  bounds: number[]
  total: number
  lines: string[]
  segments?: { start: number; end: number; line: string }[]
}

export async function autoEditTake(generationId: string, file: TakeFile, shots?: TakeShots, aspect?: '9:16' | '1:1', onProgress?: (fraction: number) => void): Promise<{ jobId: string; takePath: string }> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')
  const uid = auth.user.id
  const contentType = file.contentType || 'video/webm'
  const ext = contentType.includes('mp4') ? 'mp4' : 'webm'
  const take_path = `${uid}/${generationId}-${Date.now()}.${ext}`

  // Upload impl (uploads the recorder's Blob) is injected by the web app via initApi.
  if (!_uploadTake) throw new Error('No uploadTake configured — pass it to initApi().')
  await _uploadTake(take_path, file, onProgress)

  const { data, error } = await supabase.functions.invoke('enqueue-autoedit', {
    body: { generation_id: generationId, take_path, aspect, ...(shots ? { shots } : {}) },
  })
  if (error) throw new Error(await readInvokeError(error))
  return { jobId: (data as { job_id: string }).job_id, takePath: take_path }
}

// A REMAKE re-edits the same take with a fresh look, costs one recreation,
// charged server-side by the enqueue-autoedit function.
export async function remakeEdit(generationId: string, takePath: string, variation: number): Promise<string> {
  const { data, error } = await supabase.functions.invoke('enqueue-autoedit', {
    body: { generation_id: generationId, take_path: takePath, remake: true, variation },
  })
  if (error) {
    let msg = (error as { message?: string }).message ?? 'Could not start the remake'
    const ctx = (error as { context?: Response }).context
    if (ctx?.json) {
      try {
        const b = await ctx.json()
        if (b?.error) msg = b.error
      } catch {
        /* keep msg */
      }
    }
    throw new Error(msg)
  }
  return (data as { job_id: string }).job_id
}

// Download the EDL JSON for a finished edit (from its signed edits-bucket path),
// so the Refine panel can load the exact decisions the auto-edit made.
export async function fetchEdl(edlPath: string): Promise<EditDecisionList | null> {
  try {
    const urls = await signEditUrls([edlPath])
    const url = urls[edlPath]
    if (!url) return null
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json()) as EditDecisionList
  } catch {
    return null
  }
}

// REFINE: re-render the same take from the creator's edited EDL. Free (it's a
// correction of an edit they already paid for), enforced server-side.
export async function reEditWithEdl(generationId: string, takePath: string, edl: EditDecisionList): Promise<string> {
  const { data, error } = await supabase.functions.invoke('enqueue-autoedit', {
    body: { generation_id: generationId, take_path: takePath, edl },
  })
  if (error) throw new Error(await readInvokeError(error))
  return (data as { job_id: string }).job_id
}

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
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.json()
        if (body?.error) msg = body.error
      } catch {
        /* fall back to msg */
      }
    }
    throw new Error(msg)
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

export async function getGeneration(id: string): Promise<Generation | null> {
  const { data, error } = await supabase.from('generations').select('*').eq('id', id).single()
  if (error) return null
  return data as Generation
}

// Persist the creator's hook/edit-style choice on their generation. Column grants
// (migration 0014) restrict the update to these two presentation fields, so this
// is safe to call from the client. Returns false on failure (caller is optimistic).
export async function updateGenerationChoice(
  id: string,
  patch: { selected_hook?: string; edit_style?: string },
): Promise<boolean> {
  const { error } = await supabase.from('generations').update(patch).eq('id', id)
  return !error
}

// Agency approval: mark a blueprint client-approved (or back to pending). Owner-only.
export async function setGenerationApproved(id: string, approved: boolean): Promise<boolean> {
  const { error } = await supabase.from('generations').update({ approved }).eq('id', id)
  return !error
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

// ---- Reusable reference templates ------------------------------------------
export interface ReferenceTemplate {
  id: string
  name: string
  reference_url: string
  note: string | null
  fidelity: string | null
  tone: string | null
  created_at: string
}
export async function listTemplates(): Promise<ReferenceTemplate[]> {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return data as ReferenceTemplate[]
}
export async function saveTemplate(t: {
  name: string
  reference_url: string
  note?: string
  fidelity?: string
  tone?: string
}): Promise<ReferenceTemplate | null> {
  const { data: auth } = await supabase.auth.getUser()
  const owner_id = auth.user?.id
  if (!owner_id) return null
  const { data, error } = await supabase.from('templates').insert({ owner_id, ...t }).select().single()
  if (error || !data) return null
  return data as ReferenceTemplate
}
export async function deleteTemplate(id: string): Promise<void> {
  await supabase.from('templates').delete().eq('id', id)
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
export async function generateThumbnail(generationId: string): Promise<{ url: string; path: string }> {
  const { data, error } = await supabase.functions.invoke('generate-thumbnail', { body: { generation_id: generationId } })
  if (error) throw new Error(await readInvokeError(error))
  return data as { url: string; path: string }
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
}

export async function getDashboardStats(creditsLeft: number): Promise<DashboardStats> {
  const [{ data: gens }, { data: posts }] = await Promise.all([
    supabase.from('generations').select('id, edit_path'),
    supabase.from('posts').select('generation_id').eq('status', 'posted'),
  ])
  const publishedIds = new Set(((posts ?? []) as { generation_id: string | null }[]).map((p) => p.generation_id).filter(Boolean))
  let drafts = 0, ready = 0, published = 0
  for (const g of (gens ?? []) as { id: string; edit_path: string | null }[]) {
    if (publishedIds.has(g.id)) published++
    else if (g.edit_path) ready++
    else drafts++
  }
  return { drafts, ready, published, recreationsLeft: Math.floor(creditsLeft / 10) }
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

// Self-reported performance: the creator logs how their posted video did. Real
// auto-pulled numbers land later via platform OAuth; this fills the same columns.
export async function updatePostStats(postId: string, views: number, likes?: number): Promise<void> {
  const patch: Record<string, unknown> = { views }
  if (likes !== undefined) patch.likes = likes
  try { await supabase.from('posts').update(patch).eq('id', postId) } catch { /* best-effort */ }
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
    })
    .select('id, generation_id, platform, caption, status, scheduled_for, posted_at, external_url, created_at')
    .single()
  if (error) throw error
  return data as Post
}

// Schedule a post for a future date on a chosen platform, from a library item.
// status='scheduled'; the calendar shows it on `scheduled_for`. Real auto-posting
// (platform OAuth) lands later; until then this is a calendar + caption holder so
// the creator posts on time with everything ready.
export async function schedulePost(input: {
  generationId: string
  platform: string
  scheduledFor: string // ISO timestamp
  caption?: string
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
      status: 'scheduled',
      scheduled_for: input.scheduledFor,
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
  // 'ready' is returned on a DNA cache hit (start-dna returns it directly); 'building' otherwise.
  status: 'building' | 'ready'
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
  const { error } = await supabase.from('brand_voices').update({ profile, status: 'ready', error: null }).eq('id', id)
  if (error) throw error
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
  const { error } = await supabase.from('profiles').update({ onboarded: true }).eq('id', auth.user.id)
  if (error) throw error
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
