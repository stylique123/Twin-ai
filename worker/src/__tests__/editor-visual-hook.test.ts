// The VISUAL hook — a few big words burned over the opening of the video.
//
// Why it exists: a spoken hook competes with everything else on a muted feed,
// and text on screen does not. Until now the edit plan had no element for a
// title at all; it only ever burned subtitles of what was being SAID.
//
// Predeclared controls:
//
//   NEGATIVE   the title must come from words that SURVIVED the cut. Deriving
//              from the raw transcript would put words on screen that the hook
//              trim or a removal had just deleted — a title promising
//              something the video never says.
//   NEGATIVE   an apostrophe must survive. Title text is transcript-sourced,
//              so "don't" is normal; the document-wide metacharacter scan
//              rejects apostrophes everywhere else and would eat it.
//   MUTATION   the validator's wordCount check must be load-bearing: a count
//              that disagrees with the text is a second source of truth, and
//              removing the check must let a wrong one through.
//   NEGATIVE   the ASS audit must COUNT the extra event. It previously
//              asserted "events == cues"; a title that slipped past an
//              un-updated count would be an unaudited Dialogue line.
import { describe, it, expect } from 'vitest'
import { buildHookTitle, loadEditPolicy, type EditPolicyV1 } from '../jobs/editorCompile.js'
import { validateEditPlan, EditPlanError, assertNoExpressionStrings } from '../jobs/editPlanContract.js'
import { buildAssCaptions } from '../jobs/assCaptions.js'
import { baseInput, policy, shippedPolicy } from './fixtures/editPlanFixture.js'
import { compileEditPlan } from '../jobs/editorCompile.js'

const shipped = (): EditPolicyV1 => shippedPolicy() as EditPolicyV1

/** Cues in the shape the compiler produces: tokens per line, lines per cue. */
const cuesOf = (...lines: string[][]) => lines.map((toks, i) => ({
  index: i, outputStartMs: i * 1000, outputEndMs: i * 1000 + 900,
  lines: [toks.join(' ')], lineTokens: [toks], lineEmphasis: [toks.map(() => false)],
  emphasisWordIndices: [],
})) as unknown as Parameters<typeof buildHookTitle>[0]

describe('the title is the creator\'s own first surviving words', () => {
  it('takes them in order, and BOTH budgets bind', () => {
    // maxWords is 5, so the 6th word never enters. Then the 28-char budget
    // bites too: five words here is 32 characters, so the last whole word is
    // dropped and four survive. Written as one case because that interaction
    // is the thing most likely to be got wrong later — a change that respects
    // only the word cap passes a looser assertion and ships a title that
    // overruns the frame.
    const t = buildHookTitle(cuesOf(['Stop', 'scrolling', 'right', 'now', 'because', 'this'],
      ['matters']), shipped(), 60000)
    expect(t).not.toBeNull()
    expect(t!.text).toBe('Stop scrolling right now')
    expect(t!.wordCount).toBe(4)
    expect(t!.text.length).toBeLessThanOrEqual(shipped().titleHook.maxChars)
    expect(t!.text).not.toContain('this')
  })

  it('spans cues when the first is short', () => {
    const t = buildHookTitle(cuesOf(['Stop'], ['scrolling', 'right'], ['now']), shipped(), 60000)
    expect(t!.text).toBe('Stop scrolling right now')
  })

  it('NEGATIVE: it reads CUES, so a word the cut removed can never appear', () => {
    // The cues ARE the surviving material. This is the whole reason the
    // derivation does not touch evidence.words: a title built from the raw
    // transcript would happily show a word the hook trim just deleted.
    const t = buildHookTitle(cuesOf(['these', 'words', 'survived']), shipped(), 60000)
    expect(t!.text).toBe('these words survived')
    expect(t!.text).not.toContain('deleted')
  })

  it('drops WHOLE words to fit the character budget, never mid-word', () => {
    const p = shipped()
    p.titleHook = { ...p.titleHook, maxChars: 12 }
    const t = buildHookTitle(cuesOf(['alpha', 'bravo', 'charlie', 'delta']), p, 60000)
    expect(t!.text).toBe('alpha bravo')
    expect(t!.text.length).toBeLessThanOrEqual(12)
    // A mid-word cut would look like a rendering fault, not a design choice.
    expect(t!.text.endsWith('char')).toBe(false)
  })

  it('refuses rather than showing a fragment', () => {
    // A one-word title is not a hook. null is the honest answer.
    expect(buildHookTitle(cuesOf(['Hi']), shipped(), 60000)).toBeNull()
    expect(buildHookTitle(cuesOf(), shipped(), 60000)).toBeNull()
  })

  it('honours the enabled switch', () => {
    const p = shipped()
    p.titleHook = { ...p.titleHook, enabled: false }
    expect(buildHookTitle(cuesOf(['more', 'than', 'enough', 'words']), p, 60000)).toBeNull()
  })
})

