// Plan v5.3 §19: narrow repair, the first-person claim check, bare-fact hooks
// and repeats by meaning. Trial only; off, nothing changes. Every fixture is
// MADE UP (a fictional bike-repair creator, newsletter "Spoke Notes"); the
// judges are fakes. No model is called.
import { describe, it, expect } from 'vitest'
import {
  inventedElement, narrowRepairs, narrowReplacement, elementReason, dedupByStoryItem, storyRelation, runInventionGate, extractSentences,
  type ClassifiedSentence, type GateBlueprint, type GateSentence, type LedgerItem,
} from '../inventionGate.js'
import { runHookEngine, hookClaimOk, isBareFactHook } from '../hooks/hookEngine.js'

const item = (o: Partial<LedgerItem> & Pick<LedgerItem, 'id' | 'origin' | 'text'>): LedgerItem => ({
  product_id: null, field: null, numbers: [], first_party: true, live: false, source_label: o.origin, ...o,
})
const SPOKE = 'p-spoke'
const products = [{ id: SPOKE, name: 'Spoke Notes' }]
const STORY = 'My first commute ended with a snapped chain halfway up the bridge because I never oiled it.'
const ledger: LedgerItem[] = [
  item({ id: 'h1', origin: 'her_story', text: STORY }),
  item({ id: 'h2', origin: 'her_fact', text: 'I think most chain noise comes from dirt, not from a worn chain.' }),
  item({ id: 'p1', origin: 'product_fact', product_id: SPOKE, field: 'description', text: 'Spoke Notes: One email every Friday with one repair walked through' }),
  item({ id: 'p2', origin: 'product_fact', product_id: SPOKE, field: 'price', text: 'Spoke Notes: Free' }),
]
const sent = (text: string, i = 0): GateSentence => ({ i, surface: 'script', at: i, k: 0, text } as GateSentence)
const row = (o: Partial<ClassifiedSentence>): ClassifiedSentence => ({
  i: 0, surface: 'script', class: 'N', claim_types: [], item_ids: [], reason: 'truism', near: [], judged: true,
  fast_class: 'N', strong_class: 'N', verdict: 'pass', at: 0, k: 0, ...o,
} as ClassifiedSentence)
const narrow = (text: string, o: Partial<ClassifiedSentence>) => narrowRepairs([row(o)], [sent(text)], ledger, products)[0]!

// The four under-flagged shapes (fictional lines of the same shape).
const SHAPES: Array<[string, string]> = [
  ['experience', 'In my experience, chain wax belongs in a race workshop, while a commuter just needs a rag.'],
  ['habit', 'I check brake pads patiently because I think most chain noise comes from dirt.'],
  ['positioning', 'Here is the thing, I talk about commuting, rain gear and flat fixes, not racing.'],
  ['origin', 'That is why Spoke Notes exists.'],
]

describe('1-2. the first-person claim shapes are caught even when the judges call them truisms', () => {
  for (const [shape, text] of SHAPES) {
    it(`${shape}: found by the pattern`, () => {
      expect(inventedElement(text, ledger, products)?.element).toBe(shape)
    })
    it(`${shape}: both judges say truism (N) → still a CHECK THIS LINE review line`, () => {
      const c = narrow(text, { class: 'N', fast_class: 'N', strong_class: 'N', reason: 'truism' })
      expect(c.verdict).toBe('review')
      expect(c.reason).toBe('first_person_claim')
    })
    it(`${shape}: both judges say I → blocked (repaired)`, () => {
      const c = narrow(text, { class: 'I', fast_class: 'I', strong_class: 'I', reason: 'no_item', verdict: 'block' })
      expect(c.verdict).toBe('block')
      expect(c.class).toBe('I')
    })
    it(`${shape}: one judge I → review, never dropped`, () => {
      const c = narrow(text, { class: 'G', fast_class: 'I', strong_class: 'S', reason: 'no_item', verdict: 'review' })
      expect(c.verdict).toBe('review')
      expect(c.class).not.toBe('I')
    })
  }
})

