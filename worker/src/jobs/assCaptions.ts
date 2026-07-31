// Editor v2 — Phase 8 Batch 8.1: EditPlan cues -> ASS subtitle bytes.
//
// SOLE RESPONSIBILITY (Gate-0 §7): plan cues to ASS bytes. Pure; no file is read
// or written here, no font is loaded, no process is started. The caller decides
// where the bytes go.
//
// THE SECURITY PROPERTY. Caption text is the one place in the plan where free
// text sourced from a transcript is allowed, and a transcript is model output
// over creator speech. ASS is a scripting format: `{...}` is an override block
// that can restyle, reposition, or animate anything on screen. So the single
// invariant this file must guarantee is:
//
//     NO OVERRIDE BLOCK CAN EVER OPEN FROM CAPTION TEXT.
//
// An override block requires a `{`. Every `{` produced from text is emitted as
// `\{`, which libass renders as a literal brace, so no block opens; `}` is
// escaped symmetrically; a literal backslash is doubled; and every C0/C1 control
// character is dropped so a raw newline cannot break the one-line-per-event
// structure of the file. `assertNoOverrideBlock` re-checks the FINISHED document
// rather than trusting the escaper, and is exercised by a mutation control.
import { sha256Hex } from './editorManifest.js'
import { EditPlanError, type EditPlanV1, type PlanCue } from './editPlanContract.js'

export const ASS_SCRIPT_TYPE = 'v4.00+'
export const ASS_STYLE_NAME = 'TwinAI'
export const ASS_WRAP_STYLE = 2

// Control characters: C0 (0x00-0x1F), DEL (0x7F) and C1 (0x80-0x9F). Also the
// Unicode line/paragraph separators, which some renderers treat as line breaks.
const CONTROL_RE = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g

/**
 * Escape one run of caption text for an ASS dialogue event.
 *
 * Order matters: backslashes are doubled FIRST, so the backslashes this function
 * itself introduces when escaping braces are not doubled a second time.
 */
export function escapeAssText(text: string): string {
  return text
    .replace(CONTROL_RE, '')
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
}

/**
 * True when `s` contains a brace that could open or close an override block —
 * that is, a brace not immediately preceded by an escaping backslash. Used as an
 * independent audit of the finished document.
 */
export function hasUnescapedBrace(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch !== '{' && ch !== '}') continue
    // Count the run of backslashes immediately before this brace. An ODD run
    // means the final backslash escapes the brace; an even run (including zero)
    // means the brace is live.
    let slashes = 0
    let j = i - 1
    while (j >= 0 && s[j] === '\\') { slashes++; j-- }
    if (slashes % 2 === 0) return true
  }
  return false
}

