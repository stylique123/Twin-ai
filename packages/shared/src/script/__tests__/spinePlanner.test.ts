// The planner: one spine per script. Every fixture here is made up (fictional creators and products).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildLedger, contentWords, MAX_ASKS, type LedgerItem } from '../inventionGate.js'
import { T1, QUESTION_TEMPLATES } from '../templates/templateData.js'
import { planTemplate } from '../templates/scriptTemplates.js'
import { planSpine, renderPlanBlock, planRecord, checkPlanAdherence, mergeQuestions, BUILD_CAPACITY } from '../planner/spinePlanner.js'

const item = (o: Partial<LedgerItem> & Pick<LedgerItem, 'id' | 'origin'>): LedgerItem => ({
  product_id: null, field: null, text: 'a made-up line of material', numbers: [], first_party: true, live: false, source_label: o.origin, ...o,
})

// Fictional panel-style material: "Clay & Kiln" style pottery creator, made up.
const ledger: LedgerItem[] = [
  item({ id: 'k1', origin: 'her_story', text: 'My first glaze firing cracked every mug because I rushed the cooling. Since then I always let the kiln cool overnight.' }),
  item({ id: 'k2', origin: 'her_fact', text: 'I fire my glaze at cone six in a small electric kiln.' }),
  item({ id: 'k3', origin: 'her_fact', text: 'My cat sleeps on the studio chair every afternoon.' }),
  item({ id: 'p1', origin: 'product_fact', product_id: 'mug-a', field: 'process_step', text: 'Each mug is glazed by hand and fired twice in the kiln.' }),
  item({ id: 'p2', origin: 'product_fact', product_id: 'vase-b', field: 'price', text: 'The tall vase costs forty dollars.' }),
  item({ id: 'p3', origin: 'product_fact', product_id: 'mug-a', first_party: false, text: 'Glaze is dishwasher safe for the kiln mug.' }),
  item({ id: 'r1', origin: 'outside_research', first_party: false, text: 'Fast cooling is a common cause of glaze cracks in kiln firing.' }),
  item({ id: 'r2', origin: 'outside_research', first_party: false, text: 'Sourdough starters need daily feeding.' }),
  item({ id: 'offer', origin: 'offer', product_id: 'mug-a', text: 'The kiln mugs are in my shop.' }),
]
const request = { goal: 'educate', angle: 'teach_list', note: 'why my glaze cracked in the kiln' }

const allowedWords = (extra: string[] = []) => {
  const w = new Set<string>()
  for (const it of ledger) for (const x of contentWords(it.text)) w.add(x)
  for (const x of contentWords([request.goal, request.angle, request.note, ...extra].join(' '))) w.add(x)
  return w
}

describe('the spine', () => {
  const plan = planSpine({ request, ledger, targetProductId: 'mug-a' })
  it('is one sentence built only from ledger items or the request words', () => {
    expect(plan.spine).not.toBeNull()
    expect(plan.spine!.claim.match(/[.!?]/g)?.length ?? 0).toBeLessThanOrEqual(1)
    const allowed = allowedWords()
    for (const w of contentWords(plan.spine!.claim)) expect(allowed.has(w)).toBe(true)
    // A verbatim span of its cited item.
    const cited = ledger.find((it) => it.id === plan.spine!.item_ids[0])!
    expect(cited.text.startsWith(plan.spine!.claim.replace(/[.!?]$/, ''))).toBe(true)
  })
  it('comes from her first-party material, never outside research', () => {
    expect(plan.spine!.item_ids).toEqual(['k1'])
    expect(plan.spine!.source).toBe('item')
  })
  it('falls back to the request words when there is no first-party material', () => {
    const p = planSpine({ request, ledger: [item({ id: 'r1', origin: 'outside_research', first_party: false, text: 'Fast cooling cracks glaze.' })] })
    expect(p.spine!.source).toBe('request')
    expect(p.spine!.claim).toBe(request.note)
    expect(p.questions.length).toBeGreaterThan(0)
  })
  it('asks for the point when there is neither material nor a note', () => {
    const p = planSpine({ request: { goal: 'educate' }, ledger: [] })
    expect(p.spine).toBeNull()
    expect(p.beats.every((b) => b.item_ids.length === 0)).toBe(true)
    expect(p.questions.map((q) => q.text)).toContain(QUESTION_TEMPLATES.topic.text)
    expect(renderPlanBlock(p)).toBe('')
  })
})

