// A FACT WITH NO STATED ORIGIN IS A FACT NOBODY CAN REVIEW.
//
// ⚠️ THE PAGE USED TO SAY `source` AND LINK IT. That answers "does an origin
// exist" and never "what was it" — and a fact with no URL said nothing at all,
// which is now the common case: a figure read off a photograph the creator
// uploaded, or one they typed themselves, has no page to link to.
//
// ⚖️ SO THE LABEL COMES FROM A TOTAL `Record` OVER THE SOURCE ENUM. Adding an
// extraction source is a compile error until somebody writes the sentence a
// creator will read — the same rule `ROLE_OF` and `MECHANISM_FROM_GOAL` run on,
// applied to the one place where a missing entry would be silently invisible.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { EXTRACTION_SOURCES, SOURCE_LABEL, sourceWarrantsAttention } from '../productExtraction'

const PAGE = readFileSync(join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', '..', 'apps', 'web', 'src', 'pages', 'ProductLibrary.tsx',
), 'utf8')

describe('every source a fact can carry has words a creator understands', () => {
  it('labels all of them', () => {
    for (const s of EXTRACTION_SOURCES) {
      expect(typeof SOURCE_LABEL[s], s).toBe('string')
      expect(SOURCE_LABEL[s].length, s).toBeGreaterThan(0)
    }
  })

  it('uses no internal vocabulary in anything that reaches a screen', () => {
    // ⚖️ THE STANDING UX RULE. `official_product_page` is a database value;
    // "From the product page" is a sentence. A label that leaked the enum would
    // make the creator read the schema.
    for (const s of EXTRACTION_SOURCES) {
      expect(SOURCE_LABEL[s], s).not.toMatch(/_|extraction|entity|enum|source_/i)
    }
  })

  it('flags exactly the two origins that are a reading rather than a statement', () => {
    // ⚠️ MARKETING COPY IS WRITTEN TO PERSUADE AND A PHOTOGRAPH IS A MACHINE'S
    // READING OF AN IMAGE. Both are usable; neither is something the product's
    // own page asserted. A page that flagged everything would train people to
    // stop looking.
    const flagged = EXTRACTION_SOURCES.filter(sourceWarrantsAttention)
    expect([...flagged].sort()).toEqual(['creator_image', 'marketing_copy'])
  })

  it('never flags what the creator confirmed themselves', () => {
    expect(sourceWarrantsAttention('user_confirmed')).toBe(false)
  })
})

describe('the page actually says it', () => {
  it('renders the label rather than the bare word "source"', () => {
    // ⚠️ THE REGRESSION THIS FILE EXISTS FOR. Re-introducing `>source</a>` would
    // pass every type check and quietly undo the whole review card.
    expect(PAGE).toContain('SOURCE_LABEL[fact.source]')
    expect(PAGE).not.toMatch(/>source<\/a>/)
  })

  it('shows an origin even when there is nothing to link to', () => {
    expect(PAGE).toMatch(/!fact\.sourceUrl.*\{label\}/s)
  })
})
