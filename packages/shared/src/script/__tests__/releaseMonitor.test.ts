// Release monitor (docs/release/shadow-and-flags.md §6) and the golden-set
// runner (§4). Fictional rows and fictional panel requests only.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_REGISTRY, type FlagRegistry } from '../releaseFlags'
import { evaluateComponent, monitorActions, monitorReport, p90, windowOf, ROLLBACK, type MonitorRow } from '../releaseMonitor'
// @ts-expect-error plain .mjs ops script
import { runMonitor } from '../../../../../scripts/ops/releaseMonitor.mjs'
// @ts-expect-error plain .mjs ops script
import { armBodies, armResult, dryRunReport, goldenRequests, runGolden, summarize, GOLDEN_SET, parseArgs } from '../../../../../scripts/ops/goldenSet.mjs'

const NOW = Date.parse('2026-10-16T12:00:00Z')
const at = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString()
const row = (o: Partial<MonitorRow> = {}, i = 0): MonitorRow => ({ component: 'spine', created_at: at(i + 1), status: 'ok', live_latency_ms: 30_000, shadow_latency_ms: 32_000, live_invented: 0, shadow_invented: 0, error_code: null, ...o })
const many = (n: number, f: (i: number) => Partial<MonitorRow> = () => ({})) => Array.from({ length: n }, (_, i) => row(f(i), i))
const s1: FlagRegistry = { ...DEFAULT_REGISTRY, spine: { stage: 'S1', rolloutPct: 0, killed: false } }

describe('rules', () => {
  it('window: last 200 within 24 h, this component only', () => {
    const rows = [...many(250), row({ created_at: at(25 * 60) }), row({ component: 'planner' })]
    expect(windowOf(rows, 'spine', NOW)).toHaveLength(200)
    expect(windowOf([row({ created_at: at(25 * 60) })], 'spine', NOW)).toHaveLength(0)
  })
  it('p90', () => {
    expect(p90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(9)
    expect(p90([])).toBeNull()
  })
  it('healthy window: no trips', () => {
    expect(evaluateComponent('spine', many(50), new Set()).trips).toEqual([])
  })
  it('failure rate more than 2 points above baseline trips', () => {
    const r = evaluateComponent('spine', many(50, (i) => (i < 2 ? { status: 'failed', error_code: 'X' } : {})), new Set(['X']))
    expect(r.failure.new).toBe(0.04)
    expect(r.trips).toEqual(['failure_rate'])
    expect(evaluateComponent('spine', many(50, (i) => (i < 1 ? { status: 'failed', error_code: 'X' } : {})), new Set(['X'])).trips).toEqual([])
  })
  it('p90 latency more than 20 s above baseline trips', () => {
    expect(evaluateComponent('spine', many(50, () => ({ shadow_latency_ms: 51_000 })), new Set()).trips).toEqual(['p90_latency'])
    expect(evaluateComponent('spine', many(50, () => ({ shadow_latency_ms: 50_000 })), new Set()).trips).toEqual([])
  })
  it('invented rate above baseline trips', () => {
    expect(evaluateComponent('spine', many(50, (i) => (i === 0 ? { shadow_invented: 1 } : {})), new Set()).trips).toEqual(['invented_rate'])
  })
  it('a new error code over 1% trips; a known one does not', () => {
    const rows = many(100, (i) => (i < 2 ? { status: 'failed', error_code: 'NEW_CODE' } : {}))
    expect(evaluateComponent('spine', rows, new Set()).trips).toContain('new_error_code')
    expect(evaluateComponent('spine', rows, new Set(['NEW_CODE'])).trips).not.toContain('new_error_code')
  })
  it('budget_skipped and killed rows do not count; under the minimum sample nothing trips', () => {
    const r = evaluateComponent('spine', [...many(10, () => ({ status: 'failed' })), ...many(100, () => ({ status: 'budget_skipped' }))], new Set())
    expect(r.runs).toBe(10)
    expect(r.trips).toEqual([])
    expect(ROLLBACK.minRuns).toBe(20)
  })
  it('actions: only components past S0 and not yet killed', () => {
    const reports = monitorReport(many(50, () => ({ shadow_latency_ms: 90_000 })), [], NOW)
    expect(monitorActions(reports, DEFAULT_REGISTRY)).toEqual([])
    expect(monitorActions(reports, s1)).toEqual([{ component: 'spine', reasons: ['p90_latency'] }])
    expect(monitorActions(reports, { ...s1, spine: { ...s1.spine, killed: true } })).toEqual([])
  })
})

function fakeDb(tables: Record<string, unknown[] | 'missing'>) {
  const writes: Array<{ table: string; op: string; row: unknown }> = []
  const from = (table: string) => {
    let op = 'select'
    let payload: unknown = null
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'gte', 'lt', 'not', 'order', 'limit', 'in']) q[m] = () => q
    for (const w of ['insert', 'update']) q[w] = (r: unknown) => { op = w; payload = r; writes.push({ table, op: w, row: r }); return q }
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve(
      tables[table] === 'missing' ? { data: null, error: { code: '42P01', message: 'does not exist' } }
      : op === 'update' ? { data: [{ component: 'spine' }], error: null, payload }
      : { data: tables[table] ?? [], error: null }).then(ok)
    return q
  }
  return { db: { from }, writes }
}

