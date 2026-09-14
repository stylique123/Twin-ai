// ⚠️ MEASURED IN PRODUCTION, 2026-09-14, BEFORE BUILDING. The library titled
// every draft with `reference_read.format_label`:
//
//   distinct titles by format_label ... 109 of 134  (81.3%)
//   distinct titles by premise ........ 130 of 134  (97.0%)
//
// One creator has TEN drafts all called "Direct Confrontational Truth Reframe".
// The audit caught it at five; it has doubled since.
import { describe, it, expect } from 'vitest'
import { draftTitle, DRAFT_TITLE_MAX } from '../draftTitle'

const LABEL = 'Direct Confrontational Truth Reframe'

describe('the subject wins over the taxonomy', () => {
  it('names the draft by its premise when there is one', () => {
    expect(draftTitle({
      concept: { premise: 'waiting for commercial gear holds back beginner microbakers' },
      reference_read: { format_label: LABEL },
    })).toBe('waiting for commercial gear holds back beginner microbakers')
  })

  it('tells two drafts of the same format apart, which is the whole defect', () => {
    const a = draftTitle({ concept: { premise: 'the twelve hundred dollar machine ruined the sales' },
      reference_read: { format_label: LABEL } })
    const b = draftTitle({ concept: { premise: 'handmade is about the fixing, not the making' },
      reference_read: { format_label: LABEL } })
    expect(a).not.toBe(b)
  })

  it('keeps the format label for rows that predate the premise', () => {
    // ⚖️ 28 of 134 generations have no `concept.premise`. They must keep the
    // title they have always shown rather than all becoming "Blueprint".
    expect(draftTitle({ reference_read: { format_label: LABEL } })).toBe(LABEL)
  })

  it('says Blueprint only when it has neither', () => {
    expect(draftTitle({})).toBe('Blueprint')
    expect(draftTitle(null)).toBe('Blueprint')
    expect(draftTitle({ concept: { premise: '   ' }, reference_read: { format_label: '' } })).toBe('Blueprint')
  })
})

describe('a long premise is shortened like a sentence, not truncated like a buffer', () => {
  // ⚠️ THE FIRST FIXTURE HERE WAS DEGENERATE AND A MUTANT SURVIVED BECAUSE OF
  // IT, NOT BECAUSE THE CODE WAS RIGHT. Its 72nd character fell exactly on a
  // space, so cutting mid-word produced an identical string and the word-
  // boundary rule was never exercised. This one cuts inside "equipment".
  const LONG = 'waiting for the commercial kitchen equipment that beginner microbakers believe they need before selling a single loaf'

  it('cuts at a word boundary and marks the cut', () => {
    const t = draftTitle({ concept: { premise: LONG } })
    expect(t.length).toBeLessThanOrEqual(DRAFT_TITLE_MAX + 1)
    expect(t.endsWith('…')).toBe(true)
    // ⚠️ NEVER MID-WORD. A title ending "…microbak" reads as a rendering bug.
    const body = t.slice(0, -1)
    expect(LONG.startsWith(body)).toBe(true)
    expect(LONG[body.length] === ' ' || body.length === LONG.length).toBe(true)
  })

  it('leaves a short premise entirely alone', () => {
    const short = 'the twelve hundred dollar machine'
    expect(draftTitle({ concept: { premise: short } })).toBe(short)
  })

  it('collapses whitespace rather than rendering a ragged title', () => {
    expect(draftTitle({ concept: { premise: '  two   spaces\nand a newline ' } }))
      .toBe('two spaces and a newline')
  })
})
