// LEARNING-1 lineage — what an outcome is attributed BY.
//
// 0105 enforces "a business outcome must be attributed, never inferred" with a
// CHECK constraint on `dna_claims.attribution`. That column is free text, and
// until 0113 nothing in the product minted a UTM, a code, or a CRM reference —
// so the rule was enforced against a value that could only ever be a sentence
// someone typed. These tests pin the properties that make the replacement real:
// a key that cannot drift, a link that cannot be broken or hijacked, and
// evidence that reports what it has rather than what it wishes it had.
import { describe, expect, it } from 'vitest'
import {
  ATTRIBUTION_KINDS, ATTRIBUTION_MEASURES,
  attributionEvidence, buildTrackedUrl, normalizeAttributionValue,
  utmCampaignFor, validateAttribution,
} from '../attribution'

const POST = '5c9f1f6e-2f9a-4a1b-9d0e-77f0b2c3a4d5'

describe('the campaign key is stable, because a measurement key must be', () => {
  it('is derived from the post id alone', () => {
    expect(utmCampaignFor(POST)).toBe(utmCampaignFor(POST))
  })

  it('two posts never share one', () => {
    expect(utmCampaignFor(POST)).not.toBe(utmCampaignFor('11111111-2222-3333-4444-555555555555'))
  })

  it('carries no punctuation and no case, so two tools cannot spell it differently', () => {
    // Analytics tools case-fold and split on punctuation inconsistently. Two
    // spellings of one campaign splits a video's measurements into two that no
    // longer add up — the same failure as a code typed in two cases.
    expect(utmCampaignFor(POST)).toMatch(/^twinai-[a-z0-9]+$/)
  })
})

describe('the link is the creator’s, and we do not get to break it', () => {
  it('adds the campaign without disturbing existing parameters', () => {
    const out = buildTrackedUrl('https://shop.example/p/42?ref=bio', 'twinai-abc')
    expect(out).toContain('ref=bio')
    expect(out).toContain('utm_campaign=twinai-abc')
  })

  it('does NOT overwrite a campaign the creator already set', () => {
    // They have a measurement system we know nothing about. Replacing their
    // value would break their reporting to improve ours.
    const out = buildTrackedUrl('https://shop.example/?utm_campaign=spring', 'twinai-abc')
    expect(out).toContain('utm_campaign=spring')
    expect(out).not.toContain('twinai-abc')
  })

  it('returns null rather than a mangled string for an unparseable URL', () => {
    // A broken link in a creator's bio costs them more than a missing
    // measurement, and there is no version of "half a URL" worth returning.
    expect(buildTrackedUrl('not a url', 'c')).toBeNull()
    expect(buildTrackedUrl('', 'c')).toBeNull()
  })

  it('refuses a non-http scheme', () => {
    // `javascript:` and `data:` URLs parse cleanly and must never be handed
    // back as something to publish.
    expect(buildTrackedUrl('javascript:alert(1)', 'c')).toBeNull()
    expect(buildTrackedUrl('data:text/html,<b>x', 'c')).toBeNull()
  })

  it('takes source and medium rather than defaulting them', () => {
    // The same video's link on TikTok and on YouTube are different
    // measurements; a default would merge them.
    const out = buildTrackedUrl('https://x.example/', 'c', { source: 'tiktok', medium: 'social' })
    expect(out).toContain('utm_source=tiktok')
    expect(out).toContain('utm_medium=social')
    expect(buildTrackedUrl('https://x.example/', 'c')).not.toContain('utm_source')
  })
})

describe('one code, one meaning', () => {
  it('normalises the way 0113’s generated column does', () => {
    // Must stay identical to `upper(btrim(value))`. A client that normalised
    // differently would let a duplicate through the UI and have the database
    // reject it with a constraint name nobody can act on.
    expect(normalizeAttributionValue('  creator10 ')).toBe('CREATOR10')
    expect(normalizeAttributionValue('CREATOR10')).toBe(normalizeAttributionValue('creator10'))
  })
})