export function formatAssTime(ms: number): string {
  if (!Number.isInteger(ms) || ms < 0) {
    throw new EditPlanError(`ass: time ${String(ms)} is not a non-negative integer millisecond value`, 'edit_plan_invalid')
  }
  // ASS timestamps are H:MM:SS.cc — centiseconds. Truncate rather than round so
  // a cue can never be extended past the output duration by formatting alone.
  const cs = Math.floor(ms / 10)
  const h = Math.floor(cs / 360000)
  const m = Math.floor((cs % 360000) / 6000)
  const s = Math.floor((cs % 6000) / 100)
  const c = cs % 100
  if (h > 9) throw new EditPlanError('ass: timestamp exceeds the single-digit hour field', 'edit_plan_invalid')
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`
}

export interface AssStyleOptions {
  playResX: number
  playResY: number
  fontName: string
  fontSizePx: number
  marginVerticalPx: number
  emphasisColourAss: string
  // The caption's own text color — brand-resolved-or-catalog-default is decided
  // by the caller (editorRenderStage.ts), never here; this file only ever
  // splices whatever it's given.
  primaryColourAss: string
}

// The ONLY live (unescaped) braces this file ever deliberately emits — the
// word-emphasis highlight. `emphasisColourAss` is validated below against a
// tight format before it can ever reach here, and it comes from the frozen
// render catalog, never from a transcript or any other free text. `{\c}` with
// no argument resets to the style's own PrimaryColour, closing the run.
const EMPHASIS_CLOSE = '{\\c}'
function emphasisOpen(emphasisColourAss: string): string {
  return `{\\c${emphasisColourAss}}`
}

// A code-authored literal string can only ever contain a BARE `{` or `}` if
// this module put it there — `escapeAssText` guarantees every brace that
// originates from text is escaped (preceded by a backslash) regardless of
// content, so a transcript can never forge a match against these exact
// strings. Removing every literal occurrence of the two trusted tags and then
// checking what's left for a live brace is therefore exact, not a heuristic:
// anything remaining live was not one of these two strings, and so was not
// this module's own doing.
export function stripTrustedEmphasisTags(text: string, emphasisColourAss: string): string {
  return text.split(emphasisOpen(emphasisColourAss)).join('').split(EMPHASIS_CLOSE).join('')
}

function dialogueLine(cue: PlanCue, emphasisColourAss: string): string {
  // Lines are joined with the ASS hard line break `\N`, which is produced HERE
  // and can never come from the text, because every backslash in text has
  // already been doubled. Reads `lineTokens` — the compiler's own per-token
  // breakdown — rather than splitting `cue.lines[j]` apart, because a single
  // token is not guaranteed free of internal whitespace and re-splitting could
  // misalign which run gets wrapped. Each token is escaped independently and
  // the emphasis wrap, when present, goes around the already-escaped token —
  // never inside unescaped text, and never sourced from it.
  const body = cue.lineTokens.map((tokens, j) => {
    const flags = cue.lineEmphasis[j] ?? []
    return tokens.map((tok, k) => {
      const escaped = escapeAssText(tok)
      return flags[k] ? `${emphasisOpen(emphasisColourAss)}${escaped}${EMPHASIS_CLOSE}` : escaped
    }).join(' ')
  }).join('\\N')
  return `Dialogue: 0,${formatAssTime(cue.outputStartMs)},${formatAssTime(cue.outputEndMs)},${ASS_STYLE_NAME},,0,0,0,,${body}`
}

export function renderAssDocument(plan: EditPlanV1, style: AssStyleOptions): string {
  if (!/^[A-Za-z0-9 ._-]{1,64}$/.test(style.fontName)) {
    throw new EditPlanError('ass: font name is not a plain catalog name', 'render_font_integrity_failed')
  }
  if (!/^&H[0-9A-Fa-f]{8}$/.test(style.emphasisColourAss)) {
    throw new EditPlanError('ass: emphasis colour is not a plain &HAABBGGRR value', 'render_font_integrity_failed')
  }
  if (!/^&H[0-9A-Fa-f]{8}$/.test(style.primaryColourAss)) {
    throw new EditPlanError('ass: primary colour is not a plain &HAABBGGRR value', 'render_font_integrity_failed')
  }
  const lines: string[] = [
    '[Script Info]',
    `ScriptType: ${ASS_SCRIPT_TYPE}`,
    `PlayResX: ${style.playResX}`,
    `PlayResY: ${style.playResY}`,
    `WrapStyle: ${ASS_WRAP_STYLE}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour,'
      + ' Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline,'
      + ' Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: ${ASS_STYLE_NAME},${style.fontName},${style.fontSizePx},${style.primaryColourAss},${style.primaryColourAss},&H00000000,`
      + `&H64000000,-1,0,0,0,100,100,0,0,1,4,0,2,40,40,${style.marginVerticalPx},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ]
  for (const cue of plan.captions.cues) lines.push(dialogueLine(cue, style.emphasisColourAss))
  const doc = `${lines.join('\n')}\n`
  assertNoOverrideBlock(doc, plan.captions.cues.length, style.emphasisColourAss)
  return doc
}

/**
 * Independent audit of a FINISHED document: no dialogue event may contain a
 * live brace OUTSIDE the exact, code-authored emphasis-tag pair this module
 * itself inserts, and no event may have been split across physical lines. This
 * does not trust `escapeAssText` OR `dialogueLine`; it is the guard the
 * mutation control removes. Stripping the trusted tags first (see
 * `stripTrustedEmphasisTags`) rather than loosening `hasUnescapedBrace` itself
 * keeps the escaper's own guarantee — no live brace from text, ever — completely
 * unchanged; this only ever whitelists two fixed literal strings this file
 * controls, never anything shaped by transcript content.
 */
export function assertNoOverrideBlock(doc: string, expectedEvents: number | undefined, emphasisColourAss: string): void {
  const physical = doc.split('\n')
  let events = 0
  for (const line of physical) {
    if (!line.startsWith('Dialogue:')) continue
    events++
    if (hasUnescapedBrace(stripTrustedEmphasisTags(line, emphasisColourAss))) {
      throw new EditPlanError('ass: dialogue event contains a live override block', 'output_caption_invalid')
    }
    // An ASS event has nine comma-separated header fields before the text, and
    // the text field is the remainder of the PHYSICAL line. Fewer commas means
    // the line is malformed; the check also proves no event was split by a
    // newline that survived escaping (a split tail would not start with
    // "Dialogue:" and so would carry no header at all).
    if (line.split(',').length < 10) {
      throw new EditPlanError('ass: malformed dialogue event header', 'output_caption_invalid')
    }
  }
  if (expectedEvents !== undefined && events !== expectedEvents) {
    throw new EditPlanError(
      `ass: emitted ${events} events for ${expectedEvents} cues`, 'output_caption_invalid')
  }
}

export function assDocumentSha256(doc: string): string {
  return sha256Hex(Buffer.from(doc, 'utf8'))
}

// Test/convenience wrapper — production always goes through
// `editorRenderStage.ts`, which passes the catalog's actual per-preset
// `emphasisColourAss`. The default here is an arbitrary valid placeholder, not
// a real design choice, so a caller that doesn't care about emphasis colors
// doesn't have to name one at every call site.
export const PLACEHOLDER_EMPHASIS_COLOUR = '&H00A6B814'
export const PLACEHOLDER_PRIMARY_COLOUR = '&H00FFFFFF'

export function buildAssCaptions(
  plan: EditPlanV1,
  opts: { fontName: string; emphasisColourAss?: string; primaryColourAss?: string },
): {
  document: string; sha256: string; eventCount: number
} {
  const document = renderAssDocument(plan, {
    playResX: plan.output.width,
    playResY: plan.output.height,
    fontName: opts.fontName,
    fontSizePx: plan.captions.fontSizePx,
    marginVerticalPx: plan.captions.marginVerticalPx,
    emphasisColourAss: opts.emphasisColourAss ?? PLACEHOLDER_EMPHASIS_COLOUR,
    primaryColourAss: opts.primaryColourAss ?? PLACEHOLDER_PRIMARY_COLOUR,
  })
  return { document, sha256: assDocumentSha256(document), eventCount: plan.captions.cues.length }
}
