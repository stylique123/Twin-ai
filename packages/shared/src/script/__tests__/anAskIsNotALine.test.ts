import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spokenLineIsAnAsk, CREATOR_ASKS } from '../anAskIsNotALine'
import { SUBJECT_SOURCE_ASK } from '../subjectSource'

const EDGE = readFileSync(
  fileURLToPath(new URL('../../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url)),
  'utf8',
)

/**
 * ⚠️⚠️ THE PRODUCTION CASE, VERBATIM. One of 447 stored shot-list entries
 * carries Twin's interview question in `spoken_text`, which the Result screen
 * renders under "What to say". A creator reading the teleprompter says Twin's
 * question out loud, "One sentence is enough" included.
 */
const PRODUCTION_CASE =
  "What's something you personally did, learned, tried or went through that this video could be about?"
  + ' One sentence is enough. Most beginner bakers stall out because they never write it down.'

describe('the ask Twin puts to a creator is never a line she says', () => {
  it('catches the real production case', () => {
    expect(spokenLineIsAnAsk(PRODUCTION_CASE)).toBe(true)
  })

  // ⚠️ SUBSTRING, NOT EQUALITY — and this is the assertion that matters. The
  // production case has the ask followed by more text, so an equality check
  // would have missed the only real instance there is.
  it('catches the ask even with text appended, not only on its own', () => {
    expect(spokenLineIsAnAsk(SUBJECT_SOURCE_ASK)).toBe(true)
    expect(spokenLineIsAnAsk(`${SUBJECT_SOURCE_ASK} And then keep going.`)).toBe(true)
  })

  it('survives smart quotes and collapsed whitespace', () => {
    expect(spokenLineIsAnAsk(SUBJECT_SOURCE_ASK.replace("'", '’'))).toBe(true)
    expect(spokenLineIsAnAsk(`  ${SUBJECT_SOURCE_ASK.replace(/ /g, '  ')}  `)).toBe(true)
  })
})

// ⚠️⚠️ THE NEGATIVE CONTROLS ARE THE POINT, AND THEY ARE REAL. Every line below
// is a genuine call to action taken from the stored shot lists — TEN of them
// open with a question, and a creator would happily say all of them out loud.
// A matcher built on question marks or leading interrogatives would blank the
// lot. That is why this matches the KNOWN ASK and nothing else.
describe('a real call to action is not an ask, however much it looks like one', () => {
  for (const cta of [
    'What is the biggest thing holding you back from starting your home bakery? Let me know in the comments, and follow along for the next batch.',
    'What part of the baking process feels most overwhelming for you right now? Drop a comment below.',
    'How much does it cost you to bake one loaf right now? Tell me below, and do not forget to subscribe.',
    'Tell me if you have done this differently. I want to hear it.',
    'Share this with a friend who loves fresh bread, and let me know in the comments what step you want to see next.',
    'How to guarantee your business stays completely broke in 2026. Here are the 3 ways.',
  ]) {
    it(`stays silent on: ${cta.slice(0, 48)}…`, () => {
      expect(spokenLineIsAnAsk(cta)).toBe(false)
    })
  }

  it('and says nothing about empty or malformed input', () => {
    for (const x of ['', '   ', null, undefined, 42, {}]) expect(spokenLineIsAnAsk(x)).toBe(false)
  })
})

describe('the list is one definition, not a private re-spelling', () => {
  it('the shared matcher imports the ask rather than restating it', () => {
    expect(CREATOR_ASKS).toContain(SUBJECT_SOURCE_ASK)
  })

  // ⚖️ THE EDGE CANNOT IMPORT @twinai/shared, so it mirrors — and the mirror is
  // rebuilt from the shipped source here rather than trusted.
  it('the edge copy matches on the same ask, by substring', () => {
    const m = EDGE.match(/const SUBJECT_SOURCE_ASK_INLINE =\s*\n\s*"([^"]+)"/)
    expect(m, 'the inline ask must be findable').not.toBeNull()
    expect(m![1]).toBe(SUBJECT_SOURCE_ASK)
    expect(EDGE).toContain('hay.includes(normAskInline(SUBJECT_SOURCE_ASK_INLINE))')
  })

  it('the edge refusal is merged into entFails at BOTH sites, not just the first', () => {
    const wired = EDGE.split('...askAsLineFailuresInline(declared),').length - 1
    expect(wired).toBe(2)
  })

  it('and the counter is emitted so zero and absent stay distinguishable', () => {
    expect(EDGE).toContain('ask_as_line_gaps: askAsLineFailuresInline(declared).length,')
  })
})