describe('off-spine items are dropped, never stuffed in', () => {
  const plan = planSpine({ request, ledger, targetProductId: 'mug-a' })
  const used = new Set(plan.beats.flatMap((b) => b.item_ids))
  const reason = (id: string) => plan.dropped.find((d) => d.item_id === id)?.reason
  it('drops the unrelated fact and the unrelated outside item', () => {
    expect(reason('k3')).toBe('off_spine')
    expect(reason('r2')).toBe('off_spine')
    expect(used.has('k3')).toBe(false)
    expect(used.has('r2')).toBe(false)
  })
  it('drops another product\'s fact and an unconfirmed fact', () => {
    expect(reason('p2')).toBe('other_product')
    expect(reason('p3')).toBe('unconfirmed')
  })
  it('keeps supporting items in beats; every used item is the spine or serves it', () => {
    expect(used.has('k2')).toBe(true)
    expect(used.has('p1')).toBe(true)
    expect(used.has('r1')).toBe(true)
    for (const id of used) expect(plan.dropped.some((d) => d.item_id === id)).toBe(false)
    expect(plan.beats[0]!.role).toBe('hook')
    expect(plan.beats[0]!.item_ids).toEqual(['k1'])
  })
  it('respects the profile\'s build capacity (extra support is dropped as over budget)', () => {
    const p = planSpine({ request, ledger, targetProductId: 'mug-a', profile: 'sprint' })
    expect(p.beats.filter((b) => b.role === 'build').length).toBe(BUILD_CAPACITY.sprint)
    expect(p.dropped.some((d) => d.reason === 'over_budget')).toBe(true)
  })
  it('every ledger item is used or dropped with a reason', () => {
    const accounted = new Set([...used, ...plan.dropped.map((d) => d.item_id)])
    for (const it of ledger) expect(accounted.has(it.id)).toBe(true)
  })
})

describe('questions', () => {
  it('never more than three in total, deduped against existing ones', () => {
    const existing = [
      { text: 'What actually happened here?', writes_to: 'a' },
      { text: QUESTION_TEMPLATES.topic.text, writes_to: 'template.t1.topic' },
    ]
    const p = planSpine({ request: {}, ledger: [], existingQuestions: existing })
    // The topic question is already queued: no duplicate.
    expect(p.questions.find((q) => q.text === QUESTION_TEMPLATES.topic.text)).toBeUndefined()
    expect(existing.length + p.questions.length).toBeLessThanOrEqual(MAX_ASKS)
    const full = [1, 2, 3].map((n) => ({ text: `Made-up question ${n}?`, writes_to: `q${n}` }))
    expect(planSpine({ request: {}, ledger: [], existingQuestions: full }).questions).toHaveLength(0)
  })
  it('mergeQuestions dedupes by writes_to and text and caps at three', () => {
    const m = mergeQuestions([{ text: 'A?', writes_to: 'x' }], [{ text: 'a', writes_to: 'y' }, { text: 'B?', writes_to: 'x' }, { text: 'C?', writes_to: 'c' }, { text: 'D?', writes_to: 'd' }, { text: 'E?', writes_to: 'e' }])
    expect(m.map((q) => q.writes_to)).toEqual(['x', 'c', 'd'])
  })
  it('a plan with material asks nothing', () => {
    expect(planSpine({ request, ledger, targetProductId: 'mug-a' }).questions).toHaveLength(0)
  })
})

