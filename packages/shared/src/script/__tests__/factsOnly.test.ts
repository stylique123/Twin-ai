// FACTS_ONLY_WRITER (panel 13c → 14; default OFF). Written before the wiring:
// each case is a behaviour the owner asked for on 12 Nov.
import { describe, it, expect } from 'vitest'
import { buildLedger } from '../inventionGate'
import {
  factsOnlyWriterOn, factsOnlyKeepsRow, writerItems, renderFactsOnlyBlock, resolveSourceIds,
  needsFor, decideFactsOnly, closedKeysFrom, traceAndCut, statesAFact, suppliedCounts, styleItems, backgroundItems, layerCounts,
} from '../factsOnly'
import { answersForThisVideo, pillarsFrom, sampleLinesFrom, renderWriterLoop } from '../planner/writerLoop'
import { pickTwo } from '../questionEngine'

const signal = buildLedger({
  knowledge: [
    { id: 'k1', kind: 'experience', text: 'I asked an AI tool to summarize my own newsletter and it confidently quoted a sentence I never wrote.' },
    { id: 'k2', kind: 'framework', text: 'Before trusting an AI answer: ask for its sources, open one, find the exact sentence, and if it is not there, treat the whole answer as a draft.' },
    { id: 'k3', kind: 'opinion', text: 'I think an AI tool that admits it does not know is worth more than one that always answers.' },
    { id: 'k4', kind: 'experience', text: 'I tested three AI tools on the same spreadsheet and only one kept the totals right.' },
  ],
  answers: { 'mn:gap:proof': 'Readers told me the sources check saved them from quoting a fake statistic.' },
  note: 'Why you should not trust AI answers without checking sources',
  products: [{ id: 'nl', name: 'Signal Daily', knowledge: [{ field: 'what_it_is', value: 'One email every weekday with one AI tool tested' }, { field: 'price', value: '$5 a month', trust: 'unconfirmed' }] }],
  targetProductId: 'nl',
  offer: 'Signal Daily: subscribe, link in bio',
  outside: [{ id: 'r1', kind: 'research', text: 'Most people never open the cited source.' }],
})
const items = writerItems(signal)
const ref = (id: string) => items.find((i) => i.id === id)!.ref
const beats = (...l: Array<[string, string[]?, string?]>) => l.map(([line, ids, tag], i) => ({ section: i === 0 ? 'Hook' : i === l.length - 1 ? 'CTA' : `Beat ${i}`, line, source_ids: ids ?? [], ...(tag ? { layer_tag: tag } : {}) }))
const style = styleItems(['So here is the thing.', 'Anyway, that is the whole trick.', 'Real talk:'])
const background = backgroundItems(['Audience: newsletter writers who use AI tools daily', 'Reddit theme: AI tools invent quotes and people get burned publishing them'], 3)

describe('the flag', () => {
  it('is on only for the exact value "on", and only on test/panel accounts', () => {
    expect(factsOnlyWriterOn('on', true)).toBe(true)
    expect(factsOnlyWriterOn('on', false)).toBe(false)
    for (const v of [undefined, '', 'true', '1', 'ON', 'off', 'all']) expect(factsOnlyWriterOn(v, true)).toBe(false)
  })
})

