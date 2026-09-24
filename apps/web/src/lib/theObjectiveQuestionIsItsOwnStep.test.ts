// THE OBJECTIVE'S QUESTION IS ITS OWN STEP, AFTER THE CHOICE, WITH BACK.
//
// It used to render on the same card as the objective chips, so the question
// changed under her finger as she tapped. The split is executed here: the
// `decisions`/`commercial` expressions are lifted from V2Building and run.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const SRC = readFileSync(join(REPO, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')

type Q = { field: string; options?: unknown[] }
function loadSplit() {
  const start = SRC.indexOf('  const splitObjectiveStep = ')
  const end = SRC.indexOf('  const hasTwoBlocks = ', start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const js = transformSync(`function __split(isProductSubject, pooledQuestion, visibleAsk, askStep, isChip) {
    ${SRC.slice(start, end)}
    return { splitObjectiveStep, onAnswerStep, decisions, commercial }
  }`, { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return __split`)() as (
    p: boolean, pq: unknown, v: Q[], s: 'choose' | 'answer', c: (q: Q) => boolean,
  ) => { splitObjectiveStep: boolean; onAnswerStep: boolean; decisions: Q[]; commercial: Q[] }
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

describe('choosing and answering are separate steps', () => {
  it('step one shows the objective chips and NOT the objective question', () => {
    const r = split(true, { id: 'sell.why_now' }, ASK, 'choose', isChip)
    expect(r.splitObjectiveStep).toBe(true)
    expect(fields(r.decisions)).toEqual(['video_goal', 'selected_product'])
    expect(fields(r.commercial)).not.toContain('claims')
    expect(fields(r.commercial)).toContain('cta')
  })

  it('step two shows ONLY the objective question, no selection chips', () => {
    const r = split(true, { id: 'sell.why_now' }, ASK, 'answer', isChip)
    expect(r.decisions).toEqual([])
    expect(fields(r.commercial)).toEqual(['claims'])
  })

  it('no pooled question (objective not chosen yet, or not a product build) keeps the single card', () => {
    for (const [p, pq] of [[true, null], [false, { id: 'x.y' }]] as const) {
      const r = split(p, pq, ASK, 'answer', isChip)
      expect(r.splitObjectiveStep).toBe(false)
      expect(fields(r.commercial)).toContain('claims')
    }
  })

  it('the card offers Next on step one, and Back plus Create on step two', () => {
    expect(SRC).toMatch(/splitObjectiveStep && askStep === 'choose' \? 'Next' : 'Create my version'/)
    expect(SRC).toMatch(/onClick=\{\(\) => setAskStep\('choose'\)\}[^>]*>Back</)
    expect(SRC).toMatch(/if \(splitObjectiveStep && askStep === 'choose'\) \{\s+setAskStep\('answer'\)\s+return/)
  })

  it('submitting sends the pooled question id with the answer', () => {
    expect(SRC).toMatch(/answersRef\.current\.objective_question_id = pooledQuestion\.id/)
    expect(SRC).toMatch(/answersRef\.current\.objective_product_key = objectiveProductKey\(liveProductId\)/)
  })
})
