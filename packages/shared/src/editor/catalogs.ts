// Editor v2 — frozen bounded preset catalogs (Constitution §10A / §10B).
//
// The Director model chooses only IDs/enums from THESE catalogs; code owns the
// definitions. Nothing here is free-form prompt output. Referenced by the brand
// snapshot (default derivation), the Director envelope (allowed catalogs), and
// Decision v2 (server re-resolution). Every list is FROZEN — changing one is a
// policy-version bump with regenerated goldens, never a silent edit.

export const CAPTION_PRESET_IDS = ['caption-clean-keyword-v1', 'caption-punchy-word-v1', 'caption-minimal-subtitle-v1'] as const
export const FRAMING_PRESET_IDS = ['frame-center-safe-v1', 'frame-face-follow-subtle-v1'] as const
export const ZOOM_PRESET_IDS = ['zoom-none-v1', 'zoom-subtle-v1', 'zoom-medium-v1'] as const
export const TRANSITION_PRESET_IDS = ['cuts-hard-v1', 'cuts-restrained-v1'] as const
export const AUDIO_PRESET_IDS = ['speech-clean-v1', 'speech-noisy-v1', 'speech-roomy-v1'] as const
export const HOOK_PRESET_IDS = ['hook-keep-v1', 'hook-trim-leading-waste-v1', 'hook-open-safe-boundary-v1'] as const
export const MUSIC_MOOD_IDS = ['warm', 'confident', 'energetic', 'reflective', 'neutral'] as const

// Decision v2 bounded enums.
export const PACING_MODES = ['calm', 'balanced', 'punchy'] as const
export const HOOK_TREATMENTS = ['keep_original', 'tighten_leading_pause', 'open_on_selected_boundary'] as const
export const ZOOM_INTENSITIES = ['subtle', 'medium'] as const
export const ZOOM_REASON_CODES = ['emphasis_word', 'scene_open', 'retention_beat'] as const
export const TRANSITION_POLICIES = ['hard_cuts_only', 'restrained'] as const
export const MUSIC_MODES = ['none', 'licensed_bed'] as const
export const MUSIC_ENERGIES = ['low', 'medium', 'high'] as const

// The one allowed output profile for this pipeline epoch.
export const OUTPUT_PROFILE_ID = 'vertical_social_1080x1920_h264_aac_v1'

export type CaptionPresetId = (typeof CAPTION_PRESET_IDS)[number]
export type MusicMoodId = (typeof MUSIC_MOOD_IDS)[number]
export type PacingMode = (typeof PACING_MODES)[number]
export type HookTreatment = (typeof HOOK_TREATMENTS)[number]
export type ZoomIntensity = (typeof ZOOM_INTENSITIES)[number]
export type ZoomReasonCode = (typeof ZOOM_REASON_CODES)[number]
export type TransitionPolicy = (typeof TRANSITION_POLICIES)[number]
export type MusicMode = (typeof MUSIC_MODES)[number]
export type MusicEnergy = (typeof MUSIC_ENERGIES)[number]

// The compact `catalogs` block the envelope carries so the model sees exactly
// the allowed choices (and nothing executable). Deterministic + bounded.
export function allowedCatalogs(): {
  captionPresets: readonly string[]
  framing: readonly string[]
  zoom: readonly string[]
  transitions: readonly string[]
  audio: readonly string[]
  hook: readonly string[]
  musicMoods: readonly string[]
  pacing: readonly string[]
  hookTreatments: readonly string[]
  zoomIntensities: readonly string[]
  zoomReasons: readonly string[]
  transitionPolicies: readonly string[]
  musicModes: readonly string[]
  musicEnergies: readonly string[]
  outputProfileId: string
} {
  return {
    captionPresets: CAPTION_PRESET_IDS,
    framing: FRAMING_PRESET_IDS,
    zoom: ZOOM_PRESET_IDS,
    transitions: TRANSITION_PRESET_IDS,
    audio: AUDIO_PRESET_IDS,
    hook: HOOK_PRESET_IDS,
    musicMoods: MUSIC_MOOD_IDS,
    pacing: PACING_MODES,
    hookTreatments: HOOK_TREATMENTS,
    zoomIntensities: ZOOM_INTENSITIES,
    zoomReasons: ZOOM_REASON_CODES,
    transitionPolicies: TRANSITION_POLICIES,
    musicModes: MUSIC_MODES,
    musicEnergies: MUSIC_ENERGIES,
    outputProfileId: OUTPUT_PROFILE_ID,
  }
}

export function isCaptionPreset(v: unknown): v is CaptionPresetId {
  return typeof v === 'string' && (CAPTION_PRESET_IDS as readonly string[]).includes(v)
}
export function isMusicMood(v: unknown): v is MusicMoodId {
  return typeof v === 'string' && (MUSIC_MOOD_IDS as readonly string[]).includes(v)
}
