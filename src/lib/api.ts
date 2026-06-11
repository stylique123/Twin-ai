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

// Mark onboarding complete (used by the handle path, which has no quiz DNA).
export async function markOnboarded(): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')
  const { error } = await supabase.from('profiles').update({ onboarded: true }).eq('id', auth.user.id)
  if (error) throw error
}

export type { Blueprint }
