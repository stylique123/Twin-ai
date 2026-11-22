// Panel 14 verdict fixes (owner, 18 Nov): wrong-product facts, hooks that trace,
// thin scripts ask, story rotation, repeated openings, quality cleanup.
import { describe, it, expect } from 'vitest'
import {
  traceAndCut, traceHooks, productScope, otherProductWords, belongsElsewhere, scriptThin, thinQuestion,
  restingStoryIds, dropRepeatedOpening, decideFactsOnly, writerItems, openingOf, polishFactsOnly, stripFiller, type WriterItem,
} from '../factsOnly'

let n = 0
const fact = (text: string, origin = 'her_story', productId?: string, field?: string): WriterItem =>
  ({ ref: `F${++n}`, id: `k${n}`, origin, text, layer: 'fact', ...(productId ? { productId } : {}), ...(field ? { field } : {}) })

// Clay & Kiln (fictional panel account).
const MUG = { id: 'mug', name: 'Tide Mug' }
const BOWL = { id: 'bowl', name: 'Moss Bowl' }
const clay = [
  fact('A buyer at a craft fair picked up a mug, turned it over, and asked why the bottom was not glazed, so now I explain it on every label.'),
  fact('Before glazing I wax the foot, wipe a finger\'s width above it with a damp sponge, dip for three seconds, and let it dry overnight before it goes in the kiln.'),
  fact('$38 per mug', 'product_fact', 'mug', 'price'),
  fact('Holds about 12 oz', 'product_fact', 'mug', 'size'),
  fact('$46 per bowl', 'product_fact', 'bowl', 'price'),
  fact('Glazed in a green that pools darker at the rim', 'product_fact', 'bowl', 'process_step'),
  fact('Holds about 20 oz', 'product_fact', 'bowl', 'size'),
]
// Glow Lab (fictional panel account).
const CREAM = { id: 'calm-cream', name: 'Calm Cream' }
const BALM = { id: 'melt-balm', name: 'Melt Balm' }
const glow = [
  fact('I made the first jar of the moisturizer in my kitchen because every store cream I tried left my cheeks red by lunchtime.'),
  fact('My first batch separated in the jar overnight, and I threw out forty jars before I got the emulsion right.'),
  fact('When I read a label, I look for fragrance, parfum and essential oils first, then I patch-test on the inner arm for a few days.', 'her_story'),
  fact('50 ml glass jar', 'product_fact', 'calm-cream', 'size'),
  fact('Fragrance-free, with no essential oils', 'product_fact', 'calm-cream', 'includes'),
  fact('90 g tin', 'product_fact', 'melt-balm', 'size'),
  fact('A cleansing balm that rinses off with warm water', 'product_fact', 'melt-balm', 'includes'),
  fact('Made in small batches and poured by hand into each tin', 'product_fact', 'melt-balm', 'process_step'),
]
const beats = (...lines: string[]) => lines.map((line, i) => ({ section: i === lines.length - 1 ? 'CTA' : i === 0 ? 'Hook' : 'Body', line, source_ids: [] as string[] }))
const kept = (r: { beats: Array<{ line?: unknown }> }) => r.beats.map((b) => String(b.line ?? ''))

