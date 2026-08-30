// A PHOTOGRAPH PROVES WHAT A THING LOOKS LIKE. IT PROVES NOTHING ABOUT WHAT IT
// COSTS.
//
// ⚖️ IMAGES ARE A THIRD KIND OF EVIDENCE, not a stronger web page. They establish
// that a product EXISTS and WHAT IT LOOKS LIKE — exactly what the Director Plan
// needs to decide whether a scene may show it — and nothing about price, benefit
// or result.
//
// ⚠️ AND A VISION MODEL WILL READ "$29/mo" OFF A SCREENSHOT WITHOUT HESITATING.
// That figure is a reading of a picture, not a stated price. Letting it through
// would put a number in a script that no page and no person ever asserted — the
// same defect as an auto-extracted greyscale palette becoming "your brand", and
// as a generated CTA becoming "your words", in a third place.
import { describe, expect, it } from 'vitest'
import {
  imageFactAllowed, extractionTrust, EXTRACTION_SOURCES, EXTRACTED_FIELDS,
} from '../productExtraction'

describe('what a picture may establish', () => {
  it('allows identity and appearance', () => {
    for (const f of ['name', 'category', 'description'] as const) {
      expect(imageFactAllowed(f), f).toBe(true)
    }
  })

  it('refuses every field that carries a commercial claim', () => {
    // ⚠️ THESE ARE THE ONES A SCREENSHOT MAKES TEMPTING. A pricing page in a
    // photo looks exactly like a pricing page, and it is still a photo.
    for (const f of ['price', 'plan', 'guarantee', 'benefit', 'claim', 'cta'] as const) {
      expect(imageFactAllowed(f), f).toBe(false)
    }
  })

  it('refuses rather than downgrades', () => {
    // ⚖️ `needs_confirmation` WOULD PUT THE FIGURE IN FRONT OF THE CREATOR WITH A
    // TICK BOX, and a plausible number beside a photo of their own product is the
    // easiest thing in the world to approve without checking. A refused field
    // never becomes a fact at all.
    const refused = EXTRACTED_FIELDS.filter((f) => !imageFactAllowed(f))
    expect(refused.length).toBeGreaterThan(0)
    // Nothing in the allowed set is a measured or promissory field.
    for (const f of EXTRACTED_FIELDS.filter(imageFactAllowed)) {
      expect(['price', 'plan', 'guarantee', 'benefit', 'claim', 'cta']).not.toContain(f)
    }
  })
})

describe('even what it may establish is never taken on trust', () => {
  it('marks an image-sourced name for confirmation', () => {
    // ⚠️ A VISION MODEL NAMING A PRODUCT FROM A BOX IS USUALLY RIGHT AND
    // SOMETIMES CONFIDENTLY WRONG, and the cost of a wrong name is every later
    // script calling the thing something it is not. One tap fixes it; nothing
    // catches it afterwards.
    expect(extractionTrust({ field: 'name', value: 'Twin', source: 'creator_image' }))
      .toBe('needs_confirmation')
  })

  it('fails closed for a field that should never have reached it', () => {
    // ⚖️ The extractor drops refused fields, so this is the second line of
    // defence. A second line that returned `usable` would not be one.
    expect(extractionTrust({ field: 'price', value: '$29/mo', source: 'creator_image' }))
      .toBe('needs_confirmation')
  })

  it('does not disturb the sources that already existed', () => {
    expect(extractionTrust({ field: 'name', value: 'Twin', source: 'user_confirmed' })).toBe('usable')
    expect(extractionTrust({ field: 'name', value: 'Twin', source: 'marketing_copy' })).toBe('needs_confirmation')
    expect(extractionTrust({ field: 'name', value: 'Twin', source: 'official_product_page' })).toBe('usable')
  })
})

