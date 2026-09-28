// ROUND 2, PARTS 3 AND 4 — PERMANENT REGRESSIONS. Re-run whenever the writer,
// fact selection or questioning changes. These pin every deterministic step;
// the model-written script itself is checked by the live eval (script:eval).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { planUseItems, defaultExcluded } from '../planUse'
import { purposeShape, PURPOSE_SHAPE_DIRECTIVE } from '../purposeShape'
import { cleanIdeaRead, IDEA_Q_SYSTEM } from '../ideaQuestions'

const EDGE = readFileSync(resolve(__dirname, '../../../../../supabase/functions/generate-blueprint/index.ts'), 'utf8')

// ── PART 4: the thin, purely personal paragraph ────────────────────────────
const THIN = 'Running a coffee roastery from my home is messy, and you just figure it out step by step.'

// Realistic stored facts from the test account: none of these belong in it.
const STORE = [
  { id: 'cup', kind: 'claim', source: 'caption', text: 'Our Ethiopia scored 88 points at cupping' },
  { id: 'inv', kind: 'claim', source: 'transcript', text: 'We had zero inventory left after the holiday rush' },
  { id: 'move', kind: 'experience', source: 'transcript', text: 'We relocated the whole business from Denver to Farmington' },
  { id: 'num', kind: 'claim', source: 'caption', text: 'We roast 40 pounds a week' },
  { id: 'mine', kind: 'experience', source: 'asked', text: 'Roasting at home means I plan around my kitchen and my kids' },
]

describe('Part 4: the thin sentence stays thin', () => {
  it('purpose reads as "your story" and nothing is sold', () => {
    const read = cleanIdeaRead({ purpose: 'personal_brand', confidence: 0.7, signal: 'Running a coffee roastery', questions: [] }, THIN)
    expect(JSON.stringify(read.purpose)).toMatch(/personal_brand/)
    // A sell guess needs a buy/order/book/try signal the sentence does not have.
    const sell = cleanIdeaRead({ purpose: 'sell', confidence: 0.9, signal: 'coffee roastery', questions: [] }, THIN)
    expect(JSON.stringify(sell.purpose ?? null)).not.toMatch(/sell/)
  })

  it('no product: the purpose adds no product shape', () => {
    expect(purposeShape('personal_brand', false)).toBeNull()
  })

  it('no unrelated stored fact starts ON: cup scores, zero inventory, the move, numbers', () => {
    const items = planUseItems(STORE, THIN)
    const off = new Set(defaultExcluded(items))
    for (const id of ['cup', 'inv', 'move', 'num']) expect(off.has(id), id).toBe(true)
  })
})

// ── PART 3: the guessed purpose decides the shape ──────────────────────────
describe('Part 3: purpose drives structure, not just a label', () => {
  it('each purpose selects exactly one of the three shapes when a product is in play', () => {
    expect(purposeShape('personal_brand', true)).toBe('story_led')
    expect(purposeShape('sell', true)).toBe('product_led')
    expect(purposeShape('entertain', true)).toBe('equal')
  })

  it('the three directives say which thread opens and how it closes', () => {
    expect(PURPOSE_SHAPE_DIRECTIVE.story_led).toMatch(/open on her personal thread[\s\S]*close by inviting the viewer to relate/i)
    expect(PURPOSE_SHAPE_DIRECTIVE.product_led).toMatch(/open on the product[\s\S]*close product-forward/i)
    expect(PURPOSE_SHAPE_DIRECTIVE.equal).toMatch(/no hard pitch[\s\S]*close on connection/i)
  })

  it('the writer receives the same directives (parity) and appends one when a product is present', () => {
    for (const d of Object.values(PURPOSE_SHAPE_DIRECTIVE)) expect(EDGE).toContain(d)
    expect(EDGE).toMatch(/PURPOSE_SHAPE_BY_GOAL_INLINE\[videoGoal\]/)
    expect(EDGE).toMatch(/mentionLine \+= `\\n- \$\{PURPOSE_SHAPE_INLINE\[shapeKey\]\}`/)
  })
})

// ── 2.3 and Part 6 (lower priority, pinned anyway) ─────────────────────────
describe('question tone and invented colour', () => {
  it('the question matches her tone, not a default "mess or mistake"', () => {
    expect(IDEA_Q_SYSTEM).toMatch(/Match her tone/)
  })
  it('the writer is told never to add timeframes or sensory colour she did not give', () => {
    expect(EDGE).toMatch(/NO INVENTED COLOUR/)
  })
})
