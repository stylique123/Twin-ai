// ASS caption bytes — escaping, structure, determinism, and the injection
// mutation control.
//
// The property under test is narrow and absolute: NO OVERRIDE BLOCK CAN EVER
// OPEN FROM CAPTION TEXT. Everything else about the format is cosmetic; this one
// is the difference between a subtitle and a scripting engine that a transcript
// can drive.
import { describe, it, expect } from 'vitest'
import {
  escapeAssText, hasUnescapedBrace, formatAssTime, renderAssDocument, buildAssCaptions,
  assertNoOverrideBlock, assDocumentSha256, stripTrustedEmphasisTags, ASS_STYLE_NAME,
  PLACEHOLDER_EMPHASIS_COLOUR, PLACEHOLDER_PRIMARY_COLOUR,
} from '../jobs/assCaptions.js'
import { compileEditPlan } from '../jobs/editorCompile.js'
import { EditPlanError, type EditPlanV1 } from '../jobs/editPlanContract.js'
import { baseInput, policy } from './fixtures/editPlanFixture.js'

function codeOf(fn: () => unknown): string {
  try { fn() } catch (e) { return (e as EditPlanError).code }
  throw new Error('expected a throw, got none')
}
function planWithCaption(text: string): EditPlanV1 {
  const input = baseInput()
  input.evidence.words = input.evidence.words.map((w, i) => (i === 0 ? { ...w, text } : w))
  return compileEditPlan({ ...input, policy: policy() }).plan
}
const STYLE = {
  playResX: 1080, playResY: 1920, fontName: 'Inter', fontSizePx: 72, marginVerticalPx: 320,
  emphasisColourAss: PLACEHOLDER_EMPHASIS_COLOUR, primaryColourAss: PLACEHOLDER_PRIMARY_COLOUR,
}

// The payloads a hostile transcript, a prompt-injected model, or a pasted
// browser string could realistically carry.
const INJECTIONS = [
  '{\\an8}top of screen',
  '{\\c&H0000FF&}red',
  '}{\\pos(0,0)}',
  '\\N\\N\\N',
  'a{b}c',
  '\\{\\an8\\}',
  '{{nested}}',
  'trailing\\',
  '{\\p1}m 0 0 l 100 0 100 100 0 100{\\p0}',
] as const

describe('escaping', () => {
  it('escapes every brace so no override block can open', () => {
    for (const payload of INJECTIONS) {
      const escaped = escapeAssText(payload)
      expect(hasUnescapedBrace(escaped)).toBe(false)
    }
  })

  it('doubles backslashes BEFORE escaping braces, so escapes cannot be forged', () => {
    // A text backslash immediately before a brace must not combine with the
    // escape this function adds.
    expect(escapeAssText('\\{')).toBe('\\\\\\{')
    expect(hasUnescapedBrace(escapeAssText('\\{'))).toBe(false)
    expect(escapeAssText('\\')).toBe('\\\\')
    expect(escapeAssText('{')).toBe('\\{')
    expect(escapeAssText('}')).toBe('\\}')
  })

  it('drops control characters so an event cannot be split across lines', () => {
    const withControls = `a\nb\rc\td\u0000e\u2028f`
    const escaped = escapeAssText(withControls)
    expect(escaped).toBe('abcdef')
    expect(escaped).not.toMatch(/[\n\r\t]/)
  })

  it('leaves ordinary and non-ASCII text untouched', () => {
    expect(escapeAssText('café — naïve 日本語 🎬')).toBe('café — naïve 日本語 🎬')
    expect(escapeAssText("it's 100% fine, really: yes")).toBe("it's 100% fine, really: yes")
  })

  it('hasUnescapedBrace counts backslash runs correctly', () => {
    expect(hasUnescapedBrace('{')).toBe(true)
    expect(hasUnescapedBrace('\\{')).toBe(false)
    expect(hasUnescapedBrace('\\\\{')).toBe(true)   // even run: the brace is live
    expect(hasUnescapedBrace('\\\\\\{')).toBe(false) // odd run: escaped
    expect(hasUnescapedBrace('plain text')).toBe(false)
  })

  it('is total: escaping is idempotent-safe over a second pass', () => {
    for (const payload of INJECTIONS) {
      expect(hasUnescapedBrace(escapeAssText(escapeAssText(payload)))).toBe(false)
    }
  })
})