describe('the vocabulary', () => {
  it('carries the new source without displacing the old ones', () => {
    expect(EXTRACTION_SOURCES).toContain('creator_image')
    // ⚠️ `user_confirmed` MUST STILL OUTRANK EVERYTHING. A creator typing a price
    // is an assertion; a photo of it is not, and the two must not converge.
    expect(EXTRACTION_SOURCES).toContain('user_confirmed')
    expect(EXTRACTION_SOURCES.indexOf('creator_image'))
      .not.toBe(EXTRACTION_SOURCES.indexOf('user_confirmed'))
  })
})

// ── AND THE RULE IS ENFORCED, NOT MERELY REQUESTED ────────────────────────
//
// ⚠️ THE PROMPT ASKS THE MODEL NOT TO READ A PRICE OFF A PHOTOGRAPH, and a model
// told that will mostly comply. "Mostly" is not a permission system. The worker
// applies `imageFactAllowed` to what actually came back, which is the decidable
// half of the same rule.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO2 = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const JOB = readFileSync(join(REPO2, 'worker/src/jobs/extractProduct.ts'), 'utf8')
const FN = readFileSync(join(REPO2, 'supabase/functions/product-image/index.ts'), 'utf8')
const CFG = readFileSync(join(REPO2, 'supabase/config.toml'), 'utf8')

describe('the worker enforces what the prompt asks', () => {
  it('drops an image-sourced fact the rule refuses', () => {
    expect(JOB).toMatch(/if \(factSource === 'creator_image' && !imageFactAllowed\(/)
  })

  it('tags a photograph as a photograph rather than as marketing copy', () => {
    // ⚠️ `sourceFor` READS A URL, and with none it degrades to `marketing_copy` —
    // both wrong and far too permissive, because marketing copy may state a
    // price and a photograph may not.
    expect(JOB).toMatch(/const factSource = \(!url && images\.length > 0\) \? 'creator_image' : source/)
  })

  it('never writes the page URL onto a fact that came from an image', () => {
    // ⚖️ That is the laundering the whole split exists to stop.
    expect(JOB).toMatch(/sourceUrl: factSource === 'creator_image' \? null : url/)
  })

  it('refuses a storage path outside the owner folder', () => {
    expect(JOB).toMatch(/if \(!path\.startsWith\(`\$\{ownerId\}\/`\)\)/)
    expect(JOB).toMatch(/select\('product_url, owner_id, name, creator_summary'\)/)
  })

  it('caps how many images one job will inline', () => {
    expect(JOB).toMatch(/imagePaths\.slice\(0, MAX_IMAGES\)/)
  })

  it('does not let an image-only job fall into the unreadable-page branch', () => {
    // ⚠️ That branch writes "we read it and got nothing" — which for a creator
    // who supplied photographs and no link would be a lie about work never done.
    expect(JOB).toMatch(/&& imagePaths\.length === 0\) \{/)
    expect(JOB).toMatch(/const text = url \? await fetchPageText\(url\) : null/)
  })
})

describe('the upload endpoint', () => {
  it('requires a signed-in caller', () => {
    // ⚠️ It writes with the service role on the caller's behalf. Without JWT
    // verification it would file an upload under whatever the body claimed.
    expect(CFG).toMatch(/\[functions\.product-image\]\s*\n(?:#[^\n]*\n)*verify_jwt = true/)
    expect(FN).toMatch(/if \(!user\) return json\(\{ error: 'Not authenticated' \}, 401\)/)
  })

  it('writes under the owner’s own folder, which the worker later verifies', () => {
    expect(FN).toMatch(/\$\{user\.id\}\/products\//)
  })

  it('allow-lists the content type rather than passing it through', () => {
    // ⚖️ The stored type is what the worker hands the model as mimeType, so an
    // unrecognised value is refused rather than defaulted.
    expect(FN).toMatch(/image\/webp/)
    expect(FN).toMatch(/Please upload a PNG, JPEG or WebP image/)
  })

  it('is a separate endpoint from the logo upload', () => {
    // ⚖️ A logo is branding applied to renders; these are evidence that feeds the
    // claim rules. One endpoint would mean one path prefix.
    expect(FN).not.toMatch(/brandkit/)
  })
})
