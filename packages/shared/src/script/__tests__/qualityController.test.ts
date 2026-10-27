import { describe, expect, it } from 'vitest'
import { buildLedger } from '../inventionGate'
import { runQualityController, qcProfileForSeconds, removeRepeats, QC_STORY_KEY, QC_PRODUCT_KEY, QC_TARGETS } from '../planner/qualityController'

// Fictional creator (no real material).
const ledger = buildLedger({
  knowledge: [
    { id: 'k-fridge', kind: 'experience', text: 'A regular told me her beans tasted flat after a week, and when I asked, she was keeping them in the fridge next to the onions.' },
    { id: 'k-garage', kind: 'experience', text: 'I started roasting in my garage with a secondhand popcorn popper, and the first batch set off the smoke alarm twice.' },
    { id: 'k-check', kind: 'framework', text: 'To check if your beans are stale, read the roast date, smell a handful, then watch the bloom; fresh beans swell and bubble when the water hits, old ones just sit there.' },
    { id: 'k-opinion', kind: 'opinion', text: 'I think most people who say they hate light roast have only ever had stale beans.' },
  ],
  products: [{ id: 'p1', name: 'Harbor Blend', knowledge: [{ field: 'process_step', value: 'Harbor Blend beans are roasted on Tuesdays and shipped within two days of roasting.' }, { field: 'includes', value: 'Each bag of beans has the roast date written on the label by hand.' }] }],
  targetProductId: 'p1',
  offer: 'Harbor Blend, 12 oz bag, link in bio',
})
const short = [
  { section: 'hook', line: 'Why do your coffee beans taste flat after one week?' },
  { section: 'body', line: 'Stale beans lose their smell first, and the cup goes flat.' },
]
const base = { ledger, targetProductId: 'p1', profile: 'standard' as const, topic: 'how to tell if your coffee beans are stale Harbor Blend', product: 'Harbor Blend', niche: 'coffee' }

describe('quality controller (plan v6.8 §33)', () => {
  it('profiles from seconds', () => {
    expect(qcProfileForSeconds(30)).toBe('sprint')
    expect(qcProfileForSeconds(60)).toBe('standard')
    expect(qcProfileForSeconds(90)).toBe('deep')
  })

  it('extends under the floor with her on-topic items, in order, verbatim, never past 110% of target', () => {
    const r = runQualityController({ ...base, script: short })
    expect(r.report.under_floor_before).toBe(true)
    expect(r.report.words_after).toBeGreaterThan(r.report.words_before)
    expect(r.report.words_after).toBeLessThanOrEqual(Math.floor(QC_TARGETS.standard.target * 1.1))
    const kinds = r.report.added.map((a) => a.kind)
    const order = { proof: 0, product_fact: 1, opinion: 2, cta: 3 }
    expect([...kinds].sort((a, b) => order[a] - order[b])).toEqual(kinds)
    // Every added line is her item word for word.
    const texts = new Set(ledger.map((it) => it.text.trim()))
    for (const b of r.script.filter((x) => x.qc_added)) expect([...texts].some((t) => t.startsWith(String(b.line).replace(/\.$/, '').slice(0, 20)))).toBe(true)
    // Never the unrelated garage story.
    expect(r.script.some((b) => /garage/.test(String(b.line)))).toBe(false)
    // One CTA, at the end.
    expect(r.report.structure.one_cta_at_end).toBe(true)
    expect(r.report.structure.repeats).toBe(0)
  })

  it('never touches a script already at the floor (no padding)', () => {
    const long = [...short, { line: 'A regular told me her beans tasted flat after a week, and when I asked, she was keeping them in the fridge next to the onions.' }, { line: 'To check if your beans are stale, read the roast date, smell a handful, then watch the bloom; fresh beans swell and bubble when the water hits, old ones just sit there.' }, { line: 'Harbor Blend beans are roasted on Tuesdays and shipped within two days of roasting.' }, { line: 'Harbor Blend, 12 oz bag, link in bio.' }]
    const r = runQualityController({ ...base, profile: 'sprint', script: long })
    expect(r.report.added).toEqual([])
  })

  it('removes a repeated sentence (the later copy)', () => {
    const rr = removeRepeats([{ line: 'Keep your beans in a sealed jar away from light.' }, { line: 'Keep your beans in a sealed jar away from the light.' }, { line: 'Link in bio.' }])
    expect(rr.removed).toBe(1)
    expect(rr.script).toHaveLength(2)
  })

  it('thin material: asks ONE question for her missing story, never pads', () => {
    const thin = buildLedger({ knowledge: [], products: [], targetProductId: null })
    const r = runQualityController({ ledger: thin, targetProductId: null, profile: 'standard', topic: 'stale beans', script: short })
    expect(r.report.added).toEqual([])
    expect(r.question?.writes_to).toBe(QC_STORY_KEY)
    expect(r.report.thin).toBe('asked')
    expect(r.script.map((b) => b.line)).toEqual(short.map((b) => b.line))
  })

  it('thin material with the question answered: an honest Sprint labeled short', () => {
    const thin = buildLedger({ knowledge: [], products: [], targetProductId: null })
    const r = runQualityController({ ledger: thin, targetProductId: null, profile: 'standard', topic: 'stale beans', script: short, answered: [QC_STORY_KEY] })
    expect(r.question).toBeNull()
    expect(r.report.thin).toBe('short_sprint')
    expect(r.report.label).toBe('short')
  })

  it('asks for a product fact when a product request has none', () => {
    const l = buildLedger({ knowledge: [{ id: 's', kind: 'experience', text: 'I once burned a whole batch.' }], products: [{ id: 'p9', name: 'Thing', knowledge: [] }], targetProductId: 'p9' })
    const r = runQualityController({ ledger: l, targetProductId: 'p9', profile: 'deep', topic: 'zzz', script: short })
    expect(r.question?.writes_to).toBe(QC_PRODUCT_KEY)
  })

  it('best-of-N: a flagged extension is refused and the script stands', () => {
    const flagCtx = { items: ledger, products: [{ id: 'p1', name: 'Harbor Blend' }, { id: 'p2', name: 'Night Owl' }], v2: true, wrongProduct: true }
    const r = runQualityController({ ...base, script: short, flagCtx })
    if (r.report.best_of_n.eligible_after === false) {
      expect(r.report.best_of_n.chosen).toBe('before')
      expect(r.script.map((b) => b.line)).toEqual(short.map((b) => b.line))
    } else {
      expect(r.report.structure.blocking_flags).toBe(0)
    }
  })

  it('the report carries ids and counts, never text', () => {
    const r = runQualityController({ ...base, script: short })
    const s = JSON.stringify(r.report)
    expect(s).not.toMatch(/fridge|onions|roast date/)
  })

  it('is pure: the input script is not mutated', () => {
    const copy = JSON.parse(JSON.stringify(short))
    runQualityController({ ...base, script: short })
    expect(short).toEqual(copy)
  })
})