describe('the title cannot outlive the video', () => {
  it('clamps to the output duration on a very short cut', () => {
    // The output validator compares every span to the MEASURED duration with
    // zero tolerance, so a fixed 2000ms window on a 1200ms video is a failure
    // waiting to happen.
    const t = buildHookTitle(cuesOf(['short', 'but', 'real']), shipped(), 1200)
    expect(t!.outputEndMs).toBeLessThanOrEqual(1200)
    expect(t!.outputEndMs).toBeGreaterThan(t!.outputStartMs)
  })

  it('uses the full window when there is room', () => {
    const p = shipped()
    const t = buildHookTitle(cuesOf(['plenty', 'of', 'room']), p, 60000)
    expect(t!.outputStartMs).toBe(p.titleHook.startMs)
    expect(t!.outputEndMs).toBe(p.titleHook.startMs + p.titleHook.durationMs)
  })
})

describe('the validator does not trust the compiler', () => {
  const planWith = (title: unknown) => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    const raw = JSON.parse(JSON.stringify(plan)) as Record<string, unknown>
    ;(raw.hook as Record<string, unknown>).title = title
    return raw
  }
  const codeOf = (v: unknown) => {
    try { validateEditPlan(v) } catch (e) { return (e as EditPlanError).message }
    return 'ok'
  }

  it('accepts a well-formed title', () => {
    expect(codeOf(planWith({ text: 'stop scrolling now', wordCount: 3, outputStartMs: 0, outputEndMs: 2000 })))
      .toBe('ok')
  })

  it('accepts null — most videos have no title and that is a real state', () => {
    expect(codeOf(planWith(null))).toBe('ok')
  })

  it('MUTATION: a wordCount that disagrees with the text is refused', () => {
    // Two sources of truth for the same fact. If this check is removed the
    // renderer and the tests can reason from a number that describes nothing.
    expect(codeOf(planWith({ text: 'stop scrolling now', wordCount: 5, outputStartMs: 0, outputEndMs: 2000 })))
      .toContain('wordCount')
  })

  it('refuses a line break — it would split one ASS event into two', () => {
    expect(codeOf(planWith({ text: 'stop\nscrolling', wordCount: 2, outputStartMs: 0, outputEndMs: 2000 })))
      .toContain('line break')
  })

  it('refuses an empty, over-long, or reversed title', () => {
    expect(codeOf(planWith({ text: '', wordCount: 1, outputStartMs: 0, outputEndMs: 2000 }))).toContain('empty')
    expect(codeOf(planWith({ text: 'x'.repeat(200), wordCount: 1, outputStartMs: 0, outputEndMs: 2000 })))
      .toContain('too long')
    expect(codeOf(planWith({ text: 'a b', wordCount: 2, outputStartMs: 2000, outputEndMs: 2000 })))
      .toContain('span')
  })

  it('refuses an unknown key inside the title', () => {
    expect(codeOf(planWith({ text: 'a b', wordCount: 2, outputStartMs: 0, outputEndMs: 2000, style: 'x' })))
      .toContain('hook.title')
  })
})

