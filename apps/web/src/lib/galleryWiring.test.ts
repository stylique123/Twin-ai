// THE POLICY REACHES A SCREEN, OR IT IS A LIBRARY OF OPINIONS NOBODY HEARS.
//
// ⚠️ `galleryPolicy` HAS SHIPPED FOR WEEKS WITH NO CALLER OUTSIDE A TEST. The
// refusals, the seven priority groups and the readiness line were all correct
// and all invisible — the same defect this codebase keeps finding: a capability
// with no consumer, indistinguishable from a missing one.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'Gallery.tsx'), 'utf8')

describe('the page consults the policy', () => {
  it('builds the creator projection and runs the decisions', () => {
    expect(SRC).toMatch(/galleryCreatorView\(\{/)
    expect(SRC).toMatch(/decideGallery\(\{/)
  })

  it('loads what the transcript pass learned for the cards on this page', () => {
    expect(SRC).toMatch(/loadReferenceProfiles\(cards\.map\(\(c\) => c\.url\)\)/)
  })

  it('and the creator’s own library, since readiness is a claim about them', () => {
    expect(SRC).toMatch(/loadProductEntities\(\)/)
  })
})

describe('an unassessed library still behaves exactly as it does today', () => {
  it('falls through to the existing comparator when neither card is ranked', () => {
    // ⚠️ THE REGRESSION THAT WOULD HIT EVERY USER ON DAY ONE. 97% of cards have
    // no assessment; if the new ordering applied to them the whole feed would
    // reshuffle behind a batch that has not run.
    expect(SRC).toMatch(/if \(ra !== undefined && rb !== undefined\) return ra - rb/)
    expect(SRC).toMatch(/return compareByFit\(/)
  })

  it('and the readiness line is absent rather than zero', () => {
    // ⚖️ "0 of 0" ON EVERY CARD would be a confident negative about a video
    // nobody has read.
    expect(SRC).toMatch(/decisions\.byId\.get\(c\.id\)\?\.readiness && \(/)
  })
})

describe('a refusal removes the card from the feed', () => {
  it('filters the refused set out of what is shown', () => {
    expect(SRC).toMatch(/const refused = new Set\(decisions\.refused\.map/)
    expect(SRC).toMatch(/out = out\.filter\(\(c\) => !refused\.has\(c\.id\)\)/)
  })
})

describe('the enrichment can never cost somebody the gallery', () => {
  it('a failed profile read keeps today’s order', () => {
    // ⚠️ AN ENRICHMENT THAT CAN BREAK THE PAGE IS NOT AN ENRICHMENT.
    const load = SRC.slice(SRC.indexOf('loadReferenceProfiles('))
    expect(load.slice(0, 400)).toMatch(/\.catch\(/)
  })

  it('and a failed library read leaves an empty library, not a broken one', () => {
    const load = SRC.slice(SRC.indexOf('loadProductEntities()'))
    expect(load.slice(0, 400)).toMatch(/\.catch\(\(\) => setEntities\(\[\]\)\)/)
  })
})
