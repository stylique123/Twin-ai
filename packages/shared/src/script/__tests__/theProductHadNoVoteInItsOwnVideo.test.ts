import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const EDGE = readFileSync(
  join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'functions', 'generate-blueprint', 'index.ts'),
  'utf8',
)

/**
 * ⚠️⚠️ THE PRODUCT THE VIDEO IS ABOUT WAS NOT PART OF "WHAT THIS VIDEO IS
 * ABOUT".
 *
 * Knowledge relevance is lexical overlap with `aboutTerms`, and `aboutTerms`
 * was built from `reference_note` and `brief.idea` — what the creator TYPED —
 * and nothing about the product they picked from their own library. On a
 * product-led video, where the idea box is often a word or empty, relevance
 * scored against almost nothing and the ranking fell through to `times_seen`:
 * the belief they repeat most often, whatever this video is for.
 *
 * ⚖️ THE OWNER'S ISSUE 2 INSTANCE WAS NOT THIS. A Daisy Candle video got the
 * peony-wedding order with THREE rows in the store — three items against ten
 * slots, so everything was supplied and relevance could not choose. That one
 * was the empty shelf. But with a full store the ranking decides, and until
 * this the product had no vote in it.
 */
describe('the product counts toward what the video is about', () => {
  it('feeds the entity name, offer and summary into the relevance terms', () => {
    expect(EDGE).toMatch(/entityAbout\?\.name \?\? ''/)
    expect(EDGE).toMatch(/entityAbout\?\.offer \?\? ''/)
    expect(EDGE).toMatch(/entityAbout\?\.creator_summary \?\? ''/)
  })

  it('keeps what the creator typed, rather than replacing it', () => {
    // Re-pointed: `ranked` is now the story gate's output (item 32, storyRotation.ts).
    const block = EDGE.slice(EDGE.indexOf('const entityAbout'), EDGE.indexOf('const ranked = storyGate.kept'))
    expect(block).toContain('reference_note')
    expect(block).toContain("brief.idea ?? ''")
  })

  // ⚖️ STILL LEXICAL, STILL EXPLAINABLE. The comment beside it promises "why
  // did it say that" keeps an answer; a model call here would take that away.
  it('stays a word-overlap rule rather than becoming a judgement', () => {
    // Re-pointed: `ranked` is now the story gate's output (item 32, storyRotation.ts).
    const block = EDGE.slice(EDGE.indexOf('const entityAbout'), EDGE.indexOf('const ranked = storyGate.kept'))
    expect(block).toMatch(/toLowerCase\(\)\.split\(\/\[\^a-z0-9\]\+\//)
    expect(block).not.toMatch(/await |gemini|callModel/i)
  })

  // ⚠️ `ownedEntity` IS NULL WHEN THE CREATOR DECLINED A PRODUCT. Reading a
  // field off it must not throw a generation away.
  it('tolerates a video with no product attached', () => {
    expect(EDGE).toMatch(/const entityAbout = ownedEntity as/)
    expect(EDGE).toMatch(/\{ name\?: unknown; offer\?: unknown; creator_summary\?: unknown \} \| null/)
  })
})

/**
 * ⚠️ THE INSTRUCTION'S OWN EXAMPLE WAS THE PLACEHOLDER. It read "Hold product
 * at eye level" — so the model was shown "product" as the exemplar and echoed
 * it back, which is how run 3 of the owner's test shipped "Point one finger at
 * a specific spot on it." Measured: grounding (direction naming a real object)
 * ran 0-7% from Sept 1-18 and 40% on Sept 20, varying run to run on ONE
 * creator on ONE day.
 */
describe('the direction must name the thing in their hands', () => {
  it('forbids the placeholder nouns outright', () => {
    const line = EDGE.split('\n').find((l) => l.startsWith('- action_posing:')) ?? ''
    expect(line).toMatch(/NAME THE THING IN THEIR HANDS/)
    expect(line).toMatch(/never "it", "the product" or "the item"/)
  })

  // ⚖️ THE OLD EXEMPLAR SURVIVES ONLY AS A COUNTER-EXAMPLE. Leaving it as a
  // "good" example is what taught the placeholder in the first place.
  it('keeps "Hold product at eye level" only on the Bad side', () => {
    const line = EDGE.split('\n').find((l) => l.startsWith('- action_posing:')) ?? ''
    const bad = line.indexOf('Bad:')
    expect(bad).toBeGreaterThan(-1)
    expect(line.indexOf('Hold product at eye level')).toBeGreaterThan(bad)
  })

  it('shows a grounded example that names an object and a part of it', () => {
    const line = EDGE.split('\n').find((l) => l.startsWith('- action_posing:')) ?? ''
    expect(line).toMatch(/Good:/)
    expect(line).toMatch(/cracked tin|split seam/)
  })

  // ⚠️ AND IT MUST NOT INVENT A PROP FOR A VIDEO WITH NO PRODUCT — the same
  // rule `renderDirectionGuidance` states for its own menu.
  it('tells it what to do when no product is attached', () => {
    const line = EDGE.split('\n').find((l) => l.startsWith('- action_posing:')) ?? ''
    expect(line).toMatch(/name nothing you were not told exists/)
  })
})
