import { describe, it, expect } from 'vitest'
import { thinNextSteps, thinStopBody, missingNeedKinds, NEXT_STEP_PLACES, type WriterItem } from '../factsOnly'

const routes = new Set(Object.values(NEXT_STEP_PLACES).map((p) => p.path))

describe('facts-only thin stop: next steps when nothing is left to ask', () => {
  it('a product request points at the Product Library for that product', () => {
    const steps = thinNextSteps({ note: 'why the moss bowl', product: { id: 'p1', name: 'Moss Bowl' } }, ['product_fact'])
    expect(steps[0]).toMatchObject({ kind: 'product_fact', where: { path: '/products' } })
    expect(steps[0]!.suggestion).toContain('Moss Bowl')
  })
  it('a story request asks for a real moment, then a video, then another topic', () => {
    const steps = thinNextSteps({ note: 'the time my kiln nearly broke' })
    expect(steps.map((s) => s.kind)).toEqual(['story', 'video', 'other_topic'])
    expect(steps[0]!.suggestion).toContain('the time my kiln nearly broke')
    expect(steps[2]!.where.path).toBe('/brain')
  })
  it('never names a product step without a product; at most 4; every path is a real app route', () => {
    const steps = thinNextSteps({ note: 'how many results proof why steps' }, ['product_fact', 'number', 'proof', 'steps', 'opinion'])
    expect(steps.some((s) => s.kind === 'product_fact')).toBe(false)
    expect(steps.length).toBeLessThanOrEqual(4)
    for (const s of steps) expect(routes.has(s.where.path)).toBe(true)
  })
  it('missingNeedKinds drops a need her material covers', () => {
    const items: WriterItem[] = [{ ref: 'F1', id: 'k1', origin: 'product_fact', text: 'The moss bowl costs 40 dollars', layer: 'fact', productId: 'p1' }]
    const req = { note: 'moss bowl', product: { id: 'p1', name: 'Moss Bowl' } }
    expect(missingNeedKinds(req, items, { ledger: [{ id: 'k1', product_id: 'p1' } as never] })).not.toContain('product_fact')
    expect(missingNeedKinds(req, [])).toContain('product_fact')
  })
  it('the 409 body keeps the existing shape and adds next_steps and remedies', () => {
    const steps = thinNextSteps({ note: 'my first market' })
    const b = thinStopBody(steps, true)
    expect(b).toMatchObject({ code: 'NEEDS_STORY', facts_only: true, thin: true, questions: [] })
    expect(b.next_steps).toEqual(steps)
    expect((b.remedies as string[])[0]).toMatch(/\(Create\)$/)
    expect(thinStopBody(steps, false)).not.toHaveProperty('thin')
  })
})
