import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { platformCtaFailures } from '../ctaFitsThePlatform'

const EDGE = readFileSync(
  fileURLToPath(new URL('../../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url)),
  'utf8',
)

const cta = (line: string) => [{ section: 'CTA', line }]

/**
 * ⚠️⚠️ THE REAL PRODUCTION LINE. Four stored scripts say this, all four on
 * TikTok, with `reference_read.platform` AND `brand_voices.platform` both
 * reading `tiktok`. The platform was on file twice and the line shipped anyway.
 */
const REAL = 'How much does it cost you to bake one loaf right now? Tell me below,'
  + ' and do not forget to subscribe to our channel. I will see you in the next video.'

describe('a CTA may not name an action the platform does not have', () => {
  it('catches the real production line on tiktok', () => {
    const out = platformCtaFailures(cta(REAL), 'tiktok')
    expect(out).toHaveLength(1)
    expect(out[0].repair).toContain('no subscribe button')
    expect(out[0].repair).toContain('follow')
  })

  it('catches the bell and the channel separately', () => {
    expect(platformCtaFailures(cta('Ring the notification bell.'), 'tiktok')).toHaveLength(1)
    expect(platformCtaFailures(cta('Head over to our channel for more.'), 'tiktok')).toHaveLength(1)
  })

  it('says nothing on youtube, where all of it is true', () => {
    expect(platformCtaFailures(cta(REAL), 'youtube')).toEqual([])
    expect(platformCtaFailures(cta('Ring the notification bell.'), 'youtube')).toEqual([])
  })
})

// ⚠️⚠️ THE NEGATIVE CONTROLS ARE THE POINT. Every line here is a real call to
// action taken from the stored shot lists, and a creator would say all of them
// on TikTok. A rule that flagged "is this a good CTA" would blank the lot; this
// one refuses exactly one thing — a verb the platform does not implement.
describe('a real TikTok call to action is left alone', () => {
  for (const line of [
    'What is the biggest thing holding you back from starting your home bakery? Let me know in the comments, and follow along for the next batch.',
    'Share this with a friend who loves fresh bread, and let me know in the comments what step you want to see next.',
    'Tell me if you have done this differently. I want to hear it.',
    'Save this workflow for your next bake.',
    'Follow for the rest of this.',
    'The link is in my bio if you want the full breakdown.',
  ]) {
    it(`allows: ${line.slice(0, 46)}…`, () => {
      expect(platformCtaFailures(cta(line), 'tiktok')).toEqual([])
    })
  }

  // ⚖️ "SUBSCRIBE TO MY NEWSLETTER" IS A REAL THING A TIKTOK CREATOR SAYS, and
  // it is why the channel rule is matched separately from the word subscribe...
  it('but a newsletter subscription still trips the bare `subscribe` rule — known and deliberate', () => {
    // ⚠️ HONEST ABOUT THE FALSE POSITIVE RATHER THAN QUIET ABOUT IT. Refusing
    // the bare verb catches the measured defect; narrowing it to "subscribe to
    // [the|our|my] channel" would miss "do not forget to subscribe" on its own,
    // which is the more common shape. Filed here so the next reader finds the
    // decision, not the symptom.
    expect(platformCtaFailures(cta('Subscribe to my newsletter for the recipe.'), 'tiktok')).toHaveLength(1)
  })
})

describe('an unknown platform forbids nothing', () => {
  it('is silent when the platform is absent, unknown or malformed', () => {
    for (const p of [null, undefined, '', '   ', 'linkedin', 42, {}]) {
      expect(platformCtaFailures(cta(REAL), p), String(p)).toEqual([])
    }
  })

  // ⚖️ THE HOOK MAY MENTION SUBSCRIBING. "Everyone tells you to grow a YouTube
  // channel first" is an opinion, not an instruction to the viewer.
  it('only the CTA beat is judged', () => {
    expect(platformCtaFailures(
      [{ section: 'Hook', line: 'Everyone says grow a YouTube channel first. Subscribe there, they said.' }],
      'tiktok',
    )).toEqual([])
  })

  it('an empty CTA line is not a wrong CTA', () => {
    expect(platformCtaFailures([{ section: 'CTA', line: '' }], 'tiktok')).toEqual([])
    expect(platformCtaFailures(null, 'tiktok')).toEqual([])
  })
})

// ⚖️ THE EDGE CANNOT IMPORT @twinai/shared, so it mirrors — and the mirror is
// checked against the shipped source rather than trusted.
describe('the edge copy is wired and agrees', () => {
  it('refuses the same three shapes', () => {
    expect(EDGE).toContain('PLATFORM_WRONG_CTA_INLINE')
    for (const shape of ['subscribe', 'our channel', 'notification bell']) {
      expect(EDGE, shape).toContain(shape)
    }
  })

  // ⚠️ AN UNKNOWN PLATFORM MUST FORBID NOTHING, and line ~4655 of that file
  // defaults an absent platform to 'tiktok' for a different purpose. Copying
  // that coercion here would fire this rule on every creator whose platform
  // nobody recorded. This asserts the coercion was NOT copied.
  it('does not default an unknown platform to tiktok', () => {
    const i = EDGE.indexOf('function platformCtaFailuresInline')
    expect(i).toBeGreaterThan(-1)
    const fn = EDGE.slice(i, i + 900)
    expect(fn).toContain('if (!wrong) return []')
    // ⚠️ THIS ASSERTION WAS TOO NARROW FIRST TIME AND THE MUTATION WALKED PAST
    // IT. It checked for the literal "?? 'tiktok'"; the real risk is ANY
    // fallback, and `?? PLATFORM_WRONG_CTA_INLINE['tiktok']` slipped through.
    // Asserting the lookup line has no `??` at all catches every spelling.
    const lookup = fn.split('\n').find((l) => l.includes('const wrong = PLATFORM_WRONG_CTA_INLINE['))
    expect(lookup, 'the lookup line must be findable').toBeTruthy()
    expect(lookup).not.toContain('??')
    expect(lookup).not.toContain('||')
  })

  it('is merged into entFails at BOTH sites, and counted', () => {
    expect(EDGE.split('...platformCtaFailuresInline(declared, voice?.platform),').length - 1).toBe(2)
    expect(EDGE).toContain('platform_cta_gaps: platformCtaFailuresInline(declared, voice?.platform).length,')
  })
})
