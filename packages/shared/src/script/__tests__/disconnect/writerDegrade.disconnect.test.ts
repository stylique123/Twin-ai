// DISCONNECT TEST, ledger row 20: writer degrade at the deadline (#1290).
// Kill switches WRITER_DEADLINE=off and WRITER_DEGRADE=off. Fake clock; no model call.
import { describe, it, expect } from 'vitest'
import { deadlineTimeout, optionalPassAllowed } from '../../writerDeadline'
import { edgeExpr, evalEdge, EDGE } from './edge'

const T0 = 1_000_000
/** The edge's ladder fields (index.ts ~12679), evaluated from its source. */
function ladderFor(env: Record<string, string>, trialOn = true): { startedAt: number | undefined; degrade: boolean } {
  const startedAt = evalEdge(edgeExpr('writerDeadline'), { trialOn, reqStartedAt: T0 }, env) as number | undefined
  const degrade = evalEdge(edgeExpr('writerDegradeOn', 'WRITER_DEGRADE'), { writerDeadline: startedAt }, env) as boolean
  return { startedAt, degrade }
}
/**
 * A slow request on a fake clock: attempt 0 hangs for its whole cap, the
 * fallback needs 52 s. Returns whether the writer returned, and whether an
 * optional pass may start afterwards.
 */
function runFor(env: Record<string, string>) {
  const { startedAt, degrade } = ladderFor(env)
  let now = T0 + 6_000
  const t0 = deadlineTimeout(0, 75_000, startedAt, now, { last: false, degrade })!
  now += t0 // hung: times out
  const t1 = deadlineTimeout(1, 55_000, startedAt, now, { last: true, degrade })
  const returned = t1 !== null && t1 >= 52_000
  if (returned) now += 52_000
  return { returned, optionalPass: optionalPassAllowed(T0, now, degrade), t1 }
}

describe('WRITER_DEADLINE / WRITER_DEGRADE disconnect', () => {
  it('the edge ladder: deadline and degrade on for the trial; each switch turns it off', () => {
    expect(ladderFor({})).toEqual({ startedAt: T0, degrade: true })
    expect(ladderFor({ WRITER_DEGRADE: 'off' })).toEqual({ startedAt: T0, degrade: false })
    expect(ladderFor({ WRITER_DEADLINE: 'off' })).toEqual({ startedAt: undefined, degrade: false })
    expect(ladderFor({}, false)).toEqual({ startedAt: undefined, degrade: false })
  })
  it('on: the last attempt gets the reserve and the writer returns, optional passes skipped; WRITER_DEGRADE=off: it fails', () => {
    const on = runFor({})
    const off = runFor({ WRITER_DEGRADE: 'off' })
    expect(on).not.toEqual(off)
    expect(on.returned).toBe(true)
    expect(on.optionalPass).toBe(false)
    expect(off.returned).toBe(false)
  })
  it('the edge still passes degrade to the ladder and asks optionalPassAllowed', () => {
    expect(EDGE).toContain(': writerDeadline != null ? { startedAt: writerDeadline, degrade: writerDegradeOn } : {}')
    expect(EDGE).toContain('const ok = optionalPassAllowed(reqStartedAt, Date.now(), writerDegradeOn)')
    expect(EDGE).toContain("deadlineTimeout(i, a.timeoutMs, ladder?.startedAt, Date.now(), { last: i === attempts.length - 1, degrade: ladder?.degrade === true })")
  })
})
