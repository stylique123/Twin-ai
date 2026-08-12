// MARKETING COPY MUST NOT BECOME SCRIPT COPY WITHOUT SOMEONE LOOKING.
//
// ⚠️ THE FAILURE THIS EXISTS FOR: a landing page says "clinically proven", the
// extractor reads it correctly, the writer quotes it faithfully, and a creator
// says it on camera about their own product. Nobody lied at any step. The claim
// still arrived in someone's mouth without anyone checking it.
import { describe, expect, it } from 'vitest'
import {
  extractionTrust, readExtractedFact, usableFacts, factsNeedingConfirmation,
} from '../productExtraction'

const P = (field: string, value: string, source = 'official_product_page') =>
  extractionTrust({ field: field as never, value, source: source as never })

describe('identity and capability are usable; numbers and outcomes are not', () => {
  it('lets a product describe WHAT IT IS', () => {
    // ⚖️ §26 ranks an authoritative product source second only to the creator.
    // Refusing a product's own name until someone retypes it turns "paste a
    // link" into "paste a link and then do all the work anyway".
    expect(P('name', 'Buildpad')).toBe('usable')
    expect(P('category', 'Analytics')).toBe('usable')
    expect(P('description', 'Validates business ideas by researching demand')).toBe('usable')
    expect(P('feature', 'Automatic captions')).toBe('usable')
    expect(P('integration', 'Connects to Notion and Slack')).toBe('usable')
    expect(P('audience', 'Founders and indie hackers')).toBe('usable')
  })

  it('holds anything whose PURPOSE is to assert a measurable result', () => {
    for (const field of ['benefit', 'claim', 'price', 'plan', 'guarantee']) {
      expect(P(field, 'anything at all')).toBe('needs_confirmation')
    }
  })

  it('escalates on the VALUE, not only the field', () => {
    // ⚠️ THE HOLE A FIELD-ONLY RULE WOULD LEAVE. A description is normally safe;
    // "the only tool that doubles your revenue" is a description containing an
    // outcome claim, and filing it as identity because of where it was found
    // walks straight past the point.
    expect(P('description', 'The only tool that doubles your revenue')).toBe('needs_confirmation')
    expect(P('feature', 'Exports 10,000 rows a second')).toBe('needs_confirmation')
    expect(P('description', 'Clinically proven to improve sleep')).toBe('needs_confirmation')
    expect(P('feature', 'Makes editing 4x faster')).toBe('needs_confirmation')
    expect(P('description', 'Trusted by 50,000 customers')).toBe('needs_confirmation')
    expect(P('description', 'Costs $29 a month')).toBe('needs_confirmation')
  })

  it('does NOT fire on a number that is part of a name', () => {
    // ⚖️ "Any digit" would trip on half of all products and make the classifier
    // useless — everything would need confirming, so nothing would get read.
    expect(P('name', 'iPhone 15')).toBe('usable')
    expect(P('name', 'Samsung Z Fold 8')).toBe('usable')
    expect(P('category', 'Web3 tooling')).toBe('usable')
    expect(P('feature', 'Supports Python 3 and Node 22')).toBe('usable')
  })
})

describe('the source can only make it stricter', () => {
  it('MARKETING COPY is never usable unconfirmed, however plain it looks', () => {
    // ⚠️ It is the one source whose PURPOSE is persuasion, so even its
    // ordinary-looking sentences were selected to flatter.
    expect(P('name', 'Buildpad', 'marketing_copy')).toBe('needs_confirmation')
    expect(P('feature', 'Automatic captions', 'marketing_copy')).toBe('needs_confirmation')
  })

  it('USER CONFIRMED outranks everything, including risky text', () => {
    // ⚖️ A creator IS allowed to promise a guarantee about their own product.
    // What they are not allowed to do is have us promise it for them.
    expect(P('guarantee', '30-day money-back guarantee', 'user_confirmed')).toBe('usable')
    expect(P('claim', 'Doubles your revenue', 'user_confirmed')).toBe('usable')
    expect(P('price', '$29 a month', 'user_confirmed')).toBe('usable')
  })

  it('documentation and listings behave like an official page', () => {
    expect(P('feature', 'Supports webhooks', 'documentation')).toBe('usable')
    expect(P('feature', 'Ships in a recyclable box', 'listing')).toBe('usable')
  })

  it('nothing can move a value from needs_confirmation BACK to usable', () => {
    // That direction is what a permission escalation looks like. The only route
    // to `usable` for risky text is `user_confirmed`, which is a person acting.
    for (const src of ['official_product_page', 'documentation', 'pricing_page', 'listing', 'marketing_copy']) {
      expect(P('claim', 'Clinically proven', src)).toBe('needs_confirmation')
    }
  })
})

describe('facts are built with their trust decided, never supplied', () => {
  it('refuses an empty value rather than storing a blank fact', () => {
    expect(readExtractedFact({ field: 'name', value: '   ', source: 'official_product_page' })).toBeNull()
  })

  it('an UNKNOWN source degrades to the weakest, never the strongest', () => {
    // Same rule as an absent `basis` reading as `inferred`.
    const f = readExtractedFact({
      field: 'name', value: 'Buildpad', source: 'nonsense' as never,
    })!
    expect(f.source).toBe('marketing_copy')
    expect(f.trust).toBe('needs_confirmation')
  })

  it('grades the fact itself rather than trusting a supplied grade', () => {
    // ⚠️ The extractor is a model that has just read persuasive copy — the worst
    // available judge of whether that copy is persuasive. The argument type has
    // no `trust` field at all, so this cannot be passed in.
    const f = readExtractedFact({
      field: 'description', value: 'Guaranteed to triple your income',
      source: 'official_product_page',
    })!
    expect(f.trust).toBe('needs_confirmation')
  })

  it('keeps the page it came from, so a creator can go and look', () => {
    const f = readExtractedFact({
      field: 'name', value: 'Buildpad', source: 'official_product_page',
      sourceUrl: 'https://buildpad.io/  ', now: '2026-08-12T00:00:00Z',
    })!
    expect(f.sourceUrl).toBe('https://buildpad.io/')
    expect(f.extractedAt).toBe('2026-08-12T00:00:00Z')
  })
})

describe('the readers that make the split mean something', () => {
  const facts = [
    readExtractedFact({ field: 'name', value: 'Buildpad', source: 'official_product_page' })!,
    readExtractedFact({ field: 'price', value: '$29/mo', source: 'pricing_page' })!,
    readExtractedFact({ field: 'feature', value: 'Automatic captions', source: 'documentation' })!,
  ]

  it('separates what a script may use from what still needs a person', () => {
    // ⚖️ Without these, `trust` is one more stored field nobody consults — which
    // is the defect this session has now found four times.
    expect(usableFacts(facts).map((f) => f.field)).toEqual(['name', 'feature'])
    expect(factsNeedingConfirmation(facts).map((f) => f.field)).toEqual(['price'])
  })
})