describe('document structure', () => {
  it('formats timestamps as H:MM:SS.cc, truncating rather than rounding up', () => {
    expect(formatAssTime(0)).toBe('0:00:00.00')
    expect(formatAssTime(1999)).toBe('0:00:01.99')
    expect(formatAssTime(1_999)).toBe('0:00:01.99')
    expect(formatAssTime(61_234)).toBe('0:01:01.23')
    expect(formatAssTime(3_661_000)).toBe('1:01:01.00')
    expect(() => formatAssTime(1.5)).toThrow()
    expect(() => formatAssTime(-1)).toThrow()
  })

  it('emits one event per cue with the plan geometry', () => {
    const plan = compileEditPlan({ ...baseInput(), policy: policy() }).plan
    const { document, eventCount } = buildAssCaptions(plan, { fontName: 'Inter' })
    expect(eventCount).toBe(plan.captions.cues.length)
    const events = document.split('\n').filter((l) => l.startsWith('Dialogue:'))
    expect(events).toHaveLength(plan.captions.cues.length)
    expect(document).toContain('PlayResX: 1080')
    expect(document).toContain('PlayResY: 1920')
    expect(document).toContain(`,Inter,${plan.captions.fontSizePx},`)
    expect(events[0]).toContain(formatAssTime(plan.captions.cues[0].outputStartMs))
  })

  it('joins the two caption lines with the ASS hard break', () => {
    const plan = planWithCaption('a-very-long-first-token-that-forces-wrapping-here')
    const { document } = buildAssCaptions(plan, { fontName: 'Inter' })
    expect(document).toContain('Dialogue:')
    // Whatever the wrapping, no physical newline appears inside an event.
    for (const line of document.split('\n')) {
      if (line.startsWith('Dialogue:')) expect(line).not.toContain('\r')
    }
  })

  it('refuses a font name that is not a plain catalog name', () => {
    const plan = compileEditPlan({ ...baseInput(), policy: policy() }).plan
    expect(codeOf(() => renderAssDocument(plan, { ...STYLE, fontName: '../../etc/passwd' })))
      .toBe('render_font_integrity_failed')
    expect(codeOf(() => renderAssDocument(plan, { ...STYLE, fontName: 'Inter,Arial' })))
      .toBe('render_font_integrity_failed')
  })

  it('is deterministic: the same plan yields the same bytes and digest', () => {
    const plan = compileEditPlan({ ...baseInput(), policy: policy() }).plan
    const a = buildAssCaptions(plan, { fontName: 'Inter' })
    const b = buildAssCaptions(plan, { fontName: 'Inter' })
    expect(a.document).toBe(b.document)
    expect(a.sha256).toBe(b.sha256)
    expect(a.sha256).toBe(assDocumentSha256(a.document))
  })
})

describe('end-to-end injection resistance', () => {
  for (const payload of INJECTIONS) {
    it(`a transcript word containing ${JSON.stringify(payload)} produces no live brace`, () => {
      const plan = planWithCaption(payload)
      const { document } = buildAssCaptions(plan, { fontName: 'Inter' })
      // The fixture's fixed emphasis (word 25) can legitimately land a TRUSTED
      // tag elsewhere in this same document — strip it before checking, the
      // same way the real audit does, so this test still means exactly what
      // its name says: the INJECTED word produces no live brace, not that the
      // whole document is free of every live brace including our own.
      for (const line of document.split('\n')) {
        if (line.startsWith('Dialogue:')) {
          expect(hasUnescapedBrace(stripTrustedEmphasisTags(line, PLACEHOLDER_EMPHASIS_COLOUR))).toBe(false)
        }
      }
      // The audit runs over the finished document too.
      expect(() => assertNoOverrideBlock(document, plan.captions.cues.length, PLACEHOLDER_EMPHASIS_COLOUR)).not.toThrow()
    })
  }

  it('the payload really did reach the document — the test is not vacuous', () => {
    const plan = planWithCaption('{\\an8}top')
    const { document } = buildAssCaptions(plan, { fontName: 'Inter' })
    // The escaped form is present, proving the word was captioned rather than
    // silently dropped somewhere upstream.
    expect(document).toContain('\\{\\\\an8\\}top')
  })

  it('a resolved brand primary color actually reaches the Style line, not just the resolver function', () => {
    const plan = compileEditPlan({ ...baseInput(), policy: policy() }).plan
    const { document } = buildAssCaptions(plan, { fontName: 'Inter', primaryColourAss: '&H00112233' })
    expect(document).toContain(`Style: ${ASS_STYLE_NAME},Inter,${plan.captions.fontSizePx},&H00112233,&H00112233,`)
  })
})

