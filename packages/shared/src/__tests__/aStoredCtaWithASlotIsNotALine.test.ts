// A STORED CTA WITH AN UNFILLED SLOT IS NOT A LINE SHE CAN READ.
//
// ⚖️ THE TWO FIXTURES BELOW ARE PRODUCTION STRINGS, copied out of
// `brand_voices.profile` for two different scanned accounts. They are the whole
// reason this file exists: the owner saw the first one on a Product Mode
// teleprompter as a filmable line with an Edit button beside it.
//
// ⚠️ THE EXTRACTION IS NOT THE DEFECT. She really does end videos that way, with
// a different word in the slot each time, so the stored value is TRUE and must
// stay stored — `goalFromCtas` reads the same field and a template answers its
// question correctly. What was wrong is the two surfaces that put the words in
// front of her, and those are the only two this changes.
import { describe, it, expect } from 'vitest'
import { isTemplateCta, suggestedCta, ctaMechanismIn } from '../cta'
import { buildRecordingScript } from '../recordingScriptAdapter'
import type { Blueprint } from '../types'

/** Stored verbatim for voice 20b7a580 — the line the owner actually saw. */
const SEEN = 'Comment [KEYWORD] and I will send you a short, simple routine to get started.'
/** Stored verbatim for voice 6cee6049 — the same shape, truncated by the model. */
const SEEN_2 = "Comment [KEYWORD] and I'll send you..."

describe('isTemplateCta', () => {
  it('flags the two stored lines that carry an unfilled slot', () => {
    expect(isTemplateCta(SEEN)).toBe(true)
    expect(isTemplateCta(SEEN_2)).toBe(true)
  })

  // ⚠️ THE NEGATIVE CONTROLS ARE THE POINT. A predicate that flagged every
  // stored CTA would silently end every script without an ask, which is a
  // bigger regression than the defect — 29 of 47 accounts have a real asking
  // line and all of them must survive this.
  it('leaves a real spoken ending alone', () => {
    for (const ok of [
      'Comment RECIPE and I will send you the full routine.',
      'Follow for the rest of this build.',
      'Link in my bio if you want the template.',
      'Save this for the next time it happens.',
    ]) {
      expect(isTemplateCta(ok), ok).toBe(false)
      expect(ctaMechanismIn(ok), ok).not.toBeNull()
    }
  })

  // ⚖️ A DECLARED CLIP IS A SHOOTING INSTRUCTION, NOT A BLANK, and
  // `containerResolution` already draws that line. Re-deciding it here would be
  // the same rule with two owners.
  it('does not treat a declared clip as an unfilled slot', () => {
    expect(isTemplateCta('Here is the fix [SHOW: the settings page]')).toBe(false)
  })

  it('is false for nothing, not true', () => {
    expect(isTemplateCta('')).toBe(false)
    expect(isTemplateCta(null)).toBe(false)
    expect(isTemplateCta(undefined)).toBe(false)
  })
})

describe('suggestedCta', () => {
  it('does not offer a template for confirmation', () => {
    expect(suggestedCta([SEEN])).toBeNull()
  })

  // ⚠️ SKIPPED, NOT STOPPED AT. `recurring_ctas` is stored
  // most-characteristic-first, so a template in position 0 must not hide a real
  // asking line behind it.
  it('reaches past a template to a real ending', () => {
    const got = suggestedCta([SEEN, 'Follow for the rest of this build.'])
    expect(got?.text).toBe('Follow for the rest of this build.')
    expect(got?.mechanism).toBe('follow')
  })
})

/** A blueprint whose script ends WITHOUT an ask, so the adapter falls through to
 *  the stored-CTA path — the only path this defect travels. */
function scriptWithNoAsk(): Blueprint {
  return {
    script: [
      { section: 'Hook', line: 'This bracket cost me a filmed take.' },
      { section: 'Body', line: 'Here is what I changed about the way I check it.' },
    ],
  } as unknown as Blueprint
}

describe('the teleprompter', () => {
  it('does not append a template as a filmable CTA scene', () => {
    const s = buildRecordingScript({ generationId: 'g1', blueprint: scriptWithNoAsk(), creatorCtas: [SEEN] })
    expect(JSON.stringify(s)).not.toContain('[KEYWORD]')
    for (const sc of s.scenes) expect(sc.scene_type).not.toBe('cta')
    // ⚖️ THE DESIGNED THIRD OPTION, NOT A DEFAULT SENTENCE. The file's own rule
    // is "theirs or there isn't one", and the absence is declared on the card.
    expect(s.ends_without_ask).toBe(true)
  })

  it('still appends a real stored ending', () => {
    const s = buildRecordingScript({
      generationId: 'g1', blueprint: scriptWithNoAsk(),
      creatorCtas: [SEEN, 'Follow for the rest of this build.'],
    })
    const cta = s.scenes.find((x) => x.scene_type === 'cta')
    expect(cta?.dialogue).toBe('Follow for the rest of this build.')
    expect(s.ends_without_ask).toBeFalsy()
  })
})