describe('Fix 2: a product\'s facts and stories stay with that product', () => {
  it('S-82E83D: the buyer story about a mug is not a source for the Moss Bowl, even reworded to "bowl"', () => {
    const r = traceAndCut(beats(
      'Every bowl starts on the wheel.',
      'A buyer asked why the bottom of this bowl has no glaze.',
      'A buyer at a craft fair picked up a mug, turned it over, and asked why the bottom was not glazed.',
      'Moss Bowl, link in bio.',
    ), clay, { targetProductId: 'bowl', products: [MUG, BOWL], hasProduct: true, names: ['Tide Mug', 'Moss Bowl'] })
    expect(kept(r).join(' ')).not.toMatch(/buyer/i)
    expect(r.record.cut.other_product).toBe(2)
  })
  it('the same mug story stays in a Tide Mug script', () => {
    const r = traceAndCut(beats('Here is a question I get.', 'A buyer at a craft fair picked up a mug, turned it over, and asked why the bottom was not glazed.', 'Tide Mug, link in bio.'),
      clay, { targetProductId: 'mug', products: [MUG, BOWL], hasProduct: true, names: ['Tide Mug', 'Moss Bowl'] })
    expect(kept(r).join(' ')).toMatch(/buyer at a craft fair/)
    expect(r.record.cut.other_product).toBe(0)
  })
  it('S-F7917F / S-49B0F3: the balm is not given the moisturizer\'s origin story', () => {
    const r = traceAndCut(beats(
      'Here is the balm.',
      'I made the first jar in my kitchen after store creams failed.',
      'I made the first jar of the moisturizer in my kitchen because every store cream I tried left my cheeks red by lunchtime.',
      'A cleansing balm that rinses off with warm water.',
      'Melt Balm, link in bio.',
    ), glow, { targetProductId: 'melt-balm', products: [CREAM, BALM], hasProduct: true, names: ['Calm Cream', 'Melt Balm'] })
    const text = kept(r).join(' ')
    expect(text).not.toMatch(/kitchen|moisturi/i)
    expect(text).toMatch(/cleansing balm/)
  })
  it('the pairs seen in the panel: mug/bowl, cream/balm, jar/tin, cleansers/creams, "fragrance free" on the balm', () => {
    const balm = productScope('melt-balm', [CREAM, BALM], glow)
    const cream = productScope('calm-cream', [CREAM, BALM], glow)
    const bowl = productScope('bowl', [MUG, BOWL], clay)
    expect(otherProductWords('Comes in a 50 ml glass jar.', balm)).toContain('jar')
    expect(otherProductWords('Fragrance free, with nothing added.', balm)).toContain('fragrance free')
    expect(otherProductWords('Unlike most creams it melts.', balm)).toContain('cream')
    expect(otherProductWords('Comes in a 90 g tin.', cream)).toContain('tin')
    expect(otherProductWords('Most cleansers strip the skin.', cream).length).toBeGreaterThan(0)
    expect(otherProductWords('Pour your coffee into the mug.', bowl)).toContain('mug')
    // Words the target owns are never foreign.
    expect(otherProductWords('A cleansing balm in a 90 g tin.', balm)).toEqual([])
    // Her general opinion about fragrance is not the cream's pair.
    expect(otherProductWords('I think fragrance is in most skincare for the shopper.', balm)).toEqual([])
  })
  it('an item attached to another product is elsewhere; with no target product nothing is', () => {
    const scope = productScope('bowl', [MUG, BOWL], clay)
    expect(belongsElsewhere(clay[2]!, scope)).toBe(true)
    expect(belongsElsewhere(clay[4]!, scope)).toBe(false)
    expect(productScope(null, [MUG, BOWL], clay)).toBeNull()
    const general = traceAndCut(beats('Hello.', 'A buyer at a craft fair picked up a mug, turned it over, and asked why the bottom was not glazed.', 'Link in bio.'), clay, { products: [MUG, BOWL] })
    expect(general.record.cut.other_product).toBe(0)
  })
  it('the request can name the other product ("balm or cream"): those words are allowed', () => {
    const items = [...glow, { ref: 'N', id: 'note', origin: 'her_answer', text: 'balm or cream, which one fits your skin', layer: 'fact' as const }]
    expect(otherProductWords('A cream stays on, a balm rinses off.', productScope('melt-balm', [CREAM, BALM], items))).not.toContain('cream')
  })
})

describe('compare-1: no confident script for a creator with no stories', () => {
  const noStory = [fact('Harbor Fog Scarf, 85 dollars', 'product_fact', 'scarf', 'price'), fact('About 180 cm long and 30 cm wide', 'product_fact', 'scarf', 'size')]
  it('asks for one real story instead of writing', () => {
    const d = decideFactsOnly({ note: 'how a Harbor Fog Scarf gets made', product: { id: 'scarf', name: 'Harbor Fog Scarf' } }, noStory)
    expect(d.action).toBe('ask')
    expect(d.questions).toHaveLength(1)
    expect(d.questions[0]!.kind).toBe('story')
  })
  it('stops when that question is closed', () => {
    const req = { note: 'how a Harbor Fog Scarf gets made', product: { id: 'scarf', name: 'Harbor Fog Scarf' } }
    const q = decideFactsOnly(req, noStory).questions[0]!
    expect(decideFactsOnly(req, noStory, { closedKeys: [q.key] }).action).toBe('stop')
  })
  it('an answered story counts: then the normal rules apply', () => {
    const items = [...noStory, { ref: 'F9', id: 'answer:mn:fo:story:x', origin: 'her_answer', text: 'I wove the first one in a cold January, thread by thread.', layer: 'fact' as const }]
    expect(decideFactsOnly({ note: 'how a Harbor Fog Scarf gets made', product: { id: 'scarf', name: 'Harbor Fog Scarf' } }, items).questions.every((x) => x.kind !== 'story' || !/what is one real thing/.test(x.question))).toBe(true)
  })
})

