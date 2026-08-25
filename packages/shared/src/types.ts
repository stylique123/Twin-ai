// Shared domain types for TwinAI
import type { HookChoice } from './hookChoice'

export type Platform = 'tiktok' | 'instagram' | 'youtube' | 'linkedin' | 'other'

export interface CreatorDNA {
  niche: string
  audience: string
  product: string
  goal: string
  voice: string // how they sound: e.g. "direct, warm, a little punchy"
  platforms: Platform[]
  editing_style: string // e.g. "fast jump cuts, burned-in captions"
  voice_samples?: string // verbatim writing samples (e.g. pasted LinkedIn posts) — the strongest voice signal
}

export interface Profile {
  id: string
  email: string
  display_name: string | null
  plan: 'free' | 'aspiring' | 'professional' | 'studio' | 'agency'
  account_type: 'creator' | 'agency'
  credits: number
  dna: CreatorDNA | null
  onboarded: boolean
  created_at: string
  referral_code?: string | null
  // Set the first time the product tour opens — account-level, so the tour shows
  // exactly once per USER, not once per browser.
  tour_seen_at?: string | null
}

// Phase 2, Brand-DNA learned from a creator's handle. The voice we write in.
export interface VoiceProfile {
  summary: string
  niche: string
  sub_niche?: string
  // The scan infers these from the posts/bio/niche; they were produced by the DNA
  // synthesis all along but weren't typed, so onboarding couldn't prefill them.
  audience?: string
  audience_pain?: string
  dream_outcome?: string
  offer?: string
  tone: string
  pacing: string
  hook_style: string
  hook_patterns?: string[]
  // The creator's PLAYBOOK beyond their words: the recurring video FORMATS/archetypes
  // they make, and how they package (title + thumbnail). Captured on newer scans so
  // the blueprint can adapt one of THEIR real formats instead of a generic one.
  formats?: string[]
  title_style?: string
  thumbnail_style?: string
  pov?: string[]
  enemy?: string
  vocabulary: string[]
  recurring_ctas: string[]
  dos: string[]
  donts: string[]
  sample_hooks: string[]
}

// Per-workspace brand kit: the creator's REAL brand colors as hex (#RRGGBB) — set
// manually or learned from their DNA — plus an optional logo. primary/secondary
// feed the blueprint's look guidance; the rebuilt editor will consume the kit for
// renders. caption_style/color/palette.highlight are legacy old-editor fields kept
// optional so stored kits still parse.
export interface BrandKit {
  caption_style?: string
  color?: number
  palette?: { primary?: string; secondary?: string; highlight?: string }
  // How `palette` was set. 'manual' = the creator hand-picked it (sacred — a re-scan
  // never overwrites it); 'auto' = learned from their DNA imagery, so a fresh scan
  // may refresh it with better data; 'pending' = a scan tried but couldn't read any
  // colors (e.g. Instagram blocked the images) — the UI prompts the creator to set
  // them by hand instead of showing a fake palette. Absent on legacy rows → 'auto'.
  palette_source?: 'auto' | 'manual' | 'pending'
  logo_path?: string | null
}

