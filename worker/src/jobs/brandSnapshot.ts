// Editor v2 — worker-local duplicate of the bounded Brand snapshot projection
// (packages/shared/src/editor/brandSnapshot.ts). The worker has no @twinai/shared
// runtime dep, so — like captureContract.ts / directorContract.ts — it mirrors
// the pure projection here; a parity test pins byte equality. Used by
// buildBootManifest to pin brandSnapshotSha.
import { canonicalJson, sha256Hex } from './editorManifest.js'

export const BRAND_SNAPSHOT_SCHEMA_VERSION = 3
const MAX_TOKENS = 12
const MAX_TOKEN_CHARS = 48
const TONE_MAX_CHARS = 48
const MAX_PATH_CHARS = 512
const HEX_RE = /^#[0-9a-fA-F]{6}$/
const SHA256_RE = /^[0-9a-f]{64}$/

// Frozen catalog (mirror of shared catalogs.ts CAPTION_PRESET_IDS).
export const CAPTION_PRESET_IDS = ['caption-clean-keyword-v1', 'caption-punchy-word-v1', 'caption-minimal-subtitle-v1'] as const

export type BrandPacing = 'calm' | 'balanced' | 'punchy'
export type ColorsSource = 'manual' | 'auto' | 'none'
export type LogoSource = 'verified' | 'none'
export interface EditorBrandSnapshotV1 {
  schemaVersion: 3
  voice: { tone: string; pacing: BrandPacing; hookStyle: string; editingStyle: string; doTokens: string[]; dontTokens: string[] }
  visual: { primaryHex: string | null; secondaryHex: string | null; highlightHex: string | null; colorsSource: ColorsSource; logoPath: string | null; logoSha256: string | null; logoSource: LogoSource; captionPresetId: string }
}
export interface VerifiedLogo { path: string; sha256: string }
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
function normalizePacing(raw: unknown): BrandPacing {
  const t = typeof raw === 'string' ? raw.toLowerCase() : ''
  if (/(calm|slow|relaxed|measured|soothing)/.test(t)) return 'calm'
  if (/(punchy|fast|energetic|snappy|high[- ]?energy|rapid)/.test(t)) return 'punchy'
  return 'balanced'
}
function defaultCaptionPreset(styleText: string, pacing: BrandPacing): string {
  const t = styleText.toLowerCase()
  if (/(minimal|subtitle|clean lower|documentary)/.test(t)) return 'caption-minimal-subtitle-v1'
  if (pacing === 'punchy' || /(punchy|word[- ]?by[- ]?word|hormozi|karaoke)/.test(t)) return 'caption-punchy-word-v1'
  return 'caption-clean-keyword-v1'
}

export interface RawBrandProfileLike { tone?: unknown; pacing?: unknown; hook_style?: unknown; editing_style?: unknown; dos?: unknown; donts?: unknown }
export interface RawBrandKitLike { palette?: { primary?: unknown; secondary?: unknown; highlight?: unknown } | null; palette_source?: unknown; logo_path?: unknown; caption_style?: unknown; caption_preset_id?: unknown }

export function projectBrandSnapshot(profile: RawBrandProfileLike | null | undefined, kit?: RawBrandKitLike | null, verifiedLogo?: VerifiedLogo | null): EditorBrandSnapshotV1 {
  const p = profile ?? {}
  const editingStyle = nfc(p.editing_style, TONE_MAX_CHARS)
  const pacing = normalizePacing(p.pacing ?? p.tone)
  const palette = kit?.palette && typeof kit.palette === 'object' ? kit.palette : null
  const pHex = hex(palette?.primary), sHex = hex(palette?.secondary), hHex = hex(palette?.highlight)
  const anyColor = pHex ?? sHex ?? hHex
  const rawSrc = typeof kit?.palette_source === 'string' ? kit.palette_source : undefined
  // ── AN AUTO GREYSCALE PALETTE IS THE ABSENCE OF EVIDENCE ────────────────
  //
  // ⚠️ THE SHARED COPY IS THE ORIGINAL AND THIS ONE IS EXECUTED BY THE PARITY
  // TEST, WHICH IS HOW I FOUND OUT. I changed the rule in
  // `packages/shared/src/editor/brandSnapshot.ts` and left this untouched; the
  // two projections then disagreed byte-for-byte on the same input, and the
  // editor reads THIS one. Any change to one must be made to the other.
  //
  // ⚖️ AUTO ONLY, AND ONLY WHEN NOTHING SURVIVES. A creator who chooses black
  // and white has chosen it, and a palette carrying one real hue beside black
  // and white is a real reading. This refuses a guess, never an assertion.
  const achromatic = (h: string | null): boolean => {
    if (!h) return true
    const m = /^#?([0-9a-f]{6})$/i.exec(h.trim())
    if (!m) return true
    const n = parseInt(m[1], 16)
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
    return Math.max(r, g, b) - Math.min(r, g, b) <= 12
  }
  const onlyGreys = achromatic(pHex) && achromatic(sHex) && achromatic(hHex)
  const autoAndContentless = rawSrc !== 'manual' && onlyGreys
  const colorsSource: ColorsSource = anyColor && rawSrc !== 'pending' && !autoAndContentless
    ? (rawSrc === 'manual' ? 'manual' : 'auto')
    : 'none'
  const emitColors = colorsSource !== 'none'
  const kitPreset = kit?.caption_preset_id
  const captionStyle = nfc(kit?.caption_style, TONE_MAX_CHARS) || editingStyle
  const captionPresetId = typeof kitPreset === 'string' && (CAPTION_PRESET_IDS as readonly string[]).includes(kitPreset)
    ? kitPreset
    : defaultCaptionPreset(captionStyle, pacing)
  const logo = logoFields(verifiedLogo)
  return {
    schemaVersion: BRAND_SNAPSHOT_SCHEMA_VERSION,
    voice: {
      tone: nfc(p.tone, TONE_MAX_CHARS), pacing, hookStyle: nfc(p.hook_style, TONE_MAX_CHARS),
      editingStyle, doTokens: tokens(p.dos), dontTokens: tokens(p.donts),
    },
    visual: {
      primaryHex: emitColors ? pHex : null, secondaryHex: emitColors ? sHex : null, highlightHex: emitColors ? hHex : null,
      colorsSource,
      logoPath: logo.logoPath, logoSha256: logo.logoSha256, logoSource: logo.logoSource,
      captionPresetId,
    },
  }
}

export function brandSnapshotSha256(snapshot: EditorBrandSnapshotV1): string {
  return sha256Hex(canonicalJson(snapshot))
}