describe('Fix 4: hooks trace like script lines', () => {
  it('invented hooks are cut', () => {
    const r = traceHooks([
      'I almost gave up on Calm Cream during my first week',
      'Your knees hurt squatting because your plan started too big',
    ], glow, { targetProductId: 'calm-cream', products: [CREAM, BALM], hasProduct: true, names: ['Calm Cream', 'Melt Balm'] })
    expect(r.hooks).toEqual([])
    expect(r.dropped).toBe(2)
  })
  it('a hook from her material, or a question to the viewer, stays', () => {
    const r = traceHooks(['My first batch separated in the jar overnight.', 'Does your skin sting after moisturizer?'], glow, {})
    expect(r.hooks).toEqual(['My first batch separated in the jar overnight.', 'Does your skin sting after moisturizer?'])
  })
  it('the first script beat traces too when strictHook is on; the CTA keeps its pass', () => {
    const r = traceAndCut(beats('Your knees hurt squatting because your plan started too big.', 'My first batch separated in the jar overnight.', 'Follow for the next batch.'), glow, { strictHook: true })
    expect(kept(r)).toEqual(['My first batch separated in the jar overnight.', 'Follow for the next batch.'])
    expect(r.record.cut.hook_untraced).toBe(1)
  })
})

describe('Fix 1: a thin script stops and asks one question', () => {
  it('under 40 words or under 3 spoken lines is thin', () => {
    expect(scriptThin([{ line: 'One two three four.' }, { line: 'Five six seven.' }, { line: 'Eight nine ten.' }]).thin).toBe(true)
    const long = Array.from({ length: 5 }, () => ({ line: 'one two three four five six seven eight nine' }))
    expect(scriptThin(long)).toEqual({ words: 45, lines: 5, thin: false })
    expect(scriptThin([{ line: 'one two three four five six seven eight nine ten '.repeat(5) }]).thin).toBe(true)
  })
  it('asks one specific question, a story first, never a closed key', () => {
    const req = { note: 'how I started weaving' }
    const q = thinQuestion(req)!
    expect(q.kind).toBe('story')
    expect(q.question).toMatch(/how I started weaving/)
    const next = thinQuestion(req, { closedKeys: [q.key] })
    expect(next && next.key).not.toBe(q.key)
  })
  it('compare-1: a link line or a CTA is not content (Quiet Loom n31 shape is thin)', () => {
    const n31 = [
      { section: 'Hook', line: 'Slow craft starts with undyed wool. Thread by thread. I weave slow scarves.' },
      { section: 'Body', line: 'Harbor Fog Scarf. Hand-woven wool. Soft grey.' },
      { section: 'Body', line: 'Woven on a floor loom. Washed and pressed. 180 centimeters long.' },
      { section: 'CTA', line: 'Harbor Fog Scarf at https://example.com/quiet-loom' },
    ]
    expect(scriptThin(n31).thin).toBe(true)
    expect(scriptThin([{ line: 'Tell me in the comments what you think about this.' }]).words).toBe(0)
  })
  it('null when everything worth asking is closed', () => {
    const req = { note: 'weaving' }
    let q = thinQuestion(req)
    const closed: string[] = []
    while (q) { closed.push(q.key); q = thinQuestion(req, { closedKeys: closed }) }
    expect(closed.length).toBeGreaterThan(0)
  })
})