describe('1. the writer is handed her whole material', () => {
  it('keeps every row except ones she excluded or sensitive ones', () => {
    expect(factsOnlyKeepsRow({ id: 'a' })).toBe(true)
    expect(factsOnlyKeepsRow({ id: 'a', sensitive: true })).toBe(false)
    expect(factsOnlyKeepsRow({ id: 'a', creator_excluded_at: '2026-11-01' })).toBe(false)
    expect(factsOnlyKeepsRow({ id: 'a' }, new Set(['a']))).toBe(false)
  })
  it('items: every story, fact, answer and confirmed product fact; never outside research or unconfirmed facts', () => {
    expect(items.filter((i) => i.layer === 'fact').map((i) => i.id)).toEqual(['k1', 'k2', 'k4', 'answer:mn:gap:proof', 'note', 'p:nl:what_it_is:0', 'offer'])
    // Her stated opinion is background, citable only as her opinion; outside research is background.
    expect(items.find((i) => i.id === 'k3')).toMatchObject({ layer: 'background', opinion: true })
    expect(items.find((i) => i.id === 'r1')).toMatchObject({ layer: 'background' })
    expect(suppliedCounts(items)).toMatchObject({ items: 7, opinions: 1, stories: 2, facts: 1, answers: 2, product_facts: 2 })
    expect(layerCounts(items, style, background)).toEqual({ fact: 7, style: 3, background: 4 })
    const block = renderFactsOnlyBlock(items, style, background)
    for (const it of [...items, ...style, ...background]) expect(block).toContain(`[${it.ref}]`)
    const facts = block.slice(block.indexOf('LAYER 1'), block.indexOf('LAYER 2'))
    expect(facts).not.toMatch(/Most people never open|Reddit theme|So here is the thing/)
    expect(block).toMatch(/LAYER 2: STORYTELLING[\s\S]*So here is the thing/)
    expect(block).toMatch(/LAYER 3: BACKGROUND[\s\S]*Reddit theme/)
    expect(block).toMatch(/no word count/i)
  })
  it('removes the caps: 6 answers at 600 characters, 5 pillars, 3 sample lines, 3 pain themes', () => {
    const long = 'x'.repeat(900)
    const mn = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`mn:q${i}`, `answer number ${i} ${i === 0 ? long : ''}`]))
    expect(answersForThisVideo(mn, {})).toHaveLength(6)
    expect(answersForThisVideo(mn, {})[0].text.length).toBe(600)
    const all = answersForThisVideo(mn, {}, { uncapped: true })
    expect(all).toHaveLength(8)
    expect(all[0].text.length).toBeGreaterThan(900)
    const brief = { contentPillars: ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7'] }
    expect(pillarsFrom(brief)).toHaveLength(5)
    expect(pillarsFrom(brief, { uncapped: true })).toHaveLength(7)
    const samples = ['one two three four five six', 'seven eight nine ten eleven twelve', 'a b c d e f', 'g h i j k l', 'm n o p q r']
    expect(sampleLinesFrom(samples, null, Infinity)).toHaveLength(5)
    const pains = ['p1', 'p2', 'p3', 'p4', 'p5']
    const capped = renderWriterLoop({ answers: [], pillars: [], profile: 'standard', voice: { sampleLines: samples }, painThemes: pains })
    const open = renderWriterLoop({ answers: [], pillars: [], profile: 'standard', voice: { sampleLines: samples }, painThemes: pains, uncapped: true })
    expect(capped).not.toContain('m n o p q r')
    expect(capped).not.toContain('- p4')
    expect(open).toContain('m n o p q r')
    expect(open).toContain('- p5')
    // No fixed word budget with the flag on; the old block keeps its word counts.
    expect(capped).toMatch(/\d+–\d+ words/)
    expect(open).not.toMatch(/\d+–\d+ words/)
  })
})