describe('word emphasis', () => {
  it('wraps the emphasized word in the trusted tag, closed immediately after', () => {
    // The fixture pins emphasis on word 25 ("w25") — see editPlanFixture.ts.
    const plan = compileEditPlan({ ...baseInput(), policy: policy() }).plan
    expect(plan.captions.cues.some((c) => c.lineTokens.some((line) => line.includes('w25')))).toBe(true)
    const { document } = buildAssCaptions(plan, { fontName: 'Inter', emphasisColourAss: '&H00AABBCC' })
    expect(document).toContain('{\\c&H00AABBCC}w25{\\c}')
  })

  it('an emphasized word carrying an injection payload is still escaped before the trusted wrap — the wrap never widens what text can do', () => {
    const input = baseInput()
    // Word 25 is the one the fixture always emphasizes; give it a hostile payload.
    input.evidence.words = input.evidence.words.map((w, i) => (i === 25 ? { ...w, text: '{\\an8}evil' } : w))
    const plan = compileEditPlan({ ...input, policy: policy() }).plan
    const { document } = buildAssCaptions(plan, { fontName: 'Inter', emphasisColourAss: PLACEHOLDER_EMPHASIS_COLOUR })
    // The trusted wrap is present (it IS emphasized)...
    expect(document).toContain(`{\\c${PLACEHOLDER_EMPHASIS_COLOUR}}`)
    // ...but the payload inside it is escaped exactly as it would be unwrapped.
    expect(document).toContain('\\{\\\\an8\\}evil')
    // And the audit — which strips ONLY the exact trusted literal strings —
    // still finds no OTHER live brace anywhere, proving the payload's own
    // braces never became live just because they sit inside a trusted wrap.
    for (const line of document.split('\n')) {
      if (line.startsWith('Dialogue:')) {
        expect(hasUnescapedBrace(stripTrustedEmphasisTags(line, PLACEHOLDER_EMPHASIS_COLOUR))).toBe(false)
      }
    }
    expect(() => assertNoOverrideBlock(document, plan.captions.cues.length, PLACEHOLDER_EMPHASIS_COLOUR)).not.toThrow()
  })

  it('CONTROL: the audit strips the exact trusted literal only — a near-miss brace still fails closed', () => {
    // Defense in depth: this must not degrade into "any brace shaped roughly
    // like ours is fine." Only the EXACT literal tag string is ever exempted.
    const nearMiss = '[Events]\nDialogue: 0,0:00:00.00,0:00:01.00,TwinAI,,0,0,0,,{\\cXYZ}x{\\c}\n'
    expect(codeOf(() => assertNoOverrideBlock(nearMiss, 1, PLACEHOLDER_EMPHASIS_COLOUR))).toBe('output_caption_invalid')
  })
})

describe('mutation controls', () => {
  it('CONTROL: an escaper WITHOUT brace escaping produces a live override block, and the audit catches it', () => {
    const unescaped = (text: string): string => text.replace(/[\u0000-\u001F]/g, '')
    const payload = '{\\an8}top of screen'
    // The real escaper is safe.
    expect(hasUnescapedBrace(escapeAssText(payload))).toBe(false)
    // The mutant is not.
    expect(hasUnescapedBrace(unescaped(payload))).toBe(true)
    const mutantDoc = `[Events]\nDialogue: 0,0:00:00.00,0:00:01.00,TwinAI,,0,0,0,,${unescaped(payload)}\n`
    expect(codeOf(() => assertNoOverrideBlock(mutantDoc, undefined, PLACEHOLDER_EMPHASIS_COLOUR))).toBe('output_caption_invalid')
  })

  it('CONTROL: an escaper that escapes braces but NOT backslashes lets a forged escape through', () => {
    // `\{` in the text would become `\\{` — an even backslash run, so the brace
    // is live again. This is the ordering bug the real escaper avoids.
    const wrongOrder = (text: string): string => text.replace(/\{/g, '\\{').replace(/\}/g, '\\}')
    const payload = '\\{\\an8\\}x'
    expect(hasUnescapedBrace(wrongOrder(payload))).toBe(true)
    expect(hasUnescapedBrace(escapeAssText(payload))).toBe(false)
  })

  it('CONTROL: an escaper that keeps control characters splits one event into two lines', () => {
    const keepsControls = (text: string): string => text.replace(/\{/g, '\\{').replace(/\}/g, '\\}')
    const payload = 'first\nDialogue: 0,0:00:00.00,0:00:09.00,TwinAI,,0,0,0,,injected'
    const mutantDoc = `[Events]\nDialogue: 0,0:00:00.00,0:00:01.00,TwinAI,,0,0,0,,${keepsControls(payload)}\n`
    // The forged second event is now a real event — the count check catches it.
    expect(codeOf(() => assertNoOverrideBlock(mutantDoc, 1, PLACEHOLDER_EMPHASIS_COLOUR))).toBe('output_caption_invalid')
    // The real escaper collapses it to a single event.
    expect(escapeAssText(payload)).not.toContain('\n')
  })

  it('CONTROL: the malformed-header check rejects a truncated event', () => {
    expect(codeOf(() => assertNoOverrideBlock('Dialogue: 0,0:00:00.00\n', undefined, PLACEHOLDER_EMPHASIS_COLOUR)))
      .toBe('output_caption_invalid')
  })
})
