// THE OBJECTIVE AND ITS QUESTION ON ONE STABLE CARD (coffee report 3.4).
//
// It was a second "answer" screen: the objective list disappeared, the box
// resized, and Back / Start over did the same thing. The owner asked for one
// layout: the list stays, the chosen one is highlighted, its question sits
// directly below in a fixed-height slot. Executed: the expressions are lifted
// from V2Building and run.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const SRC = readFileSync(join(REPO, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')

type Q = { field: string; options?: unknown[] }
function loadSplit() {
  const start = SRC.indexOf('  const objectiveInline = ')
  const end = SRC.indexOf('  const hasTwoBlocks = ', start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const js = transformSync(`function __split(isProductSubject, pooledQuestion, visibleAsk, askStep, setAskStep, isChip) {
    ${SRC.slice(start, end)}
    return { objectiveInline, onAnswerStep, decisions, commercial }
  }`, { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return __split`)() as (
    p: boolean, pq: unknown, v: Q[], s: string, set: () => void, c: (q: Q) => boolean,
  ) => { objectiveInline: boolean; onAnswerStep: boolean; decisions: Q[]; commercial: Q[] }
}

const isChip = (q: Q) => Array.isArray(q.options)
const ASK: Q[] = [
  { field: 'video_goal', options: [] },
  { field: 'selected_product', options: [] },
  { field: 'claims' },
  { field: 'cta' },
]
const split = loadSplit()
const fields = (qs: Q[]) => qs.map((q) => q.field)

describe('the objective and its question share one card', () => {
  it('keeps the objective chips on screen and never switches to a second step', () => {
    const r = split(true, { id: 'sell.why_now' }, ASK, 'answer', () => {}, isChip)
    expect(r.objectiveInline).toBe(true)
    expect(r.onAnswerStep).toBe(false)
    expect(fields(r.decisions)).toEqual(['video_goal', 'selected_product'])
    expect(fields(r.commercial)).not.toContain('claims')
    expect(fields(r.commercial)).toContain('cta')
  })

  it('renders the question in a fixed-height slot right under the chips', () => {
    expect(SRC).toMatch(/data-testid="objective-question-slot"/)
    expect(SRC).toMatch(/min-h-\[8\.5rem\]/)
    expect(SRC).toMatch(/Pick what this video should do, and its one question appears here\./)
  })

  it('no pooled question keeps claims with the other boxes', () => {
    for (const [p, pq] of [[true, null], [false, { id: 'x.y' }]] as const) {
      const r = split(p, pq, ASK, 'choose', () => {}, isChip)
      expect(r.objectiveInline).toBe(false)
      expect(fields(r.commercial)).toContain('claims')
    }
  })

  it('submitting sends the pooled question id with the answer', () => {
    expect(SRC).toMatch(/answersRef\.current\.objective_question_id = pooledQuestion\.id/)
    expect(SRC).toMatch(/answersRef\.current\.objective_product_key = objectiveProductKey\(liveProductId\)/)
  })
})