describe('Fix 3: story rotation and distinct openings', () => {
  it('a story supplied in 2 of her last 5 scripts rests; facts do not', () => {
    const rows = [{ id: 's1', kind: 'experience' }, { id: 's2', kind: 'experience' }, { id: 'f1', kind: 'claim' }]
    const recent = new Map([['s1', 2], ['s2', 1], ['f1', 4]])
    expect([...restingStoryIds(rows, recent, new Set(['experience', 'story']), 2)]).toEqual(['s1'])
  })
  it('compare-1: the story the request names never rests', () => {
    const rows = [{ id: 's1', kind: 'experience' }, { id: 's2', kind: 'experience' }]
    const recent = new Map([['s1', 3], ['s2', 2]])
    expect([...restingStoryIds(rows, recent, new Set(['experience']), 2, new Set(['s1']))]).toEqual(['s2'])
  })
  it('two scripts for one creator never open with the same line', () => {
    const prior = ['My first kiln load welded every mug to the shelf.']
    const r = dropRepeatedOpening([{ line: 'My first kiln load welded every mug to the shelf. I had glazed the bottoms.' }, { line: 'Now I wax every foot.' }], prior)
    expect(r.cut).toBe(1)
    expect(openingOf(r.beats)).toBe('i had glazed the bottoms')
    const same = dropRepeatedOpening([{ line: 'My first kiln load welded every mug to the shelf!' }, { line: 'Now I wax every foot.' }], prior)
    expect(same.beats.map((b) => b.line)).toEqual(['Now I wax every foot.'])
    const fresh = dropRepeatedOpening([{ line: 'Two hundred mugs before the handles held.' }], prior)
    expect(fresh.cut).toBe(0)
  })
})

describe('Fix 4: quality cleanup', () => {
  it('no "second/third step" without the earlier steps', () => {
    const r = polishFactsOnly([{ line: 'The second check is the label.' }, { line: 'The third check is the list.' }])
    expect(r.beats.map((b) => b.line)).toEqual(['The first check is the label.', 'The second check is the list.'])
    const ok = polishFactsOnly([{ line: 'The first step is wax. The second step is the sponge.' }])
    expect(ok.beats[0]!.line).toBe('The first step is wax. The second step is the sponge.')
    const gap = polishFactsOnly([{ line: 'My first mistake was glaze. My third mistake was rushing.' }])
    expect(gap.beats[0]!.line).toBe('My first mistake was glaze. My second mistake was rushing.')
  })
  it('strips copied spoken filler', () => {
    expect(stripFiller('Um, the clay decides, like, every time.')).toBe('the clay decides, every time.')
    expect(stripFiller('So yeah, that is the batch.')).toBe('that is the batch.')
    expect(polishFactsOnly([{ line: 'So yeah, that is the batch.' }]).beats[0]!.line).toBe('That is the batch.')
    expect(stripFiller('I like the glaze.')).toBe('I like the glaze.')
  })
  it('drops empty fragments like "Look."', () => {
    const r = polishFactsOnly([{ line: 'Look. The foot stays bare.' }, { line: 'Okay!' }, { line: '90 g tin.' }])
    expect(r.beats.map((b) => b.line)).toEqual(['The foot stays bare.', '90 g tin.'])
    expect(r.record.fragments).toBe(2)
  })
  it('strips trailing "." or "!" from links', () => {
    const r = polishFactsOnly([{ line: 'Get it at glowlab.shop/calm. Or visit https://example.com/fictional/mug!' }])
    expect(r.beats[0]!.line).toBe('Get it at glowlab.shop/calm Or visit https://example.com/fictional/mug')
    expect(polishFactsOnly([{ line: 'It holds 12 oz. Link in bio.' }]).beats[0]!.line).toBe('It holds 12 oz. Link in bio.')
  })
})

