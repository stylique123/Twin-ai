// THE EVENT-RETENTION RULE LIVES TWICE, AND THIS EXECUTES BOTH COPIES.
//
// ⚠️ `generate-blueprint` cannot import `@twinai/shared`, so the rule is
// mirrored. A second authority for one rule is the defect class this codebase
// keeps closing; a mirror is only survivable with a test that FAILS on drift.
//
// ⚖️ THE FIXTURES CARRY THE THREE THINGS A TEST FOUND IN MY OWN FIRST DRAFT:
// the apostrophe token ("it's" surviving as a content word), the inflection
// ("splits" vs "splitting"), and the argument that reuses the event's nouns.
// A table without those would let a mirror drop any of the three and still pass.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { eventContentWords, eventRetention } from '../eventRetention'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

function loadInline() {
  const start = EDGE.indexOf('// ── EVENT RETENTION, INLINED ─')
  const end = EDGE.indexOf('// ── END EVENT RETENTION ─', start)
  expect(start, 'inlined block marker missing — fix the marker, do not delete it').toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const js = transformSync(EDGE.slice(start, end), { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return {
    eventContentWordsInline, eventRetentionInline }`)() as {
      eventContentWordsInline: typeof eventContentWords
      eventRetentionInline: typeof eventRetention
    }
}

const HIS_EVENT = "a factory one splits and it's rubbish, mine comes back and I fix it"
const ARGUMENT_ONLY = [
  'Most factory bindings are glued, and glue gives up.',
  'Mine can be opened, repaired and rebound again.',
]
const EVENT_KEPT = [
  'A factory one splits down the spine and it is rubbish.',
  'Mine comes back to me and I fix it.',
]

const CASES: Array<{ name: string; event: unknown; lines: unknown[] }> = [
  { name: 'the argument kept, the event dropped', event: HIS_EVENT, lines: ARGUMENT_ONLY },
  { name: 'the event actually kept', event: HIS_EVENT, lines: EVENT_KEPT },
  { name: 'wholly absent', event: HIS_EVENT, lines: ['Consistency is the foundation of success.'] },
  {
    name: 'an inflection counts as present',
    event: 'the spine splits open',
    lines: ['The spine is splitting open.'],
  },
  { name: 'no event named', event: '', lines: ARGUMENT_ONLY },
  { name: 'whitespace-only event', event: '   ', lines: ARGUMENT_ONLY },
  { name: 'event is not a string', event: null, lines: ARGUMENT_ONLY },
  { name: 'event is a number', event: 42, lines: ARGUMENT_ONLY },
  { name: 'fragment below the moment floor', event: 'it splits', lines: ARGUMENT_ONLY },
  { name: 'no script lines', event: HIS_EVENT, lines: [] },
  { name: 'script lines all silent', event: HIS_EVENT, lines: ['', null, '  ', undefined] },
  { name: 'over-long event is truncated', event: `${HIS_EVENT} ${'x'.repeat(400)}`, lines: EVENT_KEPT },
]

describe('event retention parity', () => {
  const inline = loadInline()

  it.each(CASES)('$name', ({ event, lines }) => {
    // Compared WHOLE, including `absent` and `event`. The drift that caught the
    // nominalisation mirror was a missing field, not a wrong count.
    expect(inline.eventRetentionInline(event, lines)).toEqual(eventRetention(event, lines))
  })

  it.each([
    HIS_EVENT, "it's rubbish", 'the spine splits open', '', null, 42, "don't do that",
  ])('tokenising agrees: %s', (text) => {
    expect(inline.eventContentWordsInline(text)).toEqual(eventContentWords(text))
  })

  it('the table produced all three outcomes, so agreement means something', () => {
    const results = CASES.map((c) => eventRetention(c.event, c.lines))
    expect(results.some((r) => r === null), 'no fixture returned null').toBe(true)
    expect(results.some((r) => r?.whollyAbsent === true), 'no fixture was wholly absent').toBe(true)
    expect(results.some((r) => r !== null && r.absentWords === 0), 'no fixture was fully present')
      .toBe(true)
  })

  it('and the apostrophe case is load-bearing', () => {
    // If "it's" tokenised as a content word, this event would read as partly
    // absent from a script that contains it in full — and `whollyAbsent` could
    // then fire falsely. Without this row a mirror could drop the stripping.
    expect(eventRetention(HIS_EVENT, EVENT_KEPT)!.absentWords).toBe(0)
  })
})
