// Brand caption color resolution — pure, no database, no storage, no process.
//
// This is its own file rather than living in editorRenderStage.ts (where the
// resolution is actually USED) because that file imports db.ts, which
// requires SUPABASE_URL at module load — dragging any test that merely wants
// this one pure decision into needing a live database env to even import it.
// Splitting it out means it can be unit tested directly, matching the same
// reasoning editorCompile.ts's own header gives for refusing DB/network
// imports: a file that stays pure stays trivially testable.
//
// WHY A BRAND COLOR IS NOT AUTOMATICALLY A USABLE CAPTION COLOR.
//
// A caption is drawn as a fill inside an outline, and every preset in the
// frozen catalog outlines in black. The outline is not decoration: it is the
// only thing that keeps text legible over footage whose brightness we do not
// control. So the fill has to be readable AGAINST THE OUTLINE — a dark navy
// brand color painted inside a black stroke is black-on-black, and the
// captions vanish for the length of the video.
//
// Brand colors are picked for logos on white backgrounds, so a good many of
// the palettes a scraper will find are too dark to survive this. Nothing
// upstream rejects them, because nothing upstream knows they will end up as
// burned-in text. This file is the last place that can know.
//
// The check is WCAG relative contrast at 3:1 — the AA threshold for large
// text, which burned-in captions (>= 48px, bold in two of the three presets)
// unambiguously are. Failing it does NOT fail the render: the catalog preset
// color is known-good, so a rejected brand color degrades to a legible video
// rather than to no video. What it must never do is degrade SILENTLY, so the
// rejection is returned as evidence and recorded by the caller.
export interface CaptionColourInputs {
  brandPrimaryColourAss: string | null
  brandHighlightColourAss: string | null
}
export interface CaptionColourPreset {
  primaryColourAss: string
  emphasisColourAss: string
  /** The stroke every catalog preset draws around the fill, and therefore the
   *  surface a brand color actually has to be readable against. */
  outlineColourAss: string
}

/** One brand color the guard refused, with the measurement that refused it.
 *  Milli-units to stay integer, matching scaleMilli / opacityMilli / the
 *  loudness overshoot elsewhere in the render path. */
export interface CaptionColourRejection {
  role: 'primary' | 'emphasis'
  colourAss: string
  /** Measured fill-vs-outline contrast, x1000. Null when the color could not
   *  be parsed at all, which is itself a reason to refuse it. */
  contrastRatioMilli: number | null
  minimumRatioMilli: number
}

export interface ResolvedCaptionColours {
  primaryColourAss: string
  emphasisColourAss: string
  /** Empty on the happy path. Non-empty means the video shipped with catalog
   *  colors where the owner expected their own, and the owner is entitled to
   *  be told why. */
  rejected: CaptionColourRejection[]
}

/** WCAG AA for large text. Burned-in captions are large text. */
export const MIN_CONTRAST_RATIO_MILLI = 3000

// &HAABBGGRR — alpha, then BLUE, GREEN, RED. The byte order runs backwards
// from every other color format in this codebase, which is exactly why it is
// parsed in one named place instead of inline at a call site.
const ASS_COLOUR_PARTS_RE = /^&H([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/

/** sRGB 8-bit channel -> linear light, per WCAG 2.x. */
function linearise(channel8: number): number {
  const s = channel8 / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance, or null if the string is not an ASS color.
 *  Exported for the tests, which pin the two anchors the whole scale rests
 *  on: white is 1 and black is 0. */
export function relativeLuminance(colourAss: string): number | null {
  const m = ASS_COLOUR_PARTS_RE.exec(colourAss)
  if (!m) return null
  const b = linearise(parseInt(m[2], 16))
  const g = linearise(parseInt(m[3], 16))
  const r = linearise(parseInt(m[4], 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * WCAG contrast ratio between two ASS colors, x1000, or null if either fails
 * to parse. Symmetric: the lighter color is always the numerator, so callers
 * do not have to know which of fill and outline is the brighter one.
 */
export function contrastRatioMilli(aAss: string, bAss: string): number | null {
  const la = relativeLuminance(aAss)
  const lb = relativeLuminance(bAss)
  if (la === null || lb === null) return null
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  // Truncate, never round up: a color that lands on the threshold only
  // because of a rounding step is a color we did not measure as passing.
  return Math.floor(((hi + 0.05) / (lo + 0.05)) * 1000)
}

/**
 * Brand color, if the owner has one pinned AND it is legible inside the
 * preset's outline, wins over the catalog's generic default. Highlight reuses
 * the SAME brand color as primary when only the primary is set, rather than
 * mixing a real brand color with a generic catalog accent that was never
 * meant to sit next to it.
 *
 * A brand color that fails the contrast guard drops back to the catalog value
 * for that role INDEPENDENTLY — a legible brand primary is still used when the
 * pinned highlight is unusable, and the other way round.
 */
export function resolveCaptionColours(
  captions: CaptionColourInputs,
  preset: CaptionColourPreset,
): ResolvedCaptionColours {
  const rejected: CaptionColourRejection[] = []

  /** Returns the candidate when it is legible against the outline, else null
   *  plus a recorded rejection. A null candidate means "nothing pinned",
   *  which is not a rejection and is not recorded. */
  const vet = (candidate: string | null, role: 'primary' | 'emphasis'): string | null => {
    if (candidate === null) return null
    const ratio = contrastRatioMilli(candidate, preset.outlineColourAss)
    if (ratio !== null && ratio >= MIN_CONTRAST_RATIO_MILLI) return candidate
    rejected.push({
      role,
      colourAss: candidate,
      contrastRatioMilli: ratio,
      minimumRatioMilli: MIN_CONTRAST_RATIO_MILLI,
    })
    return null
  }

  // Vet the primary ONCE and reuse the verdict for the emphasis fallback.
  // Vetting it a second time under the emphasis role would file one bad color
  // as two separate rejections and make a single mistake look like two.
  const primary = vet(captions.brandPrimaryColourAss, 'primary')
  const highlight = vet(captions.brandHighlightColourAss, 'emphasis')

  return {
    primaryColourAss: primary ?? preset.primaryColourAss,
    emphasisColourAss: highlight ?? primary ?? preset.emphasisColourAss,
    rejected,
  }
}