describe('controls: S, E and N lines are never flagged or dropped', () => {
  it('S: an origin line her own item backs is not flagged', () => {
    const own = [...ledger, item({ id: 'h3', origin: 'her_story', text: 'I started Spoke Notes because my neighbours kept asking me to fix their brakes.' })]
    expect(inventedElement('That is why I started Spoke Notes.', own, products)).toBeNull()
  })
  it('S: a stance in her own words is not flagged', () => {
    expect(inventedElement('I think most chain noise comes from dirt, not from a worn chain.', ledger, products)).toBeNull()
  })
  it('S: a habit a product item states is not flagged', () => {
    expect(inventedElement('I send one email every Friday with one repair walked through.', ledger, products)).toBeNull()
  })
  it('S: both judges S → passes untouched', () => {
    const c = narrow('My chain snapped halfway up the bridge.', { class: 'S', fast_class: 'S', strong_class: 'S', reason: 'entailed' })
    expect(c.verdict).toBe('pass')
    expect(c.class).toBe('S')
  })
  it('E: kept and flagged "check this line", never dropped', () => {
    const t = 'A dry chain wears out much faster on wet commutes.'
    expect(inventedElement(t, ledger, products)).toBeNull()
    const c = narrow(t, { class: 'E', fast_class: 'E', strong_class: 'E', reason: 'stronger_than_item' })
    expect(c.class).toBe('E')
    expect(c.verdict).toBe('review')
  })
  it('N: advice with a frequency word is not a claim', () => {
    expect(inventedElement('Wipe the chain after every single ride.', ledger, products)).toBeNull()
    expect(inventedElement('Real talk: make it a habit to check the pads every single week.', ledger, products)).toBeNull()
    const c = narrow('Stop riding with a dry chain.', { class: 'N', fast_class: 'N', strong_class: 'N', reason: 'advice' })
    expect(c.verdict).toBe('pass')
  })
  it('a both-I line with no invented element is a review line, not a drop', () => {
    const c = narrow('A dry chain squeaks on the bridge.', { class: 'I', fast_class: 'I', strong_class: 'I', reason: 'no_item', verdict: 'block' })
    expect(c.verdict).toBe('review')
    expect(c.class).not.toBe('I')
  })
  it('scaffolding stays blocked', () => {
    const c = narrow('made-up testimonial: great', { class: 'I', fast_class: 'I', strong_class: 'I', reason: 'scaffold_text', verdict: 'block', judged: false })
    expect(c.verdict).toBe('block')
  })
})

describe('invented frequency and named specifics', () => {
  it('a frequency no item states', () => {
    expect(inventedElement('Riders ask about squeaky brakes all the time.', ledger, products)?.element).toBe('frequency')
    expect(elementReason('frequency')).toBe('invented_frequency')
  })
  it('a frequency an item states is not flagged', () => {
    expect(inventedElement('Spoke Notes lands every Friday with one repair walked through, every week.', ledger, products)).toBeNull()
  })
  it('a tool or material no item names', () => {
    expect(inventedElement('I cut the old cable with a bench grinder.', ledger, products)?.element).toBe('named_specific')
    expect(inventedElement('The frame is titanium.', ledger, products)?.element).toBe('named_specific')
  })
  it('a tool an item names is not flagged', () => {
    const own = [...ledger, item({ id: 'h4', origin: 'her_fact', text: 'I keep a bench grinder in the garage for old cables.' })]
    expect(inventedElement('I cut the old cable with a bench grinder.', own, products)).toBeNull()
  })
})

describe('narrow replace: her item text verbatim, or drop', () => {
  it('takes the first near item unit not already said', () => {
    expect(narrowReplacement({ near: ['h1'], item_ids: [] }, ledger, [])).toBe(STORY)
    expect(narrowReplacement({ near: ['h1'], item_ids: [] }, ledger, [STORY])).toBe('')
  })
  it('the gate repairs only the element line both judges flag; the rest ships', async () => {
    const bp: GateBlueprint = { script: [
      { section: 'hook', line: 'My chain snapped halfway up the bridge.' },
      { section: 'build', line: 'In my experience, chain wax belongs in a race workshop.' },
      { section: 'turn', line: 'A dry chain squeaks on the bridge.' },
      { section: 'close', line: 'Get Spoke Notes free.' },
    ] } as GateBlueprint
    const judgeAllI = async (prompt: string) => {
      const block = prompt.split('SENTENCES:')[1] ?? ''
      const rows = [...block.matchAll(/^(\d+)\. \([a-z_]+[^)]*\) .*$/gm)]
      return JSON.stringify({ sentences: rows.map((m) => ({ i: Number(m[1]), class: 'I', item_ids: [], claim_types: [] })) })
    }
    let rewrites = 0
    const r = await runInventionGate({ blueprint: bp, ledger, products, targetProductId: SPOKE, holdAsks: true, narrowRepair: true, checkLines: true },
      { judge: judgeAllI, rewrite: async () => { rewrites++; return JSON.stringify({ rewrites: [] }) } })
    const lines = extractSentences(r.blueprint).filter((s) => s.surface === 'script').map((s) => s.text)
    expect(lines.some((t) => /in my experience/i.test(t))).toBe(false)
    expect(lines).toContain('A dry chain squeaks on the bridge.')
    expect(rewrites).toBe(0)
    expect((r.record.review_lines ?? []).length).toBeGreaterThan(0)
  })
})

