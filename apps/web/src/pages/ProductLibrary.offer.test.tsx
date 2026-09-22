// THE OFFER BELONGED TO THE ACCOUNT, AND IT IS A PROPERTY OF THE PRODUCT.
//
// ⚠️ MEASURED 2026-09-20: 52 of 54 ready voices carry a scanned `profile.offer`
// — one sentence per ACCOUNT, guessed from their posts, editable nowhere. A
// creator with two products had one offer between them, and the Product Library
// had no offer field at all.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..', '..', '..')
const PAGE = readFileSync(join(HERE, 'ProductLibrary.tsx'), 'utf8')
const EDGE = readFileSync(join(ROOT, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')
const API = readFileSync(join(ROOT, 'packages', 'shared', 'src', 'api.ts'), 'utf8')

describe('the placeholder no longer names somebody else’s product', () => {
  it('does not put a baker’s sourdough on a candle maker’s screen', () => {
    // ⚠️ IT READ AS DATA, AND THAT READING WAS FAIR. A specific product, in a
    // specific creator's card, in a box that saves on blur.
    // The string survives in the comment that records WHY it was removed —
    // which is the point of the comment. What must not survive is the attribute.
    expect(PAGE).not.toMatch(/placeholder="Sourdough loaves/)
  })

  it('shows the SHAPE of an answer instead', () => {
    expect(PAGE).toMatch(/placeholder="What it is, and who it is for"/)
  })

  it('the add-form example keeps its `e.g.`, which is what makes it an example', () => {
    expect(PAGE).toMatch(/placeholder="e\.g\. an editing app for creators who film on their phone"/)
  })
})

describe('the offer has a place to be typed', () => {
  it('renders a field on the product card', () => {
    expect(PAGE).toMatch(/What does it cost, and what do they get\?/)
  })

  it('saves it, and saves a blank as null rather than an empty answer', () => {
    // Re-anchored 2026-09-22: the offer is now edited as option/price rows
    // (OfferEditor); `serializeOffer` returns null when every row is blank.
    expect(PAGE).toMatch(/save\(e\.id, \{ offer: v \}\)/)
    expect(readFileSync(new URL('../lib/offerRows.ts', import.meta.url), 'utf8')).toMatch(/return lines\.length \? lines\.join\('\\n'\) : null/)
  })
})

describe('the writer actually reads it', () => {
  it('prefers the PRODUCT offer over the account-level guess', () => {
    // `vp.offer` is a scan's sentence about the whole business.
    expect(EDGE).toMatch(/answers\.offer \?\? brief\.offer \?\? productOffer/)
    const chain = EDGE.slice(EDGE.indexOf('const readyOffer ='), EDGE.indexOf('const readyOffer =') + 200)
    expect(chain.indexOf('productOffer')).toBeLessThan(chain.indexOf('vp?.offer'))
  })

  it('stays BELOW what the creator typed for this video', () => {
    // A stored product line must not overrule the sentence she just wrote.
    const chain = EDGE.slice(EDGE.indexOf('const readyOffer ='), EDGE.indexOf('const readyOffer =') + 200)
    expect(chain.indexOf('answers.offer')).toBeLessThan(chain.indexOf('productOffer'))
  })

  it('SELECTS the column, or the reader is permanently null', () => {
    // ⚠️ THE EXACT DEFECT FOUND ON THE STORY SCREEN THE SAME NIGHT: a suggester
    // decided on `cost` and `consensus` and its loader asked for neither.
    expect(EDGE).toMatch(/id, name, creator_summary, offer, type, relationship/)
    expect(API).toMatch(/id, name, creator_summary, offer, type, relationship/)
  })

  it('a blank offer falls through instead of naming nothing', () => {
    expect(EDGE).toMatch(/return t === '' \? undefined : t/)
  })

  it('an unapplied migration costs the offer line, never the product', () => {
    expect(EDGE).toMatch(/pickErr && \/offer\/i\.test/)
  })
})
