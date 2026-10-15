// Template skeleton (code-filled writer brief). Every fixture here is made up.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import type { LedgerItem } from '../inventionGate.js'
import { T1, T3, T4 } from '../templates/templateData.js'
import { planTemplate, renderTemplateBlock } from '../templates/scriptTemplates.js'
import { renderTemplateSkeleton, skeletonLines, TEMPLATE_SKELETON_MODE } from '../templates/templateSkeleton.js'

const item = (o: Partial<LedgerItem> & Pick<LedgerItem, 'id' | 'origin'>): LedgerItem => ({
  product_id: null, field: null, text: 'a made-up line of material', numbers: [], first_party: true, live: false, source_label: o.origin, ...o,
})

const t1Ledger: LedgerItem[] = [
  item({ id: 'f1', origin: 'her_fact', field: 'topic', text: 'Keeping a fictional sourdough starter alive in a cold flat.' }),
  item({ id: 'f2', origin: 'her_fact', text: 'Feed the made-up starter at the same hour every day.' }),
  item({ id: 'f3', origin: 'her_fact', text: 'Keep the jar on top of the fridge where it is warmer.' }),
  item({ id: 'f4', origin: 'her_fact', text: 'Use a rubber band to mark the rise level.' }),
  item({ id: 's1', origin: 'her_story', text: 'I [once] forgot mine for a week and it still came back.' }),
]
const t3Ledger: LedgerItem[] = [
  item({ id: 'm1', origin: 'her_story', text: 'The night my imaginary candle stall sold out in an hour.' }),
  item({ id: 'o1', origin: 'offer', text: 'Hand-poured fictional candles, on my site.' }),
]
const t4Ledger: LedgerItem[] = [
  item({ id: 'p1', origin: 'her_fact', text: 'Made-up houseplant leaves turning yellow in winter.' }),
  item({ id: 'c1', origin: 'her_fact', text: 'Overwatering when the light drops is the usual cause.' }),
  item({ id: 'x1', origin: 'her_fact', text: 'Water only when the top two centimetres are dry.' }),
]
const fixtures = [
  { t: T1, ledger: t1Ledger, profile: 'sprint' as const },
  { t: T3, ledger: t3Ledger, profile: 'standard' as const },
  { t: T4, ledger: t4Ledger, profile: 'sprint' as const },
]

describe('template skeleton', () => {
  it('contains the ledger text for every filled slot, in beat order', () => {
    for (const { t, ledger, profile } of fixtures) {
      const plan = planTemplate(t, ledger)
      const out = renderTemplateSkeleton(plan, profile, ledger)
      for (const s of plan.slots.filter((x) => x.item_id)) {
        const text = ledger.find((it) => it.id === s.item_id)!.text.replace(/[[\]]/g, '')
        expect(out).toContain(text)
      }
      expect(out).toContain('Keep every fact, add none, keep the order')
    }
  })
  it('has no placeholders or brackets', () => {
    for (const { t, ledger, profile } of fixtures) {
      const out = renderTemplateSkeleton(planTemplate(t, ledger), profile, ledger)
      expect(out).not.toMatch(/[[\]{}<>]/)
      expect(out).not.toMatch(/your answer|not on file|leave it out/i)
    }
  })
  it('omits unfilled slots; required ones become questions to her', () => {
    const plan = planTemplate(T3, t3Ledger)
    expect(plan.questions.length).toBeGreaterThan(0)
    const lines = skeletonLines(plan, t3Ledger)
    expect(lines.length).toBe(plan.slots.filter((s) => s.item_id).length)
    expect(lines.map((l) => l.item_id)).toEqual(['m1', 'o1'])
  })
  it('keeps the hook shapes and the promised count', () => {
    const plan = planTemplate(T1, t1Ledger)
    const out = renderTemplateSkeleton(plan, 'sprint', t1Ledger)
    for (const id of T1.hook_shapes) expect(out).toContain(id)
    const builds = plan.slots.filter((s) => s.item_id && T1.beats[s.beat]!.role === 'build').length
    expect(out).toContain(`Hook promises exactly ${builds}`)
  })
  it('is at least 50% shorter than the prose block on the fixtures', () => {
    let before = 0
    let after = 0
    for (const { t, ledger, profile } of fixtures) {
      const plan = planTemplate(t, ledger)
      before += renderTemplateBlock(plan, profile, ledger).length
      after += renderTemplateSkeleton(plan, profile, ledger).length
    }
    console.log(`template block chars: before=${before} after=${after}`)
    expect(after).toBeLessThanOrEqual(before * 0.5)
  })
  it('the edge uses the skeleton, records the mode, and copies are generated', () => {
    expect(TEMPLATE_SKELETON_MODE).toBe('skeleton')
    const src = readFileSync(new URL('../../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url), 'utf8')
    expect(src).toMatch(/templatePlan \? `\\n\\n\$\{renderTemplateSkeleton\(/)
    expect(src).toContain('mode: TEMPLATE_SKELETON_MODE')
    const a = readFileSync(new URL('../templates/templateSkeleton.ts', import.meta.url), 'utf8')
    const b = readFileSync(new URL('../../../../../supabase/functions/_shared/templateSkeleton.ts', import.meta.url), 'utf8')
    expect(b.split('\n').slice(4).join('\n').replace(/from '\.\/(\w+)\.ts'/g, "from './$1.js'"))
      .toBe(a.replace(/from '\.\.\/(\w+)\.js'/g, "from './$1.js'"))
  })
})
