// CHECK THIS LINE (backlog d, trial only). Fictional fixtures: a made-up
// kite maker and her "Paper Kite".
import { describe, it, expect } from 'vitest'
import { buildCheckLines, applyCheckLineDecision, checkLinesLog, checkLineOn, CHECK_LINE_TEXT_MAX, type CheckLine } from '../checkLines.js'
import { guardScript } from '../writerGuards.js'
import { buildLedger, runInventionGate, type GateBlueprint } from '../inventionGate.js'

const bp = (): Record<string, unknown> => ({
  script: [
    { section: 'Hook', line: 'Here is the Paper Kite. I sewed the first one on my kitchen table.' },
    { section: 'Body', line: 'It folds into a pocket.' },
    { section: 'CTA', line: 'Grab a Paper Kite, link in bio.' },
  ],
  check_lines: [
    { line_index: 0, reason: 'event_unbacked', span: { start: 24, end: 66 } },
    { line_index: 1, reason: 'no_item', span: { start: 0, end: 23 } },
  ] as CheckLine[],
})
const keep = (line: string) => ({ line, rules: [] })

describe('buildCheckLines', () => {
  it('maps script review sentences to line index, reason and offsets; other surfaces are skipped', () => {
    const b: GateBlueprint = { script: [{ line: 'Here is the Paper Kite. I sewed the first one on my kitchen table.' }], hook_options: ['A hook.'] }
    const out = buildCheckLines(b, [{ i: 1, surface: 'script', reason: 'event_unbacked' }, { i: 2, surface: 'hook_option', reason: 'no_item' }])
    expect(out).toEqual([{ line_index: 0, reason: 'event_unbacked', span: { start: 24, end: 66 } }])
    const line = (b.script as Array<{ line: string }>)[0]!.line
    expect(line.slice(24, 66)).toBe('I sewed the first one on my kitchen table.')
  })
  it('no review lines → nothing; a missing reason reads unknown', () => {
    expect(buildCheckLines({ script: [{ line: 'One.' }] }, [])).toEqual([])
    expect(buildCheckLines({ script: [{ line: 'One.' }] }, [{ i: 0, surface: 'script' }])[0]!.reason).toBe('unknown')
  })
  it('the log holds offsets and ids, never text', () => {
    const log = JSON.stringify(checkLinesLog(bp().check_lines as CheckLine[]))
    expect(log).not.toMatch(/kitchen|Kite/)
    expect(log).toMatch(/"start":24/)
  })
  it('the gate records the reason only when checkLines is on', async () => {
    const ledger = buildLedger({ knowledge: [{ id: 'k1', kind: 'fact', text: 'I sew every Paper Kite by hand' }], products: [{ id: 'p', name: 'Paper Kite' }], targetProductId: 'p', now: 0 })
    const judge = async (p: string) => {
      const rows = [...(p.split('SENTENCES:')[1] ?? '').matchAll(/^(\d+)\. /gm)]
      return JSON.stringify({ sentences: rows.map((m) => ({ i: Number(m[1]), class: 'S', item_ids: ['k1'] })) })
    }
    const b: GateBlueprint = { script: [{ line: 'Last summer I flew the Paper Kite over a lighthouse.' }] }
    const on = await runInventionGate({ blueprint: b, ledger, products: [{ id: 'p', name: 'Paper Kite' }], targetProductId: 'p', ruleReview: true, checkLines: true }, { judge, rewrite: async () => '{"rewrites":[]}' })
    const off = await runInventionGate({ blueprint: b, ledger, products: [{ id: 'p', name: 'Paper Kite' }], targetProductId: 'p', ruleReview: true }, { judge, rewrite: async () => '{"rewrites":[]}' })
    expect(on.record.review_lines).toEqual([{ i: 0, surface: 'script', reason: 'event_unbacked' }])
    expect(off.record.review_lines).toEqual([{ i: 0, surface: 'script' }])
  })
})

