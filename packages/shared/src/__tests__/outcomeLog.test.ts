// The rules this file exists to hold, in order of how much damage they prevent:
//
//   1. An ABSENT log is never reported as an EMPTY one.
//   2. A single reading never produces a change figure.
//   3. Recording a stat APPENDS; it does not only overwrite the scalar.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutcomeObservation } from '../editor/outcomes'
import {
  appendObservation, listDnaClaims, listPostObservations, recordPostStats, seriesByMetric,
} from '../outcomeLog'
import { initApi } from '../api'

// ---- A Supabase stand-in that records what was asked of it -----------------
interface Scripted { data?: unknown; error?: { code?: string } | null }
const script = new Map<string, Scripted>()
const inserts: Record<string, unknown>[] = []
const updates: Record<string, unknown>[] = []

function tableStub(table: string) {
  const result = script.get(table) ?? { data: [], error: null }
  const chain: Record<string, unknown> = {
    select: () => chain, eq: () => chain, order: () => chain,
    limit: () => Promise.resolve(result),
    insert: (row: Record<string, unknown>) => {
      inserts.push({ table, ...row })
      return Promise.resolve(script.get(`${table}:insert`) ?? { error: null })
    },
    update: (patch: Record<string, unknown>) => {
      updates.push({ table, ...patch })
      return { eq: () => Promise.resolve({ error: null }) }
    },
  }
  // `select(...).eq(...).order(...).limit(...)` ends in a promise, but
  // `select(...)` alone must also be awaitable for callers that don't paginate.
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
  return chain
}

beforeEach(() => {
  script.clear(); inserts.length = 0; updates.length = 0
  initApi({
    client: {
      from: (t: string) => tableStub(t),
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'owner-1' } } }) },
    } as never,
  })
})

const obs = (o: Partial<OutcomeObservation>): OutcomeObservation => ({
  metric: 'views', value: 100, observedAt: '2026-01-01T00:00:00.000Z', source: 'manual', ...o,
} as OutcomeObservation)

describe('an absent log is not an empty log', () => {
  it('42P01 reports the readings as UNKNOWN, not as none', async () => {
    script.set('post_outcome_observations', { data: null, error: { code: '42P01' } })
    const read = await listPostObservations('p1')
    // The screen must be able to tell "you have no readings yet" (a true
    // statement about a working log) from "we are not recording" (a statement
    // about a missing migration). A bare empty array cannot.
    expect(read).toEqual({ known: false, readings: [] })
  })

  it('a working but empty log is KNOWN and empty — the opposite claim', async () => {
    script.set('post_outcome_observations', { data: [], error: null })
    expect(await listPostObservations('p1')).toEqual({ known: true, readings: [] })
  })

  it('any other read failure is also unknown — it might have had rows', async () => {
    script.set('post_outcome_observations', { data: null, error: { code: '57014' } })
    expect((await listPostObservations('p1')).known).toBe(false)
  })

  it('an appended reading against a missing table is not reported as recorded', async () => {
    script.set('post_outcome_observations:insert', { error: { code: '42P01' } })
    expect(await appendObservation('p1', {
      metric: 'views', value: 10, observedAt: '2026-01-01T00:00:00.000Z', source: 'manual',
    })).toEqual({ ok: false, reason: 'not_recording' })
  })

  it('claims from a missing table are unknown, not "no claims"', async () => {
    script.set('dna_claims', { data: null, error: { code: '42P01' } })
    expect(await listDnaClaims()).toEqual({ known: false, claims: [] })
  })
})

describe('rows are validated on the way out', () => {
  it('bigint arriving as a string is still an integer reading', async () => {
    script.set('post_outcome_observations', {
      data: [{ metric: 'views', value: '9007199254740993', observed_at: '2026-01-01T00:00:00.000Z', source: 'platform_api' }],
      error: null,
    })
    expect((await listPostObservations('p1')).readings[0].value).toBe(9007199254740992)
  })

  it('an unknown metric is dropped rather than rendered', async () => {
    script.set('post_outcome_observations', {
      data: [
        { metric: 'engagement', value: 5, observed_at: '2026-01-01T00:00:00.000Z', source: 'manual' },
        { metric: 'views', value: 5, observed_at: '2026-01-01T00:00:00.000Z', source: 'manual' },
      ],
      error: null,
    })
    const { readings } = await listPostObservations('p1')
    expect(readings.map((r) => r.metric)).toEqual(['views'])
  })

  it('a correlation without a sample size never reaches a screen', async () => {
    // The CHECK constraint refuses it, so its presence would mean something
    // upstream is broken — which is precisely when a causal-sounding sentence
    // must NOT be shown.
    script.set('dna_claims', {
      data: [
        { claim_type: 'correlation', statement: 'lists win', sample_size: null, attribution: null },
        { claim_type: 'correlation', statement: 'lists win', sample_size: 6, attribution: null },
      ],
      error: null,
    })
    const { claims } = await listDnaClaims()
    expect(claims).toEqual([{ type: 'correlation', statement: 'lists win', sampleSize: 6 }])
  })
})