describe('2. every line traced', () => {
  it('a line with no source is dropped', () => {
    const r = traceAndCut(beats(
      ['Stop trusting AI answers blindly.'],
      ['I asked an AI tool to summarize my own newsletter and it confidently quoted a sentence I never wrote.', [ref('k1')]],
      ['Two of them simply swapped digits and fabricated totals.'],
      ['Signal Daily: subscribe, link in bio.', [ref('offer')]],
    ), items)
    expect(r.beats.map((b) => b.line)).not.toContain('Two of them simply swapped digits and fabricated totals.')
    expect(r.record.cut.no_source + r.record.cut.added_number + r.record.cut.unearned_first_person).toBeGreaterThanOrEqual(1)
    expect(r.record.beats_dropped).toBe(1)
    expect(r.beats[1].source_ids).toEqual(['k1'])
  })
  it('keeps the hook, the CTA and a plain connecting sentence with no source', () => {
    const r = traceAndCut(beats(
      ['Here is the check nobody does.'],
      ['Before trusting an AI answer, ask for its sources and open one.', [ref('k2')]],
      ['Here is why that matters.'],
      ['Subscribe, link in bio.'],
    ), items)
    expect(r.beats).toHaveLength(4)
    expect(r.record.cut.no_source).toBe(0)
  })
  it('cuts a number that is not in the cited item', () => {
    const r = traceAndCut(beats(['Hook.'], ['I tested three AI tools on the same spreadsheet and 2 of them got 40% wrong.', [ref('k4')]], ['Link in bio.']), items)
    expect(r.record.cut.added_number).toBe(1)
  })
  it('cuts an added effect or scene beyond the cited item', () => {
    const r = traceAndCut(beats(['Hook.'], ['I asked an AI tool to summarize my newsletter. My coffee went cold while the cursor blinked on a fake quote and my stomach dropped.', [ref('k1')]], ['Link in bio.']), items)
    expect(r.beats[1].line).toMatch(/summarize my newsletter/)
    expect(r.beats[1].line).not.toMatch(/coffee went cold/)
    expect(r.record.cut.no_source).toBe(1)
    // Traced to her item, but most of it is new: a scene she never described.
    const r2 = traceAndCut(beats(['Hook.'], ['I asked an AI tool to summarize my own newsletter while my coffee went cold on the counter beside a blinking cursor.', [ref('k1')]], ['Ask for its sources.', [ref('k2')]], ['Link in bio.']), items)
    expect(r2.record.cut.added_detail).toBe(1)
    expect(r2.beats.map((b) => b.line).join(' ')).not.toMatch(/coffee/)
  })
  it('cuts unearned first person, even when it cites something', () => {
    const r = traceAndCut(beats(['Hook.'], ['I started roasting coffee with a popcorn popper in my garage.', [ref('k4')]], ['Ask for its sources.', [ref('k2')]], ['Link in bio.']), items)
    expect(r.record.cut.unearned_first_person).toBe(1)
    expect(r.beats.map((b) => b.line).join(' ')).not.toMatch(/popcorn/)
  })
  it('the writer cites refs; unknown refs are ignored', () => {
    expect(resolveSourceIds([ref('k1'), 'F99', 'k2'], items)).toEqual(['k1', 'k2'])
    expect(resolveSourceIds('F1, F2', items)).toEqual(['k1', 'k2'])
  })
  it('a connecting sentence states no fact; a number or a personal event does', () => {
    expect(statesAFact('Here is the part people skip.')).toBe(false)
    expect(statesAFact('It took 3 weeks.')).toBe(true)
    expect(statesAFact('I tried it on my own newsletter.')).toBe(true)
  })
})

