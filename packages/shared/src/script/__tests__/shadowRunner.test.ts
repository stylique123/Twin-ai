// S1 shadow runner (docs/release/shadow-and-flags.md §3). Fictional ids and
// fictional blueprints only. Checks: inert at the default registry and default
// env; the cap, sample rate and missing table; nothing but shadow_runs and the
// usage ledger is written; logs carry no script text.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { COMPONENTS, DEFAULT_REGISTRY, type FlagRegistry } from '../releaseFlags'
import {
  decideShadow, errorCodeOf, inventedOf, killedComponents, ledgerUsd, postableOf, registryFromRows, registryVersion,
  shadowComponents, shadowConfigFrom, shadowLog, shadowRunRow, usdOf, wordsOf,
} from '../shadowRunner'
import { runShadow, scheduleShadowRun, loadReleaseRegistry, _resetShadowCaches } from '../../../../../supabase/functions/_shared/shadowRun'
import { readOnlyClient } from '../../../../../supabase/functions/_shared/readOnlyClient'

const SECRET_LINE = 'Fictional Maya says the secret roast is forty-two seconds longer.'
const bp = (I: number, line = SECRET_LINE) => ({ script: [{ line }, { line: 'A second fictional line here.' }], invention_gate: { outcome: 'final', before: { I } } })
const real = { userId: '00000000-0000-4000-8000-000000000001', isTestAccount: false }
const s1 = (c: string): FlagRegistry => ({ ...DEFAULT_REGISTRY, [c]: { stage: 'S1', rolloutPct: 0, killed: false } }) as FlagRegistry
const env = (o: Record<string, string>) => ({ get: (k: string) => o[k] })
const cfgOn = { dailyUsd: 5, sampleRate: 1, maxTokens: 200_000, timeoutMs: 60_000 }

describe('pure decisions', () => {
  it('env defaults are off: cap 0, sample 0.1', () => {
    const c = shadowConfigFrom(() => undefined)
    expect(c.dailyUsd).toBe(0)
    expect(c.sampleRate).toBe(0.1)
    expect(shadowConfigFrom((k) => ({ SHADOW_DAILY_USD: '3', SHADOW_SAMPLE_RATE: '7' } as Record<string, string>)[k]).sampleRate).toBe(1)
  })
  it('default registry: no component is shadowed for 500 real users', () => {
    for (let i = 0; i < 500; i++) expect(shadowComponents({ userId: `u${i}`, isTestAccount: false }, DEFAULT_REGISTRY)).toEqual([])
    expect(shadowComponents(real, undefined)).toEqual([])
  })
  it('registryFromRows: S0 unless a valid row says otherwise; junk is ignored', () => {
    const r = registryFromRows([{ component: 'spine', stage: 'S1', rollout_pct: 0, killed: false }, { component: 'nope', stage: 'S3' }, { component: 'planner', stage: 'S9', killed: 'yes' }])
    expect(r.spine.stage).toBe('S1')
    expect(r.planner).toEqual({ stage: 'S0', rolloutPct: 0, killed: false })
    expect(registryFromRows(null)).toEqual(DEFAULT_REGISTRY)
    expect(shadowComponents(real, r)).toEqual(['spine'])
    expect(registryVersion(r)).not.toBe(registryVersion(DEFAULT_REGISTRY))
  })
  it('test accounts never shadow; killed components are listed past S0 only', () => {
    expect(shadowComponents({ ...real, isTestAccount: true }, s1('spine'))).toEqual([])
    const k = { ...s1('spine'), spine: { stage: 'S1', rolloutPct: 0, killed: true } } as FlagRegistry
    expect(shadowComponents(real, k)).toEqual([])
    expect(killedComponents(real, k)).toEqual(['spine'])
    expect(killedComponents(real, { ...DEFAULT_REGISTRY, spine: { stage: 'S0', rolloutPct: 0, killed: true } } as FlagRegistry)).toEqual([])
  })
  const base = { shadow: ['spine'] as const, killed: [] as const, cfg: cfgOn, tableReady: true, spentTodayUsd: 0, roll: 0, pick: 0 }
  it('decideShadow: off, sample, table, budget, run', () => {
    expect(decideShadow({ ...base, shadow: [] })).toMatchObject({ run: false, status: 'off' })
    expect(decideShadow({ ...base, cfg: { ...cfgOn, dailyUsd: 0 } })).toMatchObject({ run: false, status: 'off' })
    expect(decideShadow({ ...base, roll: 0.5, cfg: { ...cfgOn, sampleRate: 0.2 } })).toMatchObject({ run: false, status: 'not_sampled' })
    expect(decideShadow({ ...base, tableReady: false })).toMatchObject({ run: false, status: 'no_table', record: false })
    expect(decideShadow({ ...base, spentTodayUsd: 5 })).toMatchObject({ run: false, status: 'budget_skipped', record: true })
    expect(decideShadow(base)).toEqual({ run: true, component: 'spine' })
    expect(decideShadow({ ...base, shadow: [], killed: ['planner'] })).toMatchObject({ status: 'killed', record: true, component: 'planner' })
  })
  it('cost: ledger formula, unknown model at the dearest price', () => {
    const prices = { a: { input_per_m: 1, output_per_m: 10 } }
    expect(usdOf({ a: { input: 1_000_000, output: 100_000, thinking: 100_000 } }, prices)).toBe(3)
    expect(usdOf({ b: { input: 1_000_000 } }, prices)).toBe(1)
    expect(ledgerUsd([{ model: 'a', input_tokens: 2_000_000, output_tokens: 0, thinking_tokens: 0 }], prices)).toBe(2)
  })
  it('blueprint measures', () => {
    expect(inventedOf(bp(2))).toBe(2)
    expect(inventedOf({})).toBeNull()
    expect(wordsOf(bp(0))).toBe(15)
    expect(postableOf(bp(0))).toBe(true)
    expect(postableOf(bp(1))).toBe(false)
    expect(errorCodeOf(409, { code: 'READINESS_INCOMPLETE' })).toBe('READINESS_INCOMPLETE')
    expect(errorCodeOf(500, { error: SECRET_LINE })).toBe('http_500')
  })
  it('shadowLog keeps ids, counts and status; drops text and objects', () => {
    const line = shadowLog('shadow_run', { component: 'spine', status: 'ok', tokens: 9, script: SECRET_LINE, reason: SECRET_LINE, live_output: bp(0) })
    expect(JSON.parse(line)).toEqual({ event: 'shadow_run', component: 'spine', status: 'ok', tokens: 9 })
  })
  it('shadowRunRow: skipped rows carry no shadow output', () => {
    const r = shadowRunRow({ component: 'spine', registryVersion: 'r1', status: 'budget_skipped', liveBlueprint: bp(0), shadowBlueprint: bp(3) })
    expect(r.shadow_output).toBeNull()
    expect(r.shadow_invented).toBeNull()
    expect(r.live_invented).toBe(0)
  })
})

