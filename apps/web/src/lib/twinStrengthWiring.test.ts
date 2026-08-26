import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ⚠️ A METER NOBODY MOUNTS MEASURES NOTHING. This rebuild keeps finding fields
 * that are written and never read; a component that is built and never rendered
 * is the same defect pointing the other way. So the mount is pinned, not just
 * the component's existence.
 */
const HERE = import.meta.dirname
const DASH = readFileSync(join(HERE, '..', 'pages', 'Dashboard.tsx'), 'utf8')
const CARD = readFileSync(join(HERE, '..', 'components', 'TwinStrengthCard.tsx'), 'utf8')
const LOAD = readFileSync(join(HERE, 'twinStrengthLoad.ts'), 'utf8')

describe('the meter is actually mounted', () => {
  it('the dashboard imports it', () => {
    expect(DASH).toMatch(/import \{ TwinStrengthCard \} from '\.\.\/components\/TwinStrengthCard'/)
  })

  // ⚠️ ANCHORED ON THE JSX, NOT THE IMPORT. An unused import type-checks and
  // renders nothing — the exact way a "built" feature stays invisible.
  it('the dashboard renders it', () => {
    expect(DASH).toMatch(/<TwinStrengthCard\s+voiceId=/)
  })
})

describe('it reads, and only reads', () => {
  // ⚖️ A DISPLAY THAT ALSO WROTE would make the number it shows depend on how
  // often somebody looked at it.
  it('never writes', () => {
    expect(LOAD).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
  })

  it('selects only the three columns the calculation reads', () => {
    expect(LOAD).toMatch(/\.select\('kind, text, source'\)/)
  })

  // ⚠️ A FAILED READ IS NOT AN EMPTY TWIN. Rendering "nothing yet" on an error
  // would be a claim about the creator's work we cannot support.
  it('returns null on failure and the card renders nothing', () => {
    expect(LOAD).toMatch(/if \(error \|\| !Array\.isArray\(data\)\) return null/)
    expect(CARD).toMatch(/if \(!s\) return null/)
  })

  // ⚠️ G8 — THE SECOND SOURCE, PROVEN SEPARATELY FROM THE FIRST. Every check
  // above passed before G8 existed and would keep passing if the product-facts
  // query were deleted — none of them mention `product_entities`. This is the
  // one that actually catches that regression.
  describe('and reads product facts too (G8)', () => {
    it('queries product_entities for the knowledge column', () => {
      expect(LOAD).toMatch(/\.from\('product_entities'\)/)
      expect(LOAD).toMatch(/\.select\('knowledge'\)/)
    })

    it('excludes archived entities, matching every other reader of this table', () => {
      expect(LOAD).toMatch(/\.is\('archived_at', null\)/)
    })

    it('passes the count into twinStrength as the second argument', () => {
      expect(LOAD).toMatch(/twinStrength\(data, productFactCount\)/)
    })

    // ⚠️ A FAILED PRODUCT-FACTS READ MUST NOT BLANK THE METER THE FIRST QUERY
    // ALREADY ANSWERED. There is deliberately no `if (productsError) return null`
    // for the second query — only the first read is a hard failure.
    it('a failed product read degrades the count, not the whole meter', () => {
      expect(LOAD).not.toMatch(/if \(productsError/)
    })
  })
})
