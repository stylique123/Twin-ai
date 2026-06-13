import { supabase } from './supabase'
import type { Blueprint, BrandVoice, CreatorDNA, Generation, Platform, Profile, VoiceProfile } from './types'

// ---- Profile / Creator DNA ----------------------------------------------

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

// ---- Platform admin (super-admin / support) -----------------------------

// True only for users in public.platform_admins. RLS guarantees a normal user
// gets `false` (the function returns false for non-admins), so this is safe to
// call from the client to gate an admin area. All admin WRITES still go through
// audited, service-role-only RPCs — never directly from the browser.
export async function isPlatformAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_platform_admin')
  if (error) return false
  return data === true
}

// ---- Blueprint generation (real AI via edge function) -------------------

export interface GenerateInput {
  reference_url: string
  reference_note: string
  fidelity: 'close' | 'balanced' | 'loose'
  // Optional: when the reference was analyzed by the worker (real transcript),
  // pass its transcript_id so the blueprint is built from the actual video.
  transcript_id?: string
}

// ---- Reference ingestion (worker: transcribe + derive real structure) ----

export interface IngestJob {
  id: string
  status: 'queued' | 'running' | 'done' | 'failed'
  result:
    | { transcript_id?: string; output_url?: string; output_path?: string; duration_sec?: number; words?: number }
    | null
  error: string | null
}

// ---- Auto-editor (Phase 6: worker burns captions + vertical + loudness) ----

// Upload a recorded take to private storage, then enqueue an `autoedit` job.
// Returns the job id to poll with getJob; on `done`, result.output_url is the
// finished, signed MP4 URL.
// First auto-edit is FREE (bundled with the blueprint). Uploads the take, then
// enqueues THROUGH the edge function — the only credit-enforced path. The server
// decides free-vs-paid, so the client can't grant itself a free render.
export async function autoEditTake(generationId: string, blob: Blob): Promise<{ jobId: string; takePath: string }> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')
  const uid = auth.user.id
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
  const take_path = `${uid}/${generationId}-${Date.now()}.${ext}`

  const up = await supabase.storage
    .from('takes')
    .upload(take_path, blob, { contentType: blob.type || 'video/webm', upsert: true })
  if (up.error) throw up.error

  const { data, error } = await supabase.functions.invoke('enqueue-autoedit', {
    body: { generation_id: generationId, take_path },
  })
  if (error) throw new Error(await readInvokeError(error))
  return { jobId: (data as { job_id: string }).job_id, takePath: take_path }
}

// A REMAKE re-edits the same take with a fresh look — costs one recreation,
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

// Kick off real analysis of a reference URL. Returns the worker job id to watch.
export async function ingestReference(url: string, platform?: string): Promise<string> {
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
  return (data as { job_id: string }).job_id
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
    // error.message — read the function's JSON body so the real reason
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

// ---- Dashboard (Phase 7: real stats from data we already own) ------------

export interface DashboardStats {
  blueprints: number
  edits: number
  posts: number
  recreationsLeft: number
}

export async function getDashboardStats(creditsLeft: number): Promise<DashboardStats> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  const head = { count: 'exact' as const, head: true }
  const [bp, ed, po] = await Promise.all([
    supabase.from('generations').select('id', head),
    uid
      ? supabase.from('jobs').select('id', head).eq('type', 'autoedit').eq('status', 'done').eq('owner_id', uid)
      : Promise.resolve({ count: 0 } as { count: number }),
    supabase.from('posts').select('id', head).eq('status', 'posted'),
  ])
  return {
    blueprints: (bp as { count: number | null }).count ?? 0,
    edits: (ed as { count: number | null }).count ?? 0,
    posts: (po as { count: number | null }).count ?? 0, // 0 until posts table exists
    recreationsLeft: Math.floor(creditsLeft / 10),
  }
}

// ---- Posts (Phase 7: publish tracking) -----------------------------------

export interface Post {
  id: string
  generation_id: string | null
  platform: string
  caption: string | null
  status: 'scheduled' | 'posted'
  scheduled_for: string | null
  posted_at: string | null
  external_url: string | null
  created_at: string
}

export async function listPosts(): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select('id, generation_id, platform, caption, status, scheduled_for, posted_at, external_url, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return [] // table may not be migrated yet — fail soft
  return (data ?? []) as Post[]
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

// ---- Brand voices (Phase 2 — DNA from handle) ---------------------------

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
  status: 'building'
}

export async function startDna(handle: string, platform: Platform): Promise<StartDnaResult> {
  const { data, error } = await supabase.functions.invoke('start-dna', {
    body: { handle, platform, make_default: true },
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

export async function getBrandVoice(id: string): Promise<BrandVoice | null> {
  const { data, error } = await supabase.from('brand_voices').select('*').eq('id', id).single()
  if (error) return null
  return data as BrandVoice
}

// Persist user edits from the confirm card (the editable chips).
export async function saveVoiceProfile(id: string, profile: VoiceProfile): Promise<void> {
  const { error } = await supabase.from('brand_voices').update({ profile }).eq('id', id)
  if (error) throw error
}

export async function setDefaultBrandVoice(id: string): Promise<void> {
  const { error } = await supabase.from('brand_voices').update({ is_default: true }).eq('id', id)
  if (error) throw error
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

export interface SubmitGalleryInput {
  url: string
  platform: string
  niche: string
  creator?: string
  title?: string
  why?: string
  visibility: 'public' | 'private'
}

export async function submitGalleryItem(input: SubmitGalleryInput): Promise<GalleryItem> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')
  const { data, error } = await supabase
    .from('gallery_items')
    .insert({ ...input, owner_id: auth.user.id })
    .select('*')
    .single()
  if (error) throw error
  return data as GalleryItem
}

export async function deleteGalleryItem(id: string): Promise<void> {
  const { error } = await supabase.from('gallery_items').delete().eq('id', id)
  if (error) throw error
}

export type { Blueprint }