// A fake service client: records writes, answers reads from `tables`.
function fakeDb(tables: Record<string, unknown[] | 'missing'>) {
  const writes: Array<{ table: string; op: string; row: unknown }> = []
  const from = (table: string) => {
    const q: Record<string, unknown> = {}
    const res = () => tables[table] === 'missing'
      ? { data: null, error: { code: '42P01', message: `relation "public.${table}" does not exist` } }
      : { data: tables[table] ?? [], error: null }
    for (const m of ['select', 'eq', 'gte', 'lt', 'not', 'order', 'limit', 'in']) q[m] = () => q
    q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(res()).then(ok, bad)
    for (const op of ['insert', 'update', 'upsert', 'delete']) q[op] = (row: unknown) => { writes.push({ table, op, row }); return q }
    return q
  }
  return { db: { from, rpc: (fn: string) => { writes.push({ table: `rpc:${fn}`, op: 'rpc', row: null }); return Promise.resolve({ data: null, error: null }) } }, writes }
}

describe('edge runner (fake db, fake fetch)', () => {
  const ctx = (db: unknown, registry: FlagRegistry | undefined = s1('spine')) => ({
    admin: db, env: env({ SHADOW_DAILY_USD: '5', SHADOW_SAMPLE_RATE: '1' }), supabaseUrl: 'https://fictional.example', serviceKey: 'svc',
    account: real, registry, body: { goal: 'sell', reference_note: 'fictional', idempotency_key: 'k1' }, generationId: '00000000-0000-4000-8000-0000000000aa', liveLatencyMs: 30_000, liveBlueprint: bp(1),
  })
  let logs: string[] = []
  beforeEach(() => {
    _resetShadowCaches()
    logs = []
    vi.spyOn(console, 'log').mockImplementation((s: string) => { logs.push(String(s)) })
    vi.spyOn(console, 'warn').mockImplementation((s: string) => { logs.push(String(s)) })
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('missing shadow_runs: nothing written, nothing fetched, one warning across runs', async () => {
    const f = fakeDb({ shadow_runs: 'missing' })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await runShadow(ctx(f.db) as never, ['spine'], [], cfgOn)
    await runShadow(ctx(f.db) as never, ['spine'], [], cfgOn)
    expect(f.writes).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(logs.filter((l) => l.includes('shadow_runs_missing'))).toHaveLength(1)
  })
  it('budget reached: records budget_skipped, spends nothing', async () => {
    const f = fakeDb({ shadow_runs: [], ai_model_prices: [{ model: 'm', input_per_m: 1, output_per_m: 1 }], ai_usage_ledger: [{ model: 'm', input_tokens: 6_000_000, output_tokens: 0, thinking_tokens: 0 }] })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await runShadow(ctx(f.db) as never, ['spine'], [], cfgOn)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(f.writes).toHaveLength(1)
    expect(f.writes[0]).toMatchObject({ table: 'shadow_runs', op: 'insert', row: { status: 'budget_skipped', component: 'spine' } })
  })
  it('a run: re-sends the request as a shadow, writes only the ledger and shadow_runs, logs no text', async () => {
    const f = fakeDb({ shadow_runs: [], ai_model_prices: [{ model: 'm', input_per_m: 1, output_per_m: 1 }], ai_usage_ledger: [] })
    const fetchSpy = vi.fn(async (_u: string, init: { headers: Record<string, string>; body: string }) => {
      expect(init.headers['x-twin-shadow']).toBe('spine')
      expect(init.headers['x-twin-shadow-owner']).toBe(real.userId)
      expect(JSON.parse(init.body).idempotency_key).toBeUndefined()
      return new Response(JSON.stringify({ shadow: true, blueprint: bp(0), ai_usage: { m: { calls: 2, input: 1000, output: 500, thinking: 0 } } }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchSpy)
    await runShadow(ctx(f.db) as never, ['spine'], [], cfgOn)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(f.writes.map((w) => w.table).sort()).toEqual(['ai_usage_ledger', 'shadow_runs'])
    const ledger = f.writes.find((w) => w.table === 'ai_usage_ledger')!.row as Array<Record<string, unknown>>
    expect(ledger[0]).toMatchObject({ traffic: 'shadow', stage: 'shadow_spine', input_tokens: 1000 })
    const row = f.writes.find((w) => w.table === 'shadow_runs')!.row as Record<string, unknown>
    expect(row).toMatchObject({ status: 'ok', live_invented: 1, shadow_invented: 0, shadow_postable: true, shadow_cost_usd: 0.0015 })
    expect(logs.join('\n')).not.toContain('secret roast')
  })
  it('a failed re-run records its code only', async () => {
    const f = fakeDb({ shadow_runs: [], ai_model_prices: [], ai_usage_ledger: [] })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'SCRIPT_EMPTIED', error: SECRET_LINE }), { status: 500 })))
    await runShadow(ctx(f.db) as never, ['spine'], [], cfgOn)
    const row = f.writes.find((w) => w.table === 'shadow_runs')!.row as Record<string, unknown>
    expect(row).toMatchObject({ status: 'failed', error_code: 'SCRIPT_EMPTIED', shadow_output: null })
    expect(logs.join('\n')).not.toContain('secret roast')
  })
  it('scheduleShadowRun is a no-op at the default registry, for test accounts, and with the cap at 0', async () => {
    const f = fakeDb({ shadow_runs: [] })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const waitUntil = vi.fn()
    vi.stubGlobal('EdgeRuntime', { waitUntil })
    scheduleShadowRun({ ...ctx(f.db), registry: undefined } as never)
    scheduleShadowRun(ctx(f.db, DEFAULT_REGISTRY) as never)
    scheduleShadowRun({ ...ctx(f.db), account: { ...real, isTestAccount: true } } as never)
    scheduleShadowRun({ ...ctx(f.db), env: env({}) } as never)
    expect(waitUntil).not.toHaveBeenCalled()
    scheduleShadowRun(ctx(f.db) as never)
    expect(waitUntil).toHaveBeenCalledTimes(1)
  })
  it('loadReleaseRegistry reads nothing unless RELEASE_REGISTRY_SOURCE=table', async () => {
    const f = fakeDb({ release_flags: [{ component: 'spine', stage: 'S1', rollout_pct: 0, killed: false }] })
    const spy = vi.spyOn(f.db, 'from')
    expect(await loadReleaseRegistry(f.db, env({}))).toBeUndefined()
    expect(spy).not.toHaveBeenCalled()
    expect((await loadReleaseRegistry(f.db, env({ RELEASE_REGISTRY_SOURCE: 'table' })))!.spine.stage).toBe('S1')
    expect(await loadReleaseRegistry(fakeDb({ release_flags: 'missing' }).db, env({ RELEASE_REGISTRY_SOURCE: 'table' }))).toBeUndefined()
  })
})

