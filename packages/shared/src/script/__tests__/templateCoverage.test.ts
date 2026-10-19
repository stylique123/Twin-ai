import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { templateCoverage, fixtureLedger, isVerifiedDated, type PanelFixture } from '../templates/templateCoverage'

// FICTIONAL panel only (scripts/ops/fixtures).
const FIXTURE = join(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..', '..', 'scripts', 'ops', 'fixtures', 'fictional-panel.json')
const fx = JSON.parse(readFileSync(FIXTURE, 'utf8')) as PanelFixture
const NOW = Date.parse('2026-10-19T00:00:00Z')

describe('template coverage harness', () => {
  const full = templateCoverage(fx, NOW)
  const first40 = templateCoverage(fx, NOW, fx.requests.slice(0, 40))

  it('report', () => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ unreached_by_first_40: first40.unreached, unreached: full.unreached, missed_intended: full.missed_intended.length }, null, 1))
  })

  it('every template T1-T13 is reachable from some fixture request and duration', () => {
    expect(full.unreached).toEqual([])
  })

  it('the requests added after the first 40 each reach their intended template at their own profile', () => {
    const added = fx.requests.slice(40).map((r) => r.id)
    expect(added.length).toBeGreaterThan(0)
    expect(full.missed_intended.filter((m) => added.includes(m.request))).toEqual([])
  })

  it('under the v1 ranking the panel never reaches T5-T10 (why v2 exists)', () => {
    const v1 = templateCoverage(fx, NOW, fx.requests, 'v1')
    expect(v1.unreached.length).toBeGreaterThan(0)
  })

  it('is deterministic', () => {
    expect(templateCoverage(fx, NOW)).toEqual(full)
  })

  it('dated slots fill only from verified dated items', () => {
    expect(full.dated_violations).toEqual([])
    const hits = [...full.reached.T5!, ...full.reached.T10!]
    expect(hits.length).toBeGreaterThan(0)
  })

  it('an unverified dated item never enters the ledger, so T5/T10 are not reached from it', () => {
    const r = fx.requests.find((x) => (x.outside ?? []).some((o) => o.verified))!
    const unverified = { ...r, id: 'x-unverified', outside: (r.outside ?? []).map((o) => ({ ...o, verified: false })) }
    const { ledger } = fixtureLedger(fx, unverified, NOW)
    expect(ledger.some(isVerifiedDated)).toBe(false)
    const rep = templateCoverage(fx, NOW, [unverified])
    expect(rep.reached.T5).toEqual([])
    expect(rep.reached.T10).toEqual([])
  })

  it('the first 24 requests are unchanged by additions (golden set)', () => {
    expect(fx.requests.slice(0, 24).every((r) => !('outside' in r))).toBe(true)
  })
})