describe('applyCheckLineDecision', () => {
  it('confirm: line kept, her claim returned as the fact, decision recorded', () => {
    const r = applyCheckLineDecision({ blueprint: bp(), line_index: 0, decision: 'confirm', guard: keep, now: 'T' })
    if (!r.ok) throw new Error(r.code)
    expect(r.fact).toBe('I sewed the first one on my kitchen table.')
    expect(r.blueprint.script).toEqual(bp().script)
    expect((r.blueprint.check_lines as CheckLine[])[0]!.decision).toBe('confirm')
    expect(r.blueprint.check_line_decisions).toEqual([{ line_index: 0, decision: 'confirm', reason: 'event_unbacked', at: 'T' }])
  })
  it('edit: her text replaces the line after the guards', () => {
    const r = applyCheckLineDecision({ blueprint: bp(), line_index: 1, decision: 'edit', text: '  It folds   flat. ', guard: keep, now: 'T' })
    if (!r.ok) throw new Error(r.code)
    expect((r.blueprint.script as Array<{ line: string; section: string }>)[1]).toEqual({ section: 'Body', line: 'It folds flat.' })
    expect(r.fact).toBeNull()
  })
  it('edit: the deterministic guards run on her text (real writer guards)', () => {
    const guard = (line: string) => {
      const g = guardScript({ script: [{ line }], hook_options: [], ledger: [] })
      return { line: String(g.script[0]?.line ?? ''), rules: Object.keys(g.record.rules) }
    }
    const r = applyCheckLineDecision({ blueprint: bp(), line_index: 1, decision: 'edit', text: 'Only 3 left, order today only.', guard })
    expect(r).toMatchObject({ ok: false, code: 'guard_dropped' })
    if (r.ok) return
    expect(r.rules?.length).toBeGreaterThan(0)
  })
  it('edit: text required and bounded', () => {
    expect(applyCheckLineDecision({ blueprint: bp(), line_index: 1, decision: 'edit', text: ' ', guard: keep })).toMatchObject({ ok: false, code: 'text_required' })
    expect(applyCheckLineDecision({ blueprint: bp(), line_index: 1, decision: 'edit', text: 'x'.repeat(CHECK_LINE_TEXT_MAX + 1), guard: keep })).toMatchObject({ ok: false, code: 'text_too_long' })
  })
  it('remove: the beat is dropped and later check lines shift down', () => {
    const r = applyCheckLineDecision({ blueprint: bp(), line_index: 0, decision: 'remove', guard: keep, now: 'T' })
    if (!r.ok) throw new Error(r.code)
    expect((r.blueprint.script as unknown[]).length).toBe(2)
    expect(r.line).toBeNull()
    const cl = r.blueprint.check_lines as CheckLine[]
    expect(cl[0]).toMatchObject({ line_index: 0, decision: 'remove' })
    expect(cl[1]).toMatchObject({ line_index: 0, reason: 'no_item' })
    expect(cl[1]!.decision).toBeUndefined()
  })
  it('refuses a line that is not a check line, a decided one, and a bad decision', () => {
    expect(applyCheckLineDecision({ blueprint: bp(), line_index: 2, decision: 'remove', guard: keep })).toMatchObject({ ok: false, code: 'not_a_check_line' })
    expect(applyCheckLineDecision({ blueprint: bp(), line_index: -1, decision: 'remove', guard: keep })).toMatchObject({ ok: false, code: 'bad_index' })
    expect(applyCheckLineDecision({ blueprint: bp(), line_index: 0, decision: 'keep', guard: keep })).toMatchObject({ ok: false, code: 'bad_decision' })
    const once = applyCheckLineDecision({ blueprint: bp(), line_index: 0, decision: 'confirm', guard: keep })
    if (!once.ok) throw new Error('first')
    expect(applyCheckLineDecision({ blueprint: once.blueprint, line_index: 0, decision: 'remove', guard: keep })).toMatchObject({ ok: false, code: 'already_decided' })
  })
  it('does not mutate the input blueprint', () => {
    const b = bp()
    const before = JSON.stringify(b)
    applyCheckLineDecision({ blueprint: b, line_index: 0, decision: 'remove', guard: keep })
    expect(JSON.stringify(b)).toBe(before)
  })
})

describe('kill switch', () => {
  it('on unless CHECK_LINE_KILL is 1', () => {
    expect(checkLineOn(undefined)).toBe(true)
    expect(checkLineOn('0')).toBe(true)
    expect(checkLineOn('1')).toBe(false)
    expect(checkLineOn(' 1 ')).toBe(false)
  })
})
