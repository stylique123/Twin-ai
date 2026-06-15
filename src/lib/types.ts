// Shared domain types for TwinAI

export type Platform = 'tiktok' | 'instagram' | 'youtube' | 'other'

export interface CreatorDNA {
  niche: string
  audience: string
  product: string
  goal: string
  voice: string // how they sound: e.g. "direct, warm, a little punchy"
  platforms: Platform[]
  editing_style: string // e.g. "fast jump cuts, burned-in captions"
}

export interface Profile {
  id: string
  email: string
  display_name: string | null
  plan: 'free' | 'aspiring' | 'professional' | 'agency'
  account_type: 'creator' | 'agency'
  credits: number
  dna: CreatorDNA | null
  onboarded: boolean
  created_at: string
}

// Phase 2, Brand-DNA learned from a creator's handle. The voice we write in.
export interface VoiceProfile {
  summary: string
  niche: string
  tone: string
  pacing: string
  hook_style: string
  vocabulary: string[]
  recurring_ctas: string[]
  dos: string[]
  donts: string[]
  sample_hooks: string[]
}

export interface BrandVoice {
  id: string
  owner_id: string
  handle: string
  platform: Platform
  label: string | null
  profile: VoiceProfile | null
  status: 'building' | 'ready' | 'failed'
  is_default: boolean
  error: string | null
  created_at: string
  updated_at: string
}

// What the AI returns, a real, structured, shootable blueprint
export interface Blueprint {
  reference_read: {
    platform: Platform
    format_label: string // e.g. "The Trust Builder"
    why_it_works: string[]
    retention_map: { beat: string; goal: string; tactic?: string }[]
  }
  hook_options: string[]
  script: { section: string; line: string; direction: string }[]
  shot_list: { shot: string; framing: string; notes: string }[]
  captions: string[]
  edit_checklist: string[]
  // TwinAI's own auto-captioner spec (renamed from submagic_packet, we own the
  // edit now). submagic_packet kept optional for backward-compat with old rows.
  caption_packet: {
    caption_style: string
    pacing: string
    emphasis: string
    export: string
  }
  submagic_packet?: {
    caption_style: string
    pacing: string
    emphasis: string
    export: string
  }
  publish_plan: { platform: Platform; caption: string; hashtags: string[]; best_time: string }[]
  production_sprint: { minute: string; task: string }[]
}

export interface Generation {
  id: string
  user_id: string
  reference_url: string | null
  reference_note: string | null
  fidelity: 'close' | 'balanced' | 'loose'
  blueprint: Blueprint
  transcript_id?: string | null
  // Set once the auto-edit worker finishes: the rendered MP4 and cover JPEG
  // (storage paths in the private `edits` bucket; sign to display/play).
  edit_path?: string | null
  thumb_path?: string | null
  created_at: string
}
