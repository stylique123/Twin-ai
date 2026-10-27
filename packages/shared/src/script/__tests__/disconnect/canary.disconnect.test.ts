// DISCONNECT TEST: the canary switch (Fast Path v1 Track B).
// Evaluates the edge's OWN gate expressions with the env set both ways, so a
// refactor that drops the gate, reads it from the request body, or lets the
// canary leak to another account fails here. Fictional ids only. No model call.
import { describe, it, expect } from 'vitest'
import { isCanaryAccount } from '../../canary'
import { EDGE, edgeExpr, evalEdge, edgeAfter } from './edge'

const OWNER = '11111111-2222-3333-4444-555555555555'
const OTHER = '99999999-8888-7777-6666-555555555555'

const isCanary = (userId: string, isHeartbeat: boolean, env: Record<string, string | undefined>) =>
  evalEdge(edgeExpr('isCanary'), { isHeartbeat, isCanaryAccount, user: { id: userId } }, env) as boolean
const trialOn = (isHeartbeat: boolean, canary: boolean) =>
  evalEdge(edgeExpr('trialOn', 'isCanary'), { isHeartbeat, isCanary: canary }) as boolean

describe('canary disconnect', () => {
  it('the listed real account becomes the canary; any other real account does not', () => {
    expect(isCanary(OWNER, false, { CANARY_ACCOUNT_IDS: OWNER })).toBe(true)
    expect(isCanary(OTHER, false, { CANARY_ACCOUNT_IDS: OWNER })).toBe(false)
  })
  it('unset env means nobody is the canary (the safe default)', () => {
    expect(isCanary(OWNER, false, {})).toBe(false)
  })
  it('CANARY_KILL=1 rolls the listed account back to the old flow', () => {
    expect(isCanary(OWNER, false, { CANARY_ACCOUNT_IDS: OWNER, CANARY_KILL: '1' })).toBe(false)
  })
  it('a test account is never also the canary (its data stays test data)', () => {
    expect(isCanary(OWNER, true, { CANARY_ACCOUNT_IDS: OWNER })).toBe(false)
  })
  it('the canary gets the trial path; a plain real creator does not; test accounts are unchanged', () => {
    expect(trialOn(false, true)).toBe(true)
    expect(trialOn(false, false)).toBe(false)
    expect(trialOn(true, false)).toBe(true)
  })
  it('the gate reads only the server env, never the request body', () => {
    const expr = edgeExpr('isCanary')
    expect(expr).toContain("Deno.env.get('CANARY_ACCOUNT_IDS')")
    expect(expr).toContain("Deno.env.get('CANARY_KILL')")
    expect(expr).not.toMatch(/\bbody\b/)
  })
  it('the canary stays REAL data: the corpus flag is still the test-account flag alone', () => {
    expect(edgeAfter('// The flag every corpus reader filters on.', 160)).toContain('is_heartbeat: isHeartbeat,')
    expect(EDGE).not.toMatch(/is_heartbeat:\s*isHeartbeat\s*\|\|\s*isCanary/)
  })
  it('the release flags see the canary as served-new (per-component kill switches still apply)', () => {
    expect(EDGE).toContain('isTestAccount: isHeartbeat || isCanary, isCanary,')
  })
  it('canary scripts carry the tag the daily report reads', () => {
    expect(EDGE).toContain('...(isCanary ? { canary: true } : {}),')
  })
})