describe('with a template and a real ledger', () => {
  it('uses the template roles and keeps the template\'s items only when they serve the spine', () => {
    const l = buildLedger({
      knowledge: [{ id: 'k1', kind: 'story', text: 'I learned to pull espresso shots slowly at a fictional cafe.' }, { id: 'k2', kind: 'fact', text: 'Espresso shots taste sour when the grind is too coarse.' }, { id: 'k9', kind: 'fact', text: 'I collect vintage bicycles.' }],
      note: 'espresso shots for beginners',
    })
    const tp = planTemplate(T1, l)
    const p = planSpine({ request: { goal: 'educate', note: 'espresso shots for beginners' }, ledger: l, template: tp, existingQuestions: tp.questions })
    expect(p.beats.map((b) => b.role)[0]).toBe('hook')
    expect(p.beats.flatMap((b) => b.item_ids)).not.toContain('k9')
    expect(p.dropped.find((d) => d.item_id === 'k9')?.reason).toBe('off_spine')
    expect(tp.questions.length + p.questions.length).toBeLessThanOrEqual(MAX_ASKS)
  })
})

describe('record and brief', () => {
  const plan = planSpine({ request, ledger, targetProductId: 'mug-a' })
  it('records ids and counts only', () => {
    const r = planRecord(plan)
    expect(Object.keys(r).sort()).toEqual(['beat_count', 'dropped_count', 'questions', 'spine_item_ids', 'version'])
    expect(JSON.stringify(r)).not.toMatch(/glaze|kiln|mug/i)
    expect(r.beat_count).toBe(plan.beats.length)
  })
  it('the brief is short and names the spine', () => {
    const b = renderPlanBlock(plan)
    expect(b).toContain('SPINE:')
    expect(b.split('\n').length).toBeLessThanOrEqual(plan.beats.length + 3)
  })
})

describe('plan adherence post-check', () => {
  const plan = planSpine({ request, ledger, targetProductId: 'mug-a' })
  it('counts cited, transition/CTA and uncited beats', () => {
    const script = [
      { line: 'My first glaze firing cracked every mug.' },
      { line: 'Here is why.' },
      { line: 'I fire my glaze at cone six in an electric kiln.' },
      { line: 'Honestly the weather on the coast has been lovely for long walks lately.' },
      { line: 'The mugs are in my shop, link in bio.' },
    ]
    expect(checkPlanAdherence(script, plan, ledger)).toEqual({ beats: 5, cited: 3, transition: 1, uncited: 1 })
  })
})

describe('edge parity and trial gate', () => {
  const root = '../../../../../'
  it('the edge copy is generated from this source', () => {
    const a = readFileSync(new URL('../planner/spinePlanner.ts', import.meta.url), 'utf8')
    const b = readFileSync(new URL(`${root}supabase/functions/_shared/spinePlanner.ts`, import.meta.url), 'utf8')
    const body = b.split('\n').slice(4).join('\n').replace(/from '\.\/(\w+)\.ts'/g, "from './$1.js'")
    expect(body).toBe(a.replace(/from '\.\.\/(?:templates\/)?(\w+)\.js'/g, "from './$1.js'"))
  })
  it('the edge plans and records only under trialOn', () => {
    const src = readFileSync(new URL(`${root}supabase/functions/generate-blueprint/index.ts`, import.meta.url), 'utf8')
    const calls = [...src.matchAll(/planSpine\(/g)]
    expect(calls.length).toBe(1)
    expect(src.slice(calls[0]!.index! - 300, calls[0]!.index!)).toMatch(/if \(newOn\('planner'\)\) \{/) // releaseFlags: S0 default = trialOn
    expect(src).toMatch(/if \(newOn\('planner'\) && spinePlan && blueprint/)
    for (const fn of ['planRecord(', 'checkPlanAdherence(']) {
      const at = src.indexOf(fn)
      expect(src.slice(at - 1500, at)).toMatch(/if \(newOn\('planner'\) && spinePlan/)
    }
  })
})