describe('compare-1 follow-up (owner, 22 Nov)', () => {
  const ledgerItem = (id: string, origin: string, text: string, field: string | null = null) => ({ id, origin, text, field, product_id: null, numbers: [], first_party: true, live: false, source_label: '' }) as never
  it('a saved profile or niche answer is a background note, never a script line', () => {
    const items = writerItems([
      ledgerItem('answer:audience', 'her_answer', 'I am a small skincare maker, and I speak to people whose skin is tired of stinging products.', 'audience'),
      ledgerItem('s1', 'her_story', 'My first batch separated in the jar overnight, and I threw out forty jars before I got the emulsion right.'),
    ])
    expect(items.find((it) => it.id === 'answer:audience')).toMatchObject({ layer: 'background', profile: true })
    const r = traceAndCut(beats('Here is my story.', 'I am a small skincare maker, and I speak to people whose skin is tired of stinging products.', 'My first batch separated in the jar overnight.', 'Follow for more.'), items)
    expect(kept(r).join(' ')).not.toMatch(/small skincare maker/)
    expect(r.record.cut.profile_line).toBe(1)
  })
  it('the same profile text under another key (a story answer) is still not spoken', () => {
    const items = [fact('I am a small skincare maker, and I speak to people whose skin is tired of stinging products.', 'her_answer')]
    const r = traceAndCut(beats('Hello there.', 'I am a small skincare maker, and I speak to people whose skin is tired of stinging products.', 'Follow for more.'), items, { profileTexts: ['I am a small skincare maker, and I speak to people whose skin is tired of stinging products.'] })
    expect(r.record.cut.profile_line).toBe(1)
  })
  const opinion: WriterItem = { ref: 'B1', id: 'op', origin: 'her_fact', text: 'I think most small shops do not need a help desk, they need fewer repeat emails.', layer: 'background', opinion: true }
  const tagline: WriterItem = { ref: 'F9', id: 'answer:product_slot', origin: 'her_answer', text: 'FlowDesk sorts your shop inbox. Replies drafted. You approve. Ship it.', layer: 'fact', field: 'product_slot' }
  const note = (t: string): WriterItem => ({ ref: 'N', id: 'note', origin: 'her_answer', text: t, layer: 'fact' })
  it('a stock opinion is used only when it fits the request', () => {
    const off = traceAndCut(beats('Hello there.', 'I think most small shops do not need a help desk, they need fewer repeat emails.', 'Follow for more.'), [opinion, note('our first paying customer found a bug')])
    expect(off.record.cut.stock_line).toBe(1)
    const on = traceAndCut(beats('Hello there.', 'I think most small shops do not need a help desk, they need fewer repeat emails.', 'Follow for more.'), [opinion, note('why small shops should not buy a help desk yet')])
    expect(on.record.cut.stock_line).toBe(0)
  })
  it('a stock line one of her last scripts said rests', () => {
    const prior = ['I think most small shops do not need a help desk, they need fewer repeat emails.']
    const r = traceAndCut(beats('Hello there.', 'I think most small shops do not need a help desk, they need fewer repeat emails.', 'Follow for more.'), [opinion, note('why small shops should not buy a help desk yet')], { priorLines: prior })
    expect(r.record.cut.stock_line).toBe(1)
  })
  it('a product tagline in a script about something else is cut; in a product script it stays (until rested)', () => {
    const items = [tagline, note('our first paying customer found a bug')]
    expect(traceAndCut(beats('Hello there.', 'FlowDesk sorts your shop inbox.', 'Follow for more.'), items).record.cut.stock_line).toBe(1)
    const prod = traceAndCut(beats('Hello there.', 'FlowDesk sorts your shop inbox.', 'Follow for more.'), [tagline, note('FlowDesk trial')], { targetProductId: 'fd', products: [{ id: 'fd', name: 'FlowDesk' }] })
    expect(prod.record.cut.stock_line).toBe(0)
  })
  it('a feeling or outcome is not moved from one story onto another', () => {
    const items = [
      fact('Our first paying customer found a bug in the first forty minutes, and it was terrifying.'),
      fact('I built the first version over one winter, mostly at night.'),
    ]
    const r = traceAndCut(beats('Hello there.', 'I built the first version over one winter, and it was terrifying.', 'Our first paying customer found a bug in the first forty minutes, and it was terrifying.', 'Follow for more.'), items)
    expect(kept(r).join(' ')).not.toMatch(/winter, and it was terrifying/)
    expect(kept(r).join(' ')).toMatch(/forty minutes, and it was terrifying/)
    expect(r.record.cut.moved_feeling).toBe(1)
  })
})
