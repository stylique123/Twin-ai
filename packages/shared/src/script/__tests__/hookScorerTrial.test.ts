// Hook engine trial scorer (A5b): appeal score, STORY-OPEN / FACT-OPEN, invention check.
// Every fixture here is made up; none is creator, advisor or third-party text.
import { describe, it, expect } from 'vitest'
import type { LedgerItem } from '../inventionGate.js'
import { appealScore, hookFeatures, openCandidates, openLine, hookInventionOk, runHookEngine } from '../hooks/hookEngine.js'

const item = (o: Partial<LedgerItem> & Pick<LedgerItem, 'id' | 'origin'>): LedgerItem => ({
  product_id: null, field: null, text: 'a made-up line', numbers: [], first_party: true, live: false, source_label: o.origin, ...o,
})
const ledger: LedgerItem[] = [
  item({ id: 'q', origin: 'audience_question', first_party: false, text: 'Why does my candle tunnel down the middle?' }),
  item({ id: 's', origin: 'her_fact', field: 'stance', text: 'Trim the wick before every candle burn' }),
  item({ id: 'st', origin: 'her_story', text: 'My first candle batch tunnelled straight down the middle. I almost quit.' }),
  item({ id: 'pf', origin: 'product_fact', product_id: 'p1', text: 'The candle wick is braided cotton, trimmed to 6 mm', numbers: [{ value: 6, unit: 'count', field: 'wick' }] }),
  item({ id: 'other', origin: 'her_story', text: 'My dog ate a whole loaf of rye bread on Sunday.' }),
]

describe('appeal features', () => {
  it('ranks a first-person story over a promo line and filler', () => {
    const story = appealScore('My first candle batch tunnelled straight down the middle.', ledger)
    const promo = appealScore('If you like candles, check our shop for a deal.', ledger)
    const filler = appealScore("Here's the thing about candles, watch this.", ledger)
    expect(story).toBeGreaterThan(promo)
    expect(story).toBeGreaterThan(filler)
  })
  it('lifts stop-openers over plain questions', () => {
    expect(appealScore('Stop lighting a candle for ten minutes.', [])).toBeGreaterThan(appealScore('Do you light candles for ten minutes?', []))
  })
  it('reads features deterministically', () => {
    const f = hookFeatures('If you burn candles, watch this?')
    expect(f).toMatchObject({ if_open: true, question: true, generic: 1, story: false })
    expect(appealScore('', ledger)).toBe(0)
  })
})

describe('STORY-OPEN / FACT-OPEN', () => {
  it('builds near-verbatim lines only', () => {
    expect(openLine('my first candle batch tunnelled.  Then more')).toBe('My first candle batch tunnelled.')
    expect(openLine('too short')).toBeNull()
  })
  it('offers a matching story first, then a matching fact, never an unrelated story', () => {
    const c = openCandidates(ledger, { request: 'why my candle tunnels', targetProductId: 'p1' })
    expect(c[0]).toEqual({ shape: 'story_open', text: 'My first candle batch tunnelled straight down the middle.', source: 'story_open' })
    expect(c.some((x) => x.source === 'fact_open' && x.text === 'The candle wick is braided cotton, trimmed to 6 mm.')).toBe(true)
    expect(c.some((x) => String(x.text).includes('dog'))).toBe(false)
  })
  it('adds nothing: every open word is in its source item', () => {
    for (const c of openCandidates(ledger, { request: 'candle wick' })) {
      const src = ledger.map((i) => i.text.toLowerCase()).join(' ')
      for (const w of String(c.text).toLowerCase().replace(/[.,]/g, '').split(/\s+/)) expect(src).toContain(w)
    }
  })
  it('offers nothing with no request', () => {
    expect(openCandidates(ledger, {})).toEqual([])
  })
})

describe('trial engine', () => {
  const writer = [
    { shape: 'audience_question', text: 'Why does your candle tunnel down the middle?' },
    { shape: 'stop_doing', text: 'Stop lighting candles without trimming the wick.' },
    { shape: 'if_then_check', text: 'Candle tunnelling? Check our 40 percent off sale.' },
  ]
  const run = (trial: boolean) => runHookEngine(writer, ledger, { trial, request: 'candle tunnels', targetProductId: 'p1' })
  it('off: identical to v1', () => {
    expect(run(false)).toEqual(runHookEngine(writer, ledger))
  })
  it('on: picks the story open first and records sources', () => {
    const { record, pick } = run(true)
    expect(pick.hooks[0]).toBe('My first candle batch tunnelled straight down the middle.')
    expect(record.candidates[0]!.source).toBe('story_open')
    expect(record.candidates.some((c) => c.source === 'writer')).toBe(true)
    expect(JSON.stringify(record)).not.toContain('candle')
  })
  it('on: every candidate still passes the hook check and the invention check', () => {
    const { record } = run(true)
    expect(record.candidates.find((c) => c.source === 'writer' && c.shape === 'if_then_check')!.ok).toBe(false)
    const { pick } = run(true)
    for (const h of pick.hooks) expect(hookInventionOk(h, ledger, [], 'p1').ok).toBe(true)
  })
  it('on: an invented first-person event fails the invention check', () => {
    const r = runHookEngine([{ shape: 'stop_doing', text: 'I sold 300 candles at the fair last week.' }], ledger, { trial: true })
    expect(r.record.candidates[0]!.ok).toBe(false)
  })
  it('on: an open that fails a check is not picked', () => {
    const bad = [item({ id: 'b', origin: 'her_story', text: 'Everyone told me my candle smelled like smoke.' })]
    const r = runHookEngine([], bad, { trial: true, request: 'candle smoke' })
    expect(r.record.candidates[0]!.ok).toBe(false)
    expect(r.pick.hooks).toEqual([])
  })
})
