import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { qcReplayAll, qcGuardViolations } from '../qcReplay'

const root = join(__dirname, '..', '..', '..', '..', '..')
const read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'))

describe('QC offline replay (plan v6.8 §33) over the stored fictional panels 10/11/12', () => {
  const fx = read('scripts/ops/fixtures/fictional-panel.json')
  const cases = [...read('scripts/ci/fixtures/replay_panel_10_11.json').cases, ...read('scripts/ci/fixtures/replay_panel_12.json').cases]
  const r = qcReplayAll(cases, fx.creators, fx.requests)

  it('holds the replay-guard invariants on every panel', () => {
    expect(qcGuardViolations(r.panels)).toEqual([])
  })

  it('reaches a median of at least 90 words with 0 placeholders and 0 repeats', () => {
    expect(r.all.median_words_after).toBeGreaterThanOrEqual(90)
    expect(r.all.placeholders).toBe(0)
    expect(r.all.repeats_after).toBe(0)
    expect(r.all.flags_after).toBeLessThanOrEqual(r.all.flags_before)
  })

  it('is deterministic', () => {
    expect(JSON.stringify(qcReplayAll(cases, fx.creators, fx.requests).all)).toBe(JSON.stringify(r.all))
  })
})