describe('validation says what is wrong, in words', () => {
  it('accepts each declared kind', () => {
    for (const kind of ATTRIBUTION_KINDS) {
      expect(validateAttribution({ kind, value: 'ABC' })).toEqual({ kind, value: 'ABC' })
    }
  })

  it('refuses an undeclared kind', () => {
    expect(validateAttribution({ kind: 'instagram_bio_link_v2', value: 'x' }))
      .toEqual({ rejected: 'unknown_kind' })
  })

  it('refuses empty and whitespace-only values', () => {
    expect(validateAttribution({ kind: 'utm', value: '   ' })).toEqual({ rejected: 'empty' })
  })

  it('refuses a value past the column bound', () => {
    expect(validateAttribution({ kind: 'utm', value: 'x'.repeat(201) })).toEqual({ rejected: 'too_long' })
  })

  it('refuses a promo code with a space, and allows one elsewhere', () => {
    // A code with a space is a code half the audience will mistype. A CRM
    // reference is not typed by an audience, so the rule does not apply to it.
    expect(validateAttribution({ kind: 'promo_code', value: 'GET 10' }))
      .toEqual({ rejected: 'whitespace_inside' })
    expect(validateAttribution({ kind: 'crm_ref', value: 'Deal 4821' }))
      .toEqual({ kind: 'crm_ref', value: 'Deal 4821' })
  })

  it('trims before storing, so the value matches what the database will hold', () => {
    expect(validateAttribution({ kind: 'utm', value: '  spring  ' })).toEqual({ kind: 'utm', value: 'spring' })
  })
})

describe('every kind states what it can actually measure', () => {
  it('has a sentence for each', () => {
    for (const kind of ATTRIBUTION_KINDS) {
      expect(ATTRIBUTION_MEASURES[kind].length).toBeGreaterThan(0)
    }
  })

  it('a UTM claims clicks, not purchases', () => {
    // A query parameter cannot see a purchase. "3 sales from this video" and
    // "3 sales from people who arrived through this video's link" are different
    // sentences, and only the second is true of a UTM.
    expect(ATTRIBUTION_MEASURES.utm).toMatch(/click/i)
    expect(ATTRIBUTION_MEASURES.utm).not.toMatch(/purchase|sale/i)
  })
})

describe('evidence reports what it has, not what it wishes it had', () => {
  const utm = { id: 'a1', postId: POST, kind: 'utm' as const, value: 'twinai-x' }
  const code = { id: 'a2', postId: POST, kind: 'promo_code' as const, value: 'CREATOR10' }

  it('counts attributed and unattributed separately', () => {
    const e = attributionEvidence(
      [{ metric: 'views' }, { metric: 'sales', attributionId: 'a2' }],
      [utm, code],
    )
    expect(e).toEqual({ attributed: 1, unattributed: 1, kinds: ['promo_code'] })
  })

  it('a reading naming an attribution we do not hold counts as UNATTRIBUTED', () => {
    // Not as attributed-by-something-unknown. An id we cannot resolve explains
    // nothing, and counting it would let a dangling pointer support a business
    // claim.
    const e = attributionEvidence([{ metric: 'sales', attributionId: 'ghost' }], [utm])
    expect(e).toEqual({ attributed: 0, unattributed: 1, kinds: [] })
  })

  it('an empty log is zero of both, and never an assertion', () => {
    expect(attributionEvidence([], [utm])).toEqual({ attributed: 0, unattributed: 0, kinds: [] })
  })

  it('reports every distinct kind, so a caller can qualify the sentence', () => {
    const e = attributionEvidence(
      [{ metric: 'clicks', attributionId: 'a1' }, { metric: 'sales', attributionId: 'a2' }],
      [utm, code],
    )
    expect(e.kinds).toEqual(['promo_code', 'utm'])
  })
})
