// Plan v6.1 §27 offline replay guard. The last block IS the CI gate: it runs in
// the required `Install + test @twinai/shared` step, so a quality PR that makes
// the stored FICTIONAL panel 10/11 replay worse fails here. Fictional fixtures only.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compareToBaseline, median, repeatCount, replayByPanel, replayCase, type ReplayBaseline, type ReplayCase, type ReplayMetrics } from '../replayGuard'

const LONG = 'I fired the teal glaze slowly and the cracks finally stopped showing up.'
const c = (lines: string[], extra: Partial<ReplayCase> = {}): ReplayCase => ({ batch: 'p', n: 0, target_seconds: 30, script: lines.map((line) => ({ line })), hook_options: ['A hook.'], ...extra })
const base = (o: Partial<ReplayMetrics> = {}): ReplayBaseline => ({ max_word_drop: 0.1, panels: { p: { cases: 1, word_reference: 100, median_spoken_words: 100, placeholders: 0, repeats: 2, blocking_flags: 3, ...o } } })
const m = (o: Partial<ReplayMetrics> = {}): Record<string, ReplayMetrics> => ({ p: { cases: 1, median_spoken_words: 100, placeholders: 0, repeats: 2, blocking_flags: 3, ...o } })

describe('replay guard logic', () => {
  it('median', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(median([])).toBe(0)
  })
  it('counts a near-duplicate sentence pair as a repeat', () => {
    expect(repeatCount([{ line: LONG }, { line: LONG }])).toBe(1)
    expect(repeatCount([{ line: LONG }, { line: 'Buyers asked for a matte satin version next.' }])).toBe(0)
  })
  it('replay strips placeholders and dedupes before measuring', () => {
    const r = replayCase(c([LONG, LONG, 'Then [Your answer: price] made sense.', 'Come to the market on Saturday morning.']))
    expect(r.placeholders).toBe(0)
    expect(r.repeats).toBe(0)
  })
  it('passes at baseline and within the 10% word floor', () => {
    expect(compareToBaseline(m(), base())).toEqual([])
    expect(compareToBaseline(m({ median_spoken_words: 90 }), base())).toEqual([])
  })
  it('blocks a >10% word drop', () => expect(compareToBaseline(m({ median_spoken_words: 89.9 }), base()).join()).toMatch(/median spoken words/))
  it('blocks any placeholder', () => expect(compareToBaseline(m({ placeholders: 1 }), base()).join()).toMatch(/placeholders/))
  it('blocks worse repeats', () => expect(compareToBaseline(m({ repeats: 3 }), base()).join()).toMatch(/repeats/))
  it('blocks worse blocking flags', () => expect(compareToBaseline(m({ blocking_flags: 4 }), base()).join()).toMatch(/blocking flags/))
  it('blocks a missing panel or changed case count', () => {
    expect(compareToBaseline({}, base()).join()).toMatch(/missing/)
    expect(compareToBaseline(m({ cases: 2 }), base()).join()).toMatch(/case count/)
  })
  it('better numbers pass', () => expect(compareToBaseline(m({ repeats: 0, blocking_flags: 0, median_spoken_words: 120 }), base())).toEqual([]))
})

describe('replay guard: stored panel 10/11 on current code (plan v6.1 §27)', () => {
  const ci = join(__dirname, '../../../../../scripts/ci')
  const fixture = JSON.parse(readFileSync(join(ci, 'fixtures/replay_panel_10_11.json'), 'utf8')) as { cases: Array<ReplayCase & { fictional: boolean }> }
  const baseline = JSON.parse(readFileSync(join(ci, 'replay_guard_baseline.json'), 'utf8')) as ReplayBaseline
  it('every fixture case is fictional', () => expect(fixture.cases.every((x) => x.fictional === true)).toBe(true))
  it('no violation against the committed baseline', () => {
    expect(compareToBaseline(replayByPanel(fixture.cases), baseline)).toEqual([])
  })
})