describe('what a scalar could never say', () => {
  it('groups by metric and reports change over the span', () => {
    const series = seriesByMetric([
      obs({ metric: 'views', value: 1000, observedAt: '2026-01-01T00:00:00.000Z' }),
      obs({ metric: 'views', value: 4200, observedAt: '2026-01-03T00:00:00.000Z' }),
      obs({ metric: 'likes', value: 30, observedAt: '2026-01-01T00:00:00.000Z' }),
    ])
    expect(series.map((s) => s.metric)).toEqual(['likes', 'views'])
    expect(series[1].change).toEqual({ delta: 3200, spanMs: 172800000 })
  })

  it('ONE reading yields no change — a total is not a delta', () => {
    const [s] = seriesByMetric([obs({ value: 12000 })])
    expect(s.change).toBeNull()
  })

  it('two readings at the SAME instant yield no change — a rate needs a span', () => {
    // spanMs of 0 divides into an infinite rate, and a UI formatting "per day"
    // would print it.
    const [s] = seriesByMetric([obs({ value: 10 }), obs({ value: 20 })])
    expect(s.change).toBeNull()
  })

  it('orders by when the number was TRUE, not when the row arrived', () => {
    const [s] = seriesByMetric([
      obs({ value: 900, observedAt: '2026-01-05T00:00:00.000Z' }),
      obs({ value: 100, observedAt: '2026-01-01T00:00:00.000Z' }), // backfilled
    ])
    expect(s.points.map((p) => p.value)).toEqual([100, 900])
    expect(s.change).toEqual({ delta: 800, spanMs: 345600000 })
  })
})

describe('recording a stat appends, it does not only overwrite', () => {
  it('writes the cache AND the log', async () => {
    const res = await recordPostStats('p1', 4200, 88)
    expect(updates).toEqual([{ table: 'posts', views: 4200, likes: 88 }])
    expect(inserts.map((i) => [i.metric, i.value, i.owner_id])).toEqual([
      ['views', 4200, 'owner-1'], ['likes', 88, 'owner-1'],
    ])
    expect(res.views).toEqual({ ok: true })
  })

  it('both readings share one observedAt — they were seen together', async () => {
    await recordPostStats('p1', 10, 2)
    expect(inserts[0].observed_at).toBe(inserts[1].observed_at)
  })

  it('omitting likes appends nothing for likes — 0 is not "no likes reported"', async () => {
    const res = await recordPostStats('p1', 10)
    expect(inserts.map((i) => i.metric)).toEqual(['views'])
    expect(res.likes).toBeNull()
  })

  it('a failed cache write does not stop the append — only one is unrecoverable', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    initApi({
      client: {
        from: (t: string) => (t === 'posts'
          ? { update: () => { throw new Error('nope') } }
          : tableStub(t)),
        auth: { getUser: () => Promise.resolve({ data: { user: { id: 'owner-1' } } }) },
      } as never,
    })
    expect((await recordPostStats('p1', 7)).views).toEqual({ ok: true })
    expect(inserts).toHaveLength(1)
    spy.mockRestore()
  })

  it('a signed-out caller appends nothing rather than a null owner', async () => {
    initApi({
      client: {
        from: (t: string) => tableStub(t),
        auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
      } as never,
    })
    expect(await appendObservation('p1', {
      metric: 'views', value: 1, observedAt: '2026-01-01T00:00:00.000Z', source: 'manual',
    })).toEqual({ ok: false, reason: 'rejected' })
    expect(inserts).toHaveLength(0)
  })

  it('an invalid reading is refused before it is sent', async () => {
    expect(await appendObservation('p1', {
      metric: 'views', value: -5, observedAt: '2026-01-01T00:00:00.000Z', source: 'manual',
    })).toEqual({ ok: false, reason: 'invalid' })
    expect(inserts).toHaveLength(0)
  })
})
