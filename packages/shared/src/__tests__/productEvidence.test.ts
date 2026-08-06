// What a product answer IS — and the three rules borrowed from the prior art.
//
// The one worth reading twice is the LAST group. Evidence is something we READ,
// and the moment a captured marketing page is allowed to become footage, a video
// about software shows a hero image instead of the software.
import { describe, expect, it } from 'vitest'
import {
  CAPTURE_FALLBACK_OPTIONS, MIN_USABLE_SECTIONS, assessCapture, mayAppearOnScreen,
  orderedSections, productEvidenceState, type EvidenceSection, type ProductEvidence,
} from '../productEvidence'

const bands = (n: number): EvidenceSection[] =>
  Array.from({ length: n }, (_, i) => ({ order: i, label: `band ${i}`, imagePath: `p/${i}.png` }))

const evidence = (over: Partial<ProductEvidence> = {}): ProductEvidence => ({
  form: 'link', url: 'https://example.com', linkRole: 'knowledge', sections: bands(4), ...over,
})

describe('a failed capture asks the creator, and never retries', () => {
  it('has no retry to return — every failure routes to a question', () => {
    // The type cannot express a retry, and that is the guarantee. A silent
    // second attempt spends the creator's time on the same wall.
    for (const failure of ['unreachable', 'blocked', 'needs_login'] as const) {
      const out = assessCapture({ url: 'https://example.com', failure, sections: bands(8) })
      expect(out.kind).toBe('ask_creator')
      if (out.kind === 'ask_creator') expect(out.failure).toBe(failure)
    }
  })

  it('offers two named options, both of which move forward', () => {
    const out = assessCapture({ url: 'https://example.com', failure: 'blocked' })
    expect(out.kind).toBe('ask_creator')
    if (out.kind === 'ask_creator') {
      expect(out.options).toEqual(CAPTURE_FALLBACK_OPTIONS)
      expect([...out.options]).toEqual(['send_images', 'continue_without'])
    }
  })

  it('too little is the same as nothing', () => {
    // A page that yielded two bands told us as much as a page that never
    // loaded, so it gets the same treatment rather than a quiet best-effort.
    expect(assessCapture({ url: 'https://x.com', sections: bands(MIN_USABLE_SECTIONS - 1) }).kind)
      .toBe('ask_creator')
    expect(assessCapture({ url: 'https://x.com', sections: bands(MIN_USABLE_SECTIONS) }).kind)
      .toBe('ready')
    expect(assessCapture({ url: 'https://x.com' }).kind).toBe('ask_creator')
  })
})

describe('the section map is the page\'s own order', () => {
  it('keeps top→bottom, whatever order they arrived in', () => {
    const shuffled = [bands(3)[2], bands(3)[0], bands(3)[1]]
    expect(orderedSections(shuffled).map((s) => s.order)).toEqual([0, 1, 2])
  })

  it('does not mutate what it was given', () => {
    const input = [bands(2)[1], bands(2)[0]]
    orderedSections(input)
    expect(input.map((s) => s.order)).toEqual([1, 0])
  })

  it('a ready capture carries the sections already ordered', () => {
    const out = assessCapture({
      url: 'https://x.com',
      sections: [bands(4)[3], bands(4)[1], bands(4)[0], bands(4)[2]],
    })
    expect(out.kind).toBe('ready')
    if (out.kind === 'ready') expect(out.evidence.sections.map((s) => s.order)).toEqual([0, 1, 2, 3])
  })
})

describe('evidence is READ, not shown', () => {
  it('a captured page defaults to knowledge, never to on-screen', () => {
    const out = assessCapture({ url: 'https://x.com', sections: bands(6) })
    expect(out.kind).toBe('ready')
    if (out.kind === 'ready') {
      expect(out.evidence.linkRole).toBe('knowledge')
      expect(mayAppearOnScreen(out.evidence)).toBe(false)
    }
  })

  it('nothing here can promote a link to on-screen', () => {
    // Pasting a URL into "show us what you sell" says what the product IS. It
    // does not say the page should appear in the video, and treating it as
    // consent is how a hero shot stands in for the software working. A
    // `[SHOW SCREEN: …]` slot is the separate, explicit way that happens.
    const promoted = evidence({ linkRole: 'on_screen' })
    expect(mayAppearOnScreen(promoted)).toBe(true)
    expect(mayAppearOnScreen(evidence())).toBe(false)
  })
})

describe('three states, because a skipped question is not "no product"', () => {
  it('distinguishes never-answered from explicitly declined', () => {
    expect(productEvidenceState(null)).toBe('unanswered')
    expect(productEvidenceState(undefined)).toBe('unanswered')
    expect(productEvidenceState('declined')).toBe('declined')
    expect(productEvidenceState(evidence())).toBe('supplied')
  })

  it('a record of a failed attempt is not an answer', () => {
    // Storing the URL we tried is useful; reading it as "they told us about
    // their product" would let the container rule conclude a demo is covered.
    expect(productEvidenceState(evidence({ sections: [] }))).toBe('unanswered')
  })
})
