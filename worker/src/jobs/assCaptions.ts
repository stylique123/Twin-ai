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
}

// GATE-0 AMENDMENT A2 — the CLOSED emphasis catalog.
//
// Emphasis in ASS requires an override tag, and the injection guard rejects every
// override block. Both halves were deliberate: the guard is what stops transcript
// text from reaching a tag. So emphasis gets a two-member vocabulary and nothing
// else — no colour, font, position, transform, karaoke or drawing mode.
//
// ONLY this file emits them, ONLY around a word whose index is in that cue's own
// emphasisWordIndices, and ALWAYS as a balanced pair. `escapeAssText` is
// unchanged, so a transcript word literally spelled "{\\b1}" still has its braces
// escaped before it reaches here and cannot become a tag.
export const ASS_EMPHASIS_OPEN = '{\\b1}'
export const ASS_EMPHASIS_CLOSE = '{\\b0}'
export const ASS_EMPHASIS_TAGS = [ASS_EMPHASIS_OPEN, ASS_EMPHASIS_CLOSE] as const

/**
 * Remove EXACT catalog members, and nothing else, returning the remainder plus a
 * count of what was removed. The ONE definition of "which braces are permitted",
 * shared by the guard and its tests so the audit and its proof cannot disagree.
 */
export function stripCatalogTags(s: string): { rest: string; tags: number } {
  let rest = s
  let tags = 0
  for (const tag of ASS_EMPHASIS_TAGS) {
    tags += rest.split(tag).length - 1
    rest = rest.split(tag).join('')
  }
  return { rest, tags }
}

function dialogueLine(cue: PlanCue): string {
  // The cue's wordIndices are parallel to the words its lines display, in order,
  // so emphasis is applied POSITIONALLY rather than by matching text — the same
  // reason the removed-word guard uses provenance.
  const emphasised = new Set(cue.emphasisWordIndices)
  let w = 0
  const rendered = cue.lines.map((line) => line.split(' ').map((token) => {
    const idx = cue.wordIndices[w]
    w++
    const esc = escapeAssText(token)
    return emphasised.has(idx) ? `${ASS_EMPHASIS_OPEN}${esc}${ASS_EMPHASIS_CLOSE}` : esc
  }).join(' '))
  // Lines are joined with the ASS hard line break `\N`, which is produced HERE
  // and can never come from the text, because every backslash in text has
  // already been doubled.
  const body = rendered.join('\\N')
  return `Dialogue: 0,${formatAssTime(cue.outputStartMs)},${formatAssTime(cue.outputEndMs)},${ASS_STYLE_NAME},,0,0,0,,${body}`
}

export function renderAssDocument(plan: EditPlanV1, style: AssStyleOptions): string {
  if (!/^[A-Za-z0-9 ._-]{1,64}$/.test(style.fontName)) {
    throw new EditPlanError('ass: font name is not a plain catalog name', 'render_font_integrity_failed')
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
    `Style: ${ASS_STYLE_NAME},${style.fontName},${style.fontSizePx},&H00FFFFFF,&H00FFFFFF,&H00000000,`
      + `&H64000000,-1,0,0,0,100,100,0,0,1,4,0,2,40,40,${style.marginVerticalPx},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ]
  for (const cue of plan.captions.cues) lines.push(dialogueLine(cue))
  const doc = `${lines.join('\n')}\n`
  const emphasisCount = plan.captions.cues.reduce((n, c) => n + c.emphasisWordIndices.length, 0)
  assertNoOverrideBlock(doc, plan.captions.cues.length, emphasisCount)
  return doc
}

/**
 * Independent audit of a FINISHED document: no dialogue event may contain a live
 * brace, and no event may have been split across physical lines. This does not
 * trust `escapeAssText`; it is the guard the mutation control removes.
 */
export function assertNoOverrideBlock(doc: string, expectedEvents?: number, expectedTags = 0): void {
  const physical = doc.split('\n')
  let events = 0
  let tags = 0
  for (const line of physical) {
    if (!line.startsWith('Dialogue:')) continue
    events++
    // AMENDMENT A2. Catalog members are removed before the live-brace audit, so
    // the audit itself is unchanged in strength: anything that still looks like an
    // override block after the catalog is stripped is rejected exactly as before.
    const stripped = stripCatalogTags(line)
    tags += stripped.tags
    if (hasUnescapedBrace(stripped.rest)) {
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
  // Balanced-pair count. An emphasised word contributes exactly one open and one
  // close, so any extra, missing or unpaired tag — whether from a compiler bug or
  // a tampered document — fails closed rather than rendering something the plan
  // did not describe.
  if (tags !== expectedTags * 2) {
    throw new EditPlanError(
      `ass: ${tags} emphasis tags for ${expectedTags} emphasised words`, 'output_caption_invalid')
  }
}

export function assDocumentSha256(doc: string): string {
  return sha256Hex(Buffer.from(doc, 'utf8'))
}

export function buildAssCaptions(plan: EditPlanV1, opts: { fontName: string }): {
  document: string; sha256: string; eventCount: number
} {
  const document = renderAssDocument(plan, {
    playResX: plan.output.width,
    playResY: plan.output.height,
    fontName: opts.fontName,
    fontSizePx: plan.captions.fontSizePx,
    marginVerticalPx: plan.captions.marginVerticalPx,
  })
  return { document, sha256: assDocumentSha256(document), eventCount: plan.captions.cues.length }
}