describe('monitor script', () => {
  const tables = () => ({ shadow_runs: many(50, () => ({ shadow_latency_ms: 90_000 })), release_flags: [{ component: 'spine', stage: 'S1', rollout_pct: 0, killed: false }], ops_events: [] })
  it('dry run by default: reports the would-kill, writes nothing', async () => {
    const f = fakeDb(tables())
    const r = await runMonitor({ db: f.db, nowMs: NOW })
    expect(r.mode).toBe('dry_run')
    expect(r.actions).toEqual([{ component: 'spine', reasons: ['p90_latency'] }])
    expect(f.writes).toEqual([])
  })
  it('--apply without the owner switch stays a dry run', async () => {
    const f = fakeDb(tables())
    expect((await runMonitor({ db: f.db, apply: true, enabled: false, nowMs: NOW })).mode).toBe('dry_run')
    expect(f.writes).toEqual([])
  })
  it('enabled + apply: sets the kill switch and raises one ops event', async () => {
    const f = fakeDb(tables())
    const r = await runMonitor({ db: f.db, apply: true, enabled: true, nowMs: NOW })
    expect(r.applied).toEqual([{ component: 'spine', killed: true }])
    expect(f.writes.map((w) => `${w.table}.${w.op}`)).toEqual(['release_flags.update', 'ops_events.insert'])
    expect(f.writes[0].row).toMatchObject({ killed: true, killed_reason: 'p90_latency' })
    expect(f.writes[1].row).toMatchObject({ kind: 'release_rollback', severity: 'critical' })
  })
  it('missing shadow_runs: skipped, nothing written', async () => {
    const f = fakeDb({ shadow_runs: 'missing' })
    const r = await runMonitor({ db: f.db, apply: true, enabled: true, nowMs: NOW })
    expect(r.skipped).toBe('shadow_runs_missing')
    expect(f.writes).toEqual([])
  })
})

describe('golden set', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const fixture = JSON.parse(readFileSync(join(here, '../../../../../scripts/ops/fixtures/fictional-panel.json'), 'utf8'))
  it('is the first 24 fictional panel requests, versioned', () => {
    expect(GOLDEN_SET.size).toBe(24)
    expect(goldenRequests(fixture)).toEqual(fixture.requests.slice(0, 24))
    expect(() => goldenRequests({ ...fixture, version: 99 })).toThrow(/fixture version/)
  })
  it('dry run is the default and plans pairs against the cap', () => {
    const opts = parseArgs(['--component=spine'])
    expect(opts.live).toBe(false)
    const r = dryRunReport(fixture, opts)
    expect(r.mode).toBe('dry_run')
    expect(r.pairs).toHaveLength(24)
    expect(r.within_budget).toBe(true)
    expect(() => parseArgs(['--component=bogus'])).toThrow()
  })
  it('arms differ only in release_off for the component', () => {
    const a = armBodies({ goal: 'sell' }, 'spine', 't')
    expect(a.old.release_off).toEqual(['spine'])
    expect((a.new as Record<string, unknown>).release_off).toBeUndefined()
  })
  const bp = (I: number, words: number) => ({ script: [{ line: Array(words).fill('w').join(' ') }], invention_gate: { outcome: 'final', before: { I } } })
  it('runs pairs, compares invented, failure, latency and words, and stops at the cap', async () => {
    const scenarios = [0, 1, 2, 3].map((n) => ({ n, creator: 'mayas-coffee', body: { goal: 'sell' } }))
    let calls = 0
    const post = async (_sc: unknown, body: { release_off?: string[] }) => {
      calls++
      return body.release_off ? { status: 200, json: { id: `g${calls}`, blueprint: bp(2, 100) }, ms: 40_000 } : { status: 200, json: { id: `g${calls}`, blueprint: bp(0, 90) }, ms: 45_000 }
    }
    const run = await runGolden({ scenarios, component: 'spine', budget: 0.05, post, costOf: async (ids: string[]) => ids.length * 0.01 })
    expect(run.pairs).toHaveLength(3)
    expect(run.stopped).toBe('budget')
    const s = summarize(run.pairs)
    expect(s.old.invented_rate).toBe(1)
    expect(s.new.invented_rate).toBe(0)
    expect(s.new.mean_words).toBe(90)
    expect(s.gate).toMatchObject({ invented: true, failure: true, p90_latency: true, min_sample: false })
    expect(armResult({ status: 500, json: { code: 'X' }, ms: 1 })).toMatchObject({ failed: true, code: 'X', words: 0 })
  })
})