describe('4. hooks: bare-fact shapes leave the picks; the first-person claim check runs on hooks', () => {
  it('bare-fact candidates are never picked under the trial; off, they may be', () => {
    const cands = [
      { shape: 'price_or_proof', text: 'Spoke Notes is free.' },
      { shape: 'stop_doing', text: 'Stop oiling a dirty chain before your commute.' },
      { shape: 'story_open', text: 'My first commute ended with a snapped chain.' },
    ]
    const on = runHookEngine(cands, ledger, { trial: true, noBareFact: true, products, targetProductId: SPOKE, request: 'chain care commute' })
    expect(on.pick.shapes).not.toContain('price_or_proof')
    const rec = on.record.candidates.find((c) => c.shape === 'price_or_proof')
    expect(rec?.ok).toBe(false)
    expect(isBareFactHook({ shape: 'x', source: 'fact_open' })).toBe(true)
  })
  it('a positioning or feeling hook with no item of hers fails the claim check', () => {
    expect(hookClaimOk('Here is who my newsletter is for, and who should skip it.', ledger, products).ok).toBe(false)
    expect(hookClaimOk('Snapping my first chain broke my heart.', ledger, products).ok).toBe(false)
    expect(hookClaimOk('My first commute ended with a snapped chain.', ledger, products).ok).toBe(true)
    const on = runHookEngine([{ shape: 'story_open', text: 'In my experience, wax beats grease on long tours.' }], ledger, { trial: true, claimCheck: true, products, targetProductId: SPOKE })
    expect(on.record.candidates[0]!.ok).toBe(false)
  })
})

describe('5. repeats by meaning (item-id overlap)', () => {
  it('a hook paraphrasing the story, the story verbatim, then a restatement → the hook and the verbatim one stay (panel 9: the hook is never dropped)', () => {
    const script = [
      { line: 'Halfway up the bridge my unoiled chain snapped on my first commute.' },
      { line: STORY },
      { line: 'So my chain snapped on the bridge, all because I never oiled it on that first commute.' },
      { line: 'Oil the chain every Sunday.' },
    ]
    const r = dedupByStoryItem(script, ledger)
    expect(r.record.dropped).toBe(1)
    expect(r.script.map((b) => b.line)).toEqual([script[0]!.line, STORY, 'Oil the chain every Sunday.'])
  })
  it('no verbatim telling: the paraphrases stay (word de-dup decides)', () => {
    const script = [{ line: 'Halfway up the bridge my unoiled chain snapped on my first commute.' }, { line: 'Oil the chain every Sunday.' }]
    expect(dedupByStoryItem(script, ledger).record.dropped).toBe(0)
  })
  it('a line from a different item is kept', () => {
    const script = [{ line: STORY }, { line: 'I think most chain noise comes from dirt, not from a worn chain.' }]
    expect(dedupByStoryItem(script, ledger).record.dropped).toBe(0)
    expect(storyRelation(STORY, STORY)).toBe('verbatim')
    expect(storyRelation('Oil the chain every Sunday.', STORY)).toBeNull()
  })
  it('the gate runs it under storyDedup', async () => {
    const bp: GateBlueprint = { script: [{ line: 'Oil the chain every Sunday.' }, { line: STORY }, { line: 'Halfway up the bridge my unoiled chain snapped on my first commute.' }, { line: 'Tell me how often you do yours.' }] } as GateBlueprint
    const judgeS = async (prompt: string) => {
      const block = prompt.split('SENTENCES:')[1] ?? ''
      const rows = [...block.matchAll(/^(\d+)\. \([a-z_]+[^)]*\) .*$/gm)]
      return JSON.stringify({ sentences: rows.map((m) => ({ i: Number(m[1]), class: 'S', item_ids: ['h1'], claim_types: [] })) })
    }
    const r = await runInventionGate({ blueprint: bp, ledger, products, targetProductId: SPOKE, holdAsks: true, storyDedup: true }, { judge: judgeS, rewrite: async () => '{"rewrites":[]}' })
    expect((r.blueprint.script as Array<{ line: string }>).map((b) => b.line)).toEqual(['Oil the chain every Sunday.', STORY, 'Tell me how often you do yours.'])
  })
})
