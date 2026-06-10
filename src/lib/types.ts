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
  credits: number
  dna: CreatorDNA | null
  onboarded: boolean
  created_at: string
}

// What the AI returns — a real, structured, shootable blueprint
export interface Blueprint {
  reference_read: {
    platform: Platform
    format_label: string // e.g. "The Trust Builder"
    why_it_works: string[]
    retention_map: { beat: string; goal: string }[]
  }
  hook_options: string[]
  script: { section: string; line: string; direction: string }[]
  shot_list: { shot: string; framing: string; notes: string }[]
  captions: string[]
  edit_checklist: string[]
  submagic_packet: {
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
  created_at: string
}
