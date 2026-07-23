// Editor v2 — bounded Brand snapshot (Constitution §5.3 / §10B).
//
// The editor may consume ONLY this normalized projection — never the raw
// brand_voices.profile JSON. Free text is length/element-bounded and
// NFC-normalized (untrusted context, never interpreted downstream); colors are
// validated hex; the caption preset id comes from the frozen catalog. Unknown
// text maps to `balanced`/clean defaults. The worker computes brandSnapshotSha
// = sha256(canonicalJson(snapshot)) and pins it in the Boot Manifest v2.
import { CAPTION_PRESET_IDS, type CaptionPresetId } from './catalogs'

export const BRAND_SNAPSHOT_SCHEMA_VERSION = 1

// Bounds (frozen). Keep the snapshot small so it fits the envelope summary cap.
const MAX_TOKENS = 12
const MAX_TOKEN_CHARS = 48
const TONE_MAX_CHARS = 48
const HEX_RE = /^#[0-9a-fA-F]{6}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export type BrandPacing = 'calm' | 'balanced' | 'punchy'

export interface EditorBrandSnapshotV1 {
  schemaVersion: 1
  voice: {
    tone: string
    pacing: BrandPacing
    hookStyle: string
    editingStyle: string
    doTokens: string[]
    dontTokens: string[]
  }
  visual: {
    primaryHex: string | null
    secondaryHex: string | null
    highlightHex: string | null
    logoAssetId: string | null
    captionPresetId: CaptionPresetId
  }
}

function nfc(s: unknown, maxChars: number): string {
  if (typeof s !== 'string') return ''
  return s.normalize('NFC').trim().slice(0, maxChars)
}
function tokens(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const el of v) {
    const t = nfc(el, MAX_TOKEN_CHARS)
    if (t) out.push(t)
    if (out.length >= MAX_TOKENS) break
  }
  return out
}
function hex(v: unknown): string | null {
  return typeof v === 'string' && HEX_RE.test(v) ? v.toLowerCase() : null
}

// Deterministic pacing normalization from the raw profile's pacing/tone text.
function normalizePacing(raw: unknown): BrandPacing {
  const t = typeof raw === 'string' ? raw.toLowerCase() : ''
  if (/(calm|slow|relaxed|measured|soothing)/.test(t)) return 'calm'
  if (/(punchy|fast|energetic|snappy|high[- ]?energy|rapid)/.test(t)) return 'punchy'
  return 'balanced'
}

// Deterministic caption-preset default from the editing style / pacing. Unknown
// text never becomes a new preset — it falls back to the clean keyword preset.
function defaultCaptionPreset(editingStyle: string, pacing: BrandPacing): CaptionPresetId {
  const t = editingStyle.toLowerCase()
  if (/(minimal|subtitle|clean lower|documentary)/.test(t)) return 'caption-minimal-subtitle-v1'
  if (pacing === 'punchy' || /(punchy|word[- ]?by[- ]?word|hormozi|karaoke)/.test(t)) return 'caption-punchy-word-v1'
  return 'caption-clean-keyword-v1'
}

export interface RawBrandProfileLike {
  tone?: unknown
  pacing?: unknown
  hook_style?: unknown
  editing_style?: unknown
  dos?: unknown
  donts?: unknown
}
export interface RawBrandKitLike {
  primary_hex?: unknown
  secondary_hex?: unknown
  highlight_hex?: unknown
  logo_asset_id?: unknown
  caption_preset_id?: unknown
}

// Project the raw brand voice profile (+ optional brand kit) into the bounded
// snapshot. Pure + deterministic. Missing/absent brand → safe defaults (a valid
// snapshot always results, so a project without a brand still edits cleanly).
export function projectBrandSnapshot(
  profile: RawBrandProfileLike | null | undefined,
  kit?: RawBrandKitLike | null,
): EditorBrandSnapshotV1 {
  const p = profile ?? {}
  const editingStyle = nfc(p.editing_style, TONE_MAX_CHARS)
  const pacing = normalizePacing(p.pacing ?? p.tone)
  const kitPreset = kit?.caption_preset_id
  const captionPresetId: CaptionPresetId =
    typeof kitPreset === 'string' && (CAPTION_PRESET_IDS as readonly string[]).includes(kitPreset)
      ? (kitPreset as CaptionPresetId)
      : defaultCaptionPreset(editingStyle, pacing)
  return {
    schemaVersion: BRAND_SNAPSHOT_SCHEMA_VERSION,
    voice: {
      tone: nfc(p.tone, TONE_MAX_CHARS),
      pacing,
      hookStyle: nfc(p.hook_style, TONE_MAX_CHARS),
      editingStyle,
      doTokens: tokens(p.dos),
      dontTokens: tokens(p.donts),
    },
    visual: {
      primaryHex: hex(kit?.primary_hex),
      secondaryHex: hex(kit?.secondary_hex),
      highlightHex: hex(kit?.highlight_hex),
      logoAssetId: typeof kit?.logo_asset_id === 'string' && UUID_RE.test(kit.logo_asset_id) ? kit.logo_asset_id : null,
      captionPresetId,
    },
  }
}
