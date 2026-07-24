// Editor v2 — bounded Brand snapshot (Constitution §5.3 / §10B).
//
// The editor may consume ONLY this normalized projection — never the raw
// brand_voices.profile JSON. Free text is length/element-bounded and NFC-normalized
// (untrusted context, never interpreted downstream); colors are validated hex; the
// caption preset id comes from the frozen catalog. The worker computes
// brandSnapshotSha = sha256(canonicalJson(snapshot)) and pins it in the Boot Manifest.
//
// v3 — HONEST AWARENESS. The snapshot reads the REAL stored brand_kit shape (colors
// under `palette`, the logo as a storage `logo_path`, caption style as free text) AND
// tells the editor exactly what it has: `colorsSource` is 'manual' | 'auto' | 'none'
// and `logoSource` is 'verified' | 'none'. Twin NEVER invents a brand it cannot
// confirm — a scan-blocked ('pending') palette, an absent palette, or an unverified
// logo all resolve to `none` with null values, so downstream (director/renderer) can
// never treat an absent brand element as if it existed.
import { CAPTION_PRESET_IDS, type CaptionPresetId } from './catalogs'

export const BRAND_SNAPSHOT_SCHEMA_VERSION = 3

// Bounds (frozen). Keep the snapshot small so it fits the envelope summary cap.
const MAX_TOKENS = 12
const MAX_TOKEN_CHARS = 48
const TONE_MAX_CHARS = 48
const MAX_PATH_CHARS = 512
const HEX_RE = /^#[0-9a-fA-F]{6}$/
const SHA256_RE = /^[0-9a-f]{64}$/

export type BrandPacing = 'calm' | 'balanced' | 'punchy'
export type ColorsSource = 'manual' | 'auto' | 'none'
export type LogoSource = 'verified' | 'none'

export interface EditorBrandSnapshotV1 {
  schemaVersion: 3
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
    colorsSource: ColorsSource
    logoPath: string | null
    logoSha256: string | null
    logoSource: LogoSource
    captionPresetId: CaptionPresetId
  }
}

// A logo the CALLER has already verified: the storage object is owned by the creator,
// exists, and has been content-checksummed. Only such a logo may appear in the snapshot.
export interface VerifiedLogo {
  path: string
  sha256: string
}
function logoFields(v: VerifiedLogo | null | undefined): { logoPath: string | null; logoSha256: string | null; logoSource: LogoSource } {
  if (v && typeof v.path === 'string' && v.path.length > 0 && v.path.length <= MAX_PATH_CHARS
      && typeof v.sha256 === 'string' && SHA256_RE.test(v.sha256.toLowerCase())) {
    return { logoPath: v.path, logoSha256: v.sha256.toLowerCase(), logoSource: 'verified' }
  }
  return { logoPath: null, logoSha256: null, logoSource: 'none' }
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

// Deterministic caption-preset default from the caption/editing style + pacing. Unknown
// text never becomes a new preset — it falls back to the clean keyword preset.
function defaultCaptionPreset(styleText: string, pacing: BrandPacing): CaptionPresetId {
  const t = styleText.toLowerCase()
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
// The REAL stored brand_kit shape (written by Settings, dna-poll, scrapeDna): colors
// live under `palette` with a `palette_source`, the logo is a storage `logo_path`, and
// the caption style is free text under `caption_style`.
export interface RawBrandKitLike {
  palette?: { primary?: unknown; secondary?: unknown; highlight?: unknown } | null
  palette_source?: unknown
  logo_path?: unknown
  caption_style?: unknown
  caption_preset_id?: unknown
}

// Project the raw brand voice profile (+ optional brand kit + caller-verified logo)
// into the bounded snapshot. Pure + deterministic. Missing/absent brand → safe
// defaults with explicit 'none' sources (a valid snapshot always results, so a project
// without a brand still edits cleanly — with nothing invented).
export function projectBrandSnapshot(
  profile: RawBrandProfileLike | null | undefined,
  kit?: RawBrandKitLike | null,
  verifiedLogo?: VerifiedLogo | null,
): EditorBrandSnapshotV1 {
  const p = profile ?? {}
  const editingStyle = nfc(p.editing_style, TONE_MAX_CHARS)
  const pacing = normalizePacing(p.pacing ?? p.tone)

  // Colors: read the palette, validate as hex, and record whether they are confirmed
  // (hand-set or auto-learned) or absent. A scan-blocked ('pending') palette is never
  // treated as present.
  const palette = kit?.palette && typeof kit.palette === 'object' ? kit.palette : null
  const pHex = hex(palette?.primary), sHex = hex(palette?.secondary), hHex = hex(palette?.highlight)
  const anyColor = pHex ?? sHex ?? hHex
  const rawSrc = typeof kit?.palette_source === 'string' ? kit.palette_source : undefined
  const colorsSource: ColorsSource = anyColor && rawSrc !== 'pending' ? (rawSrc === 'manual' ? 'manual' : 'auto') : 'none'
  const emitColors = colorsSource !== 'none'

  // Caption: prefer an exact catalog id; else derive deterministically from the kit's
  // caption_style text (or the editing style), never inventing a new preset.
  const kitPreset = kit?.caption_preset_id
  const captionStyle = nfc(kit?.caption_style, TONE_MAX_CHARS) || editingStyle
  const captionPresetId: CaptionPresetId =
    typeof kitPreset === 'string' && (CAPTION_PRESET_IDS as readonly string[]).includes(kitPreset)
      ? (kitPreset as CaptionPresetId)
      : defaultCaptionPreset(captionStyle, pacing)

  const logo = logoFields(verifiedLogo)
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
      primaryHex: emitColors ? pHex : null,
      secondaryHex: emitColors ? sHex : null,
      highlightHex: emitColors ? hHex : null,
      colorsSource,
      logoPath: logo.logoPath,
      logoSha256: logo.logoSha256,
      logoSource: logo.logoSource,
      captionPresetId,
    },
  }
}
