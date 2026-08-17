// THE STRICT RULE ONLY MATTERS IF THE PAGE ACTUALLY ASKS IT.
//
// ⚠️ `bestSuggestion` EXISTED FOR A WHOLE PR WITH NO READER, and a scoring module
// nothing consults is indistinguishable from the loose rule it replaced. The page
// was still rendering `suggestions.map(...)` — every row the extractor produced,
// which on a real account was five cards including Zoom, a content-series title
// and an opinion about how often to post on Instagram.
//
// ⚖️ SO THIS PINS THE WIRING, NOT THE SCORING. What counts as evidence is argued
// and tested in `an-opinion-is-not-a-product`; the only question here is whether
// the screen the creator opens is the one that asks.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RAW = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'pages', 'ProductLibrary.tsx'), 'utf8')

/** ⚠️ CODE ONLY, AND THIS FILE FAILED ON ITS OWN PROSE FIRST. The page's comment
 *  explaining why it must not disclose the rejected candidates QUOTES the
 *  disclosure it forbids, and a plain text search cannot tell an explanation from
 *  the thing it describes — exactly as the `start-dna` guard found. */
/** ⚠️ AND STRIPPING ONLY `//` LINES WAS NOT ENOUGH EITHER — the comment that
 *  quotes it is a JSX block, whose middle lines start with an ordinary word. */
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

describe('the page asks the strict question', () => {
  it('ranks through bestSuggestion rather than rendering the raw list', () => {
    expect(SRC).toMatch(/const picked = bestSuggestion\(suggestions, ties\)/)
    // ⚠️ THE EXACT LINE THAT PRODUCED THE WALL. If this ever comes back, the
    // scoring module is decoration again.
    expect(SRC).not.toMatch(/\{suggestions\.map\(/)
  })

  it('shows one candidate, never a section of them', () => {
    expect(SRC).toMatch(/\{\[picked\.item\]\.map\(/)
    expect(SRC).toMatch(/\{picked && \(/)
  })

  it('shows the evidence beside the suggestion', () => {
    // ⚖️ A suggestion that explains itself can be judged; one that only asserts
    // can be trusted or ignored, and a creator shown one bad guess picks ignored
    // for every later one.
    expect(SRC).toMatch(/picked\.verdict\.reasons\.join/)
  })

  it('does not disclose the rejected candidates, not even as a count', () => {
    // ⚠️ "3 more we are unsure about" is the wall wearing a disclosure — it hands
    // our uncertainty back to the creator to adjudicate.
    expect(SRC).not.toMatch(/suggestions\.length - 1|more we|others we/)
  })
})

describe('the creator who said they sell nothing', () => {
  it('passes their onboarding answer in as the filter', () => {
    expect(SRC).toMatch(/readOnboardingDraft\(localStorage, id\)\?\.commercialTies \?\? null/)
  })

  it('degrades open when there is no draft to read', () => {
    // ⚖️ THE TIES ARE LOCAL-STORAGE ONLY AND NEVER PERSISTED SERVER-SIDE, so on a
    // second device there is nothing to read. `null` means "never reached", which
    // `suggestionsAllowed` permits — silence must not be read as "I sell
    // nothing", because that would suppress a real product for a creator whose
    // only mistake was changing browser.
    expect(SRC).toMatch(/if \(!id\) return null/)
    expect(SRC).toMatch(/catch \{ return null \}/)
  })
})