describe('the four layers (owner, 12 Nov)', () => {
  const ex = { style, background }
  it('a style-only line passes', () => {
    const r = traceAndCut(beats(['Stop trusting AI answers blindly.', [], 'style'], ['Ask for its sources, open one, find the exact sentence.', [ref('k2')], 'fact'], ['So here is the thing.', [style[0].ref], 'style'], ['Subscribe, link in bio.', [], 'style']), items, ex)
    expect(r.beats.map((b) => b.line)).toContain('So here is the thing.')
    expect(r.record.tags).toMatchObject({ fact: 1, style: 3 })
  })
  it('a line with a new scene or number and no fact source is dropped', () => {
    const r = traceAndCut(beats(['Hook.', [], 'style'], ['Ask for its sources.', [ref('k2')], 'fact'], ['Last Tuesday 4,000 readers saw it while I stood in my kitchen holding cold coffee.', [], 'style'], ['Link in bio.', [], 'style']), items, ex)
    expect(r.beats.map((b) => b.line).join(' ')).not.toMatch(/Tuesday|kitchen/)
  })
  it('a line citing only a style or background item for an event is dropped', () => {
    const r1 = traceAndCut(beats(['Hook.'], ['I got burned publishing a quote an AI tool invented.', [background[1].ref], 'fact'], ['Ask for its sources.', [ref('k2')]], ['Link in bio.']), items, ex)
    expect(r1.record.cut.borrowed_layer).toBe(1)
    const r2 = traceAndCut(beats(['Hook.'], ['Anyway, that trick doubled my open rate in 2 weeks.', [style[1].ref], 'fact'], ['Ask for its sources.', [ref('k2')]], ['Link in bio.']), items, ex)
    expect(r2.record.cut.borrowed_layer).toBe(1)
    expect(r2.beats.map((b) => b.line).join(' ')).not.toMatch(/doubled/)
  })
  it('a Reddit theme is never written as her own experience', () => {
    const r = traceAndCut(beats(['Hook.'], ['I published a quote an AI tool invented and got burned.', [], 'fact'], ['Ask for its sources.', [ref('k2')]], ['Link in bio.']), items, ex)
    expect(r.record.cut.background_as_experience).toBe(1)
    expect(r.beats.map((b) => b.line).join(' ')).not.toMatch(/got burned/)
  })
  it('her stated opinion passes as an opinion, with its source id', () => {
    const r = traceAndCut(beats(['Hook.'], ['I think an AI tool that admits it does not know is worth more than one that always answers.', [ref('k3')], 'opinion'], ['Link in bio.']), items, ex)
    expect(r.beats[1].source_ids).toEqual(['k3'])
  })
  it('a cross-story link passes only if that story is stored', () => {
    const ok = traceAndCut(beats(['Hook.'], ['Ask for its sources.', [ref('k2')]], ['I asked an AI tool to summarize my own newsletter and it quoted a sentence I never wrote.', [ref('k1')], 'link'], ['Link in bio.']), items, ex)
    expect(ok.record.cut.link_not_stored).toBe(0)
    expect(ok.beats).toHaveLength(4)
    const bad = traceAndCut(beats(['Hook.'], ['Ask for its sources.', [ref('k2')]], ['Like the time my intern trusted a chatbot.', ['F99'], 'link'], ['Link in bio.']), items, ex)
    expect(bad.record.cut.link_not_stored).toBe(1)
    const notStory = traceAndCut(beats(['Hook.'], ['Ask for its sources.', [ref('k2')]], ['One email every weekday.', [ref('p:nl:what_it_is:0')], 'link'], ['Link in bio.']), items, ex)
    expect(notStory.record.cut.link_not_stored).toBe(1)
  })
  it('her facts are kept as written, never reworded', () => {
    const line = 'I asked an AI tool to summarize my own newsletter and it confidently quoted a sentence I never wrote.'
    const r = traceAndCut(beats(['Hook.'], [line, [ref('k1')], 'fact'], ['Link in bio.']), items, ex)
    expect(r.beats[1].line).toBe(line)
  })
})