describe('read-only client for the re-run', () => {
  it('blocks table writes, storage writes and non-read RPCs; reads pass through', async () => {
    const f = fakeDb({ generations: [{ id: 'g1' }] })
    const storageWrites: string[] = []
    const client = { ...f.db, storage: { from: () => ({ upload: () => { storageWrites.push('upload'); return Promise.resolve({}) }, download: () => Promise.resolve({ data: 'x' }) }) } }
    const blocked: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ro = readOnlyClient(client, (w) => blocked.push(w)) as any
    const ins = await ro.from('generations').insert({ user_id: 'u' }).select('*').single()
    expect(ins).toMatchObject({ data: null, error: null })
    await ro.from('credits').update({ n: 1 }).eq('id', 1).then(() => {}, () => {})
    expect(await ro.rpc('spend_credits', {})).toMatchObject({ data: null, error: null })
    await ro.storage.from('b').upload()
    expect((await ro.from('generations').select('id')) as unknown).toMatchObject({ data: [{ id: 'g1' }] })
    await ro.rpc('brain_trends', {})
    expect(f.writes.map((w) => w.table)).toEqual(['rpc:brain_trends'])
    expect(storageWrites).toEqual([])
    expect(blocked).toEqual(['generations.insert', 'credits.update', 'rpc.spend_credits', 'storage.b.upload'])
  })
})

describe('every component can be shadowed on its own', () => {
  for (const c of COMPONENTS) it(c, () => expect(shadowComponents(real, s1(c))).toEqual([c]))
})