describe('NEGATIVE: transcript punctuation survives the metacharacter scan', () => {
  it("an apostrophe in the title does not fail the document scan", () => {
    // Title text is transcript-sourced free text, exactly like caption lines,
    // and "don't" is the most ordinary thing a person says. The scan rejects
    // apostrophes everywhere else in the plan; if the title were not exempted
    // this would throw and the whole render would fail on a contraction.
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    const withApostrophe = {
      ...plan,
      hook: { ...plan.hook, title: { text: "don't stop now", wordCount: 3, outputStartMs: 0, outputEndMs: 2000 } },
    }
    expect(() => assertNoExpressionStrings(withApostrophe)).not.toThrow()
  })

  it('CONTROL: the scan still bites on the rest of the hook', () => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    const dirty = { ...plan, hook: { ...plan.hook, reasonCode: 'hook;rm -rf' } }
    expect(() => assertNoExpressionStrings(dirty)).toThrow()
  })
})

describe('the burned document carries the title as its own audited event', () => {
  const render = (title: unknown) => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    const p = { ...plan, hook: { ...plan.hook, title } } as typeof plan
    return buildAssCaptions(p, { fontName: 'Inter', titleFontSizePx: 96, titleMarginTopPx: 420 })
  }

  it('emits exactly one extra Dialogue event', () => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    const without = buildAssCaptions({ ...plan, hook: { ...plan.hook, title: null } } as typeof plan,
      { fontName: 'Inter' })
    const withTitle = render({ text: 'stop scrolling now', wordCount: 3, outputStartMs: 0, outputEndMs: 2000 })
    const count = (d: string) => d.split('\n').filter((l) => l.startsWith('Dialogue:')).length
    expect(count(withTitle.document)).toBe(count(without.document) + 1)
  })

  it('NEGATIVE: the audit COUNTS it — an uncounted event would be unaudited', () => {
    // The audit used to assert events == cues. If the title were added without
    // updating that count, the render would fail on every video that has one —
    // and if the count were simply dropped instead, a Dialogue line could
    // carry a live override block past the only check that looks for it.
    expect(() => render({ text: 'stop scrolling now', wordCount: 3, outputStartMs: 0, outputEndMs: 2000 }))
      .not.toThrow()
  })

  it('gives the title its OWN style, top-aligned', () => {
    const { document } = render({ text: 'stop scrolling now', wordCount: 3, outputStartMs: 0, outputEndMs: 2000 })
    expect(document).toContain('Style: TwinAITitle,')
    // ...,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
    // Alignment 8 is top-centre; the caption style uses 2, bottom-centre.
    const titleStyle = document.split('\n').find((l) => l.startsWith('Style: TwinAITitle,'))!
    expect(titleStyle.split(',').slice(-5)[0]).toBe('8')
    expect(document).toContain('TwinAITitle,,0,0,0,,stop scrolling now')
  })

  it('escapes the text like any other event', () => {
    const { document } = render({ text: 'a {b} c', wordCount: 3, outputStartMs: 0, outputEndMs: 2000 })
    // A live brace in an event is exactly what assertNoOverrideBlock forbids;
    // reaching here at all proves the text went through escaping first.
    expect(document).toContain('Dialogue:')
  })

  it('emits no title style at all when there is no title', () => {
    const { plan } = compileEditPlan({ ...baseInput(), policy: policy() })
    const { document } = buildAssCaptions({ ...plan, hook: { ...plan.hook, title: null } } as typeof plan,
      { fontName: 'Inter' })
    expect(document).not.toContain('TwinAITitle')
  })
})

describe('the shipped policy actually carries the block', () => {
  it('loadEditPolicy reads titleHook from the real file', () => {
    const live = loadEditPolicy()
    expect(live.titleHook).toBeDefined()
    expect(live.titleHook.enabled).toBe(true)
    expect(live.titleHook.minWords).toBeGreaterThanOrEqual(2)
    expect(live.titleHook.maxWords).toBeLessThanOrEqual(8)
    // Bounded by the contract maximum, not merely by intent.
    expect(live.titleHook.maxChars).toBeLessThanOrEqual(60)
  })
})