describe('3. stop and ask', () => {
  const coffee = buildLedger({ knowledge: [{ id: 'c1', kind: 'fact', text: 'We roast on Tuesdays in small batches.' }], note: 'The day my first batch of beans burned' })
  const cItems = writerItems(coffee)
  it('too little material: stops and asks specific questions, never a sharpener', () => {
    const d = decideFactsOnly({ note: 'The day my first batch of beans burned' }, cItems, { ledger: coffee })
    expect(d.action).toBe('ask')
    if (d.action !== 'ask') return
    expect(d.questions.length).toBeGreaterThanOrEqual(1)
    expect(d.questions.length).toBeLessThanOrEqual(3)
    expect(d.questions[0].kind).toBe('story')
    expect(d.questions[0].question).toMatch(/The day my first batch of beans burned/)
    for (const q of d.questions) expect(q.question).not.toMatch(/one number you can confirm|one detail only you would know|before, and what is it like now/i)
  })
  it('a saved answer is never asked again: by key, by meaning, and the answer is reused', () => {
    const q = needsFor({ note: 'The day my first batch of beans burned' })[0]
    // Closed by key (answered in question_asks).
    expect(decideFactsOnly({ note: 'The day my first batch of beans burned' }, cItems, { ledger: coffee, closedKeys: [q.key] }).questions.map((x) => x.key)).not.toContain(q.key)
    // Closed by meaning (a saved answer that already says it).
    expect(decideFactsOnly({ note: 'The day my first batch of beans burned' }, cItems, { ledger: coffee, savedAnswers: [q.question] }).questions.map((x) => x.key)).not.toContain(q.key)
    // Her saved answer, back in the ledger under the question key, covers the need: write, no question.
    const withAnswer = buildLedger({ knowledge: [{ id: 'c1', kind: 'fact', text: 'We roast on Tuesdays in small batches.' }], answers: { [q.key]: 'My first batch burned because I left the roaster on while I answered the door; the beans went black.' }, note: 'The day my first batch of beans burned' })
    const d = decideFactsOnly({ note: 'The day my first batch of beans burned' }, writerItems(withAnswer), { ledger: withAnswer, closedKeys: [q.key] })
    expect(d.action).toBe('write')
  })
  it('answer, then the build fails, then the same request again: not re-asked', () => {
    const note = 'The day my first batch of beans burned'
    // 1. The gap check asks.
    const first = decideFactsOnly({ note }, cItems, { ledger: coffee })
    expect(first.action).toBe('ask')
    const q = first.questions[0]!
    // 2. She answers. The answer is saved at the START of the next request
    //    (answerFactRow: source 'asked', source_ref 'asked:<key>'), then the
    //    build fails: no question_asks row is written, nothing else is kept.
    const answer = 'My first batch burned because I left the roaster on while I answered the door; the beans went black.'
    const savedRow = { kind: 'experience', text: answer, source: 'asked', source_ref: `asked:${q.key}` }
    // 3. The same request again, without the answer in the body.
    const knowledge = [{ id: 'c1', kind: 'fact', text: 'We roast on Tuesdays in small batches.' }, { id: 'saved1', kind: savedRow.kind, text: savedRow.text }]
    const ledger2 = buildLedger({ knowledge, note })
    const again = decideFactsOnly({ note }, writerItems(ledger2), { ledger: ledger2, closedKeys: closedKeysFrom([], [savedRow]), savedAnswers: [savedRow.text] })
    expect(again.questions.map((x) => x.key)).not.toContain(q.key)
    expect(again.action).toBe('write')
    // Closed by the saved row alone, and by answered / skipped / filler asks; a shown ask stays open.
    expect(closedKeysFrom([{ slot_id: 'a', outcome: 'skipped' }, { slot_id: 'b', outcome: 'shown' }], [{ source_ref: `asked:${q.key}` }, { source_ref: 'onboarding:x' }])).toEqual(['a', q.key])
  })
  it('everything already asked and still too thin: no script, no question', () => {
    const keys = needsFor({ note: 'The day my first batch of beans burned' }).map((q) => q.key)
    expect(decideFactsOnly({ note: 'The day my first batch of beans burned' }, cItems, { ledger: coffee, closedKeys: keys }).action).toBe('stop')
  })
  it('enough material: writes', () => {
    const d = decideFactsOnly({ note: 'Why you should not trust AI answers without checking sources', product: { id: 'nl', name: 'Signal Daily' } }, items, { ledger: signal })
    expect(d.action).toBe('write')
  })
  it('the question engine: with factsOnly, up to 3 gap questions, no pain question, no profile question, no sharpeners', () => {
    const input = { door: 'idea', angleNeeds: ['story', 'proof', 'process'] as never, material: [], ideaText: 'Cold brew at home', painThemes: [{ id: 'p', text: 'Cold brew tastes sour' }], profileMissing: true }
    const before = pickTwo(input)
    expect(before).toHaveLength(2)
    expect(before[0].key).toMatch(/^mn:pain:/)
    const fo = pickTwo({ ...input, factsOnly: true })
    expect(fo).toHaveLength(3)
    for (const q of fo) expect(q.key).toMatch(/^mn:gap:/)
    const nothingMissing = pickTwo({ ...input, factsOnly: true, angleNeeds: ['story'] as never, material: [{ slot: 'story', text: 'x', source: 'her_material' }, { slot: 'hook', text: 'y', source: 'her_material' }, { slot: 'proof', text: 'z', source: 'her_material' }] as never })
    expect(nothingMissing).toEqual([])
  })
})