export interface BrandVoice {
  id: string
  owner_id: string
  handle: string
  platform: Platform
  label: string | null
  profile: VoiceProfile | null
  brand_kit?: BrandKit | null
  // Platform aggregates captured during the handle scan (dashboard "your stats").
  stats?: { followers: number; videos: number; avg_views: number; avg_likes: number } | null
  status: 'building' | 'ready' | 'failed'
  is_default: boolean
  // 0103's per-brand defaults. Optional AND three-state inside: absent means the
  // column was not selected, `{}` means nothing was ever answered, and a key set
  // to null means that one question was skipped. None of them is `false`.
  default_capability_flags?: Record<string, boolean | null> | null
  // ⚠️ OPTIONAL, AND ABSENT IS NOT EMPTY. The column is not in every select, so
  // `undefined` means "not asked for" while `null` means "the creator has
  // answered nothing" — and `readStoredBrief` maps both to `{}` only because it
  // is the reader's job to collapse them, not the type's job to hide them.
  pre_script_brief?: Record<string, unknown> | null
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
    // THE MECHANISM, AS DATA (§5d). Optional because every blueprint generated
    // before this existed has none — and an absent mechanism must read as "we
    // never measured it", never as "this reference does not enumerate".
    // `readMechanism` degrades an absent one to not-enumerated, which withholds
    // the count check rather than failing a script against a number nobody
    // promised.
    mechanism?: unknown
  }
  // CONCEPT & ADAPTATION — the actual video idea for THIS creator, plus an honest
  // translation of the reference's production scale down to what one person with a
  // phone can shoot. Optional (older blueprints predate it).
  concept?: {
    premise: string // the core shootable video idea, 1-2 sentences, in their world
    your_scale: string // how one person with a phone gets the SAME effect
    translations: { theirs: string; yours: string }[] // ref element → achievable version
  }
  // PACKAGING — the title + thumbnail that earn the click, decided FIRST because
  // most short-form videos are won or lost on the title and first-frame thumbnail
  // before a word is heard. Optional so blueprints generated before this existed
  // still render (the Plan screen just hides the card when it's absent).
  packaging?: {
    titles: string[] // 3-5 scroll-stopping titles/headlines, best first
    thumbnail: {
      concept: string // one line: the single clear visual idea
      text_overlay: string // the 2-4 BIG words burned on the thumbnail
      expression: string // the creator's exact face/expression
      composition: string // subject placement, framing, props (phone-shootable)
      colors: string // colour treatment (uses the brand palette when set)
    }
  }
  b_roll_stats?: {
    original_b_roll_count: string
    suggested_b_roll_count: string
  }
  hook_options: string[]
  script: {
    section: string
    line: string
    direction: string
    /** THE PRE-SPLIT FIELD (§5c + §5d). Carried location, b-roll, edit intent
     *  and wardrobe at once. Kept because 39 generations in production hold 87
     *  of these strings and they cannot be split without inventing which half
     *  was the location — see `shotDirection.ts`. Not written for new beats. */
    background?: string
    /** Where the creator physically stands. Achievable direction only. */
    location?: string
    /** Footage to supply — gated on whether this creator can produce it. */
    broll_request?: string
    /** Cutaway/return timing, for the Edit Plan. Never a place to stand. */
    editor_intent?: string
    /** What the creator wears. §5d's fourth layer. */
    wardrobe?: string
    cuts_info?: string
    action_posing?: string
    /** ⚠️ THE ONE QUESTION THAT UNLOCKS THIS LINE, when the beat rests on
     *  something only this creator knows. It is a QUESTION and never a spoken
     *  line: `generate-blueprint` used to assign the refusal straight into
     *  `line`, which is how "Only you can supply this" reached a real
     *  teleprompter as dialogue in three of six scenes. */
    ask?: string
    /** The full spoken line with exactly one `{answer}` slot, so the beat can be
     *  completed by one typed fact and no second model call. */
    line_scaffold?: string
  }[]
  shot_list: {
    shot: string
    framing: string
    notes: string
    shot_type?: 'talking_head' | 'b_roll' | 'cover_frame'
    b_roll_type?: 'stock' | 'replicate' | 'none'
    b_roll_visual?: string
    spoken_text?: string
  }[]
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
  // Creator's choices that drive the back half of the loop.
  selected_hook?: string | null // which of the 5 hooks to shoot (teleprompter + cover)
  /** 0134. HOW `selected_hook` got its value. `selected_hook` alone cannot say:
   *  the recommended hook is captured on load so the teleprompter has something
   *  to shoot, and 14 of 23 production rows equal option[0] and are therefore
   *  indistinguishable from that default. Only `source: 'creator'` is a
   *  preference. NULL predates the column — never "no choice was made". */
  hook_choice?: HookChoice | null
  edit_style?: string | null // LEGACY (old editor) — kept so stored rows still parse
  // The finished video MP4 + its cover JPEG (storage paths in the private `edits`
  // bucket; sign to display/play). Written by the old editor historically; the
  // rebuilt editor re-populates the same seam.
  edit_path?: string | null
  /** REFERENCE-1 (0110). Server-owned: did the blueprint read the actual video,
   *  or reason from the format pattern? NULL on generations predating the
   *  column — unknown, never "pattern". Read via `readReferenceAnalysis`. */
  reference_analysis?: unknown
  thumb_path?: string | null
  // On-demand AI cover image rendered from the packaging brief (private `edits`
  // bucket path; sign to display). Only set when the creator taps "Generate
  // thumbnail" — never auto-generated, so it costs nothing unless asked for.
  ai_thumb_path?: string | null
  // The raw recorded take in the private `takes` bucket (recording durability).
  take_path?: string | null
  edl_path?: string | null // LEGACY (old editor's Edit Decision List)
  approved?: boolean // agency: marked client-approved before record/post
  /** APPROVAL-1 (0111). WHICH output was approved, and when. NULL on approvals
   *  predating 0111 — approved-but-UNBOUND, never unapproved: those creators
   *  did approve something, and rewriting history to say otherwise would revoke
   *  a real client's real decision to make a new check pass. Server-write only
   *  (`set_generation_approval`); see `editor/approval.ts` for how the three
   *  states are read. */
  approved_output_asset_id?: string | null
  approved_edit_project_id?: string | null
  approved_at?: string | null
  // Client approval link (agency → client, login-free /review/:token).
  review_status?: 'none' | 'pending' | 'approved' | 'changes'
  review_note?: string | null
  /** When the review was answered. Distinct from `created_at` and from
   *  `approved_at`: a client can request CHANGES, which is a review that
   *  happened and an approval that did not. */
  reviewed_at?: string | null
  /** The recorded script, as persisted jsonb. Read through
   *  `recordingScriptApi` — which validates it against this generation before
   *  returning it — rather than off this field directly. `unknown` on purpose:
   *  a structured type here would invite a consumer to trust the shape without
   *  the ownership check. */
  scene_timeline?: unknown
  /** PER-VIDEO capability overrides. What is true of THIS video wins over the
   *  brand's defaults (`brand_voices.default_capability_flags`). Read via
   *  `resolveCapabilitiesFor`; `unknown` for the same reason as
   *  `scene_timeline`. */
  capability_flags?: unknown
  /** Which brand voice this was made for. The server resolves approval policy
   *  and the brand snapshot through it. */
  brand_voice_id?: string | null
  created_at: string
}

