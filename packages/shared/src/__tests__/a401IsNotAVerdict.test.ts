/**
 * ⚠️ THE MATRIX COSTS THE BETTER PART OF AN HOUR AND ONE 401 DESTROYED IT.
 *
 * `authSession.mjs`'s own header records that such a 401 "has already been
 * miscounted once as one of the matrix's two real failures". It happened again
 * on 2026-08-25: run 474 died at minute 35 on `start 401: Not authenticated`,
 * AFTER G4b, G4c, G5, G5b and G5c had all passed in that same phase.
 *
 * The asymmetry was the tell: `startProject` already retried a 429, because a
 * rate window is understood as a fact about the moment. A transient auth
 * verification failure is the same kind of fact and was the only one treated
 * as final.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const AUTH = readFileSync(join(root, 'scripts', 'staging-integration', 'authSession.mjs'), 'utf8')
const P5 = readFileSync(join(root, 'scripts', 'staging-integration', 'phase5.mjs'), 'utf8')

// The helper is plain JS in an .mjs the suite cannot import directly under this
// config, so its BEHAVIOUR is reproduced here from the same source text and the
// source is asserted to still say what this models.
// ⚠️ THE PARAMETERS WERE UNTYPED, SO THE MODEL HAD NO CONTRACT. This function
//  exists to reproduce `authSession.mjs`'s behaviour for a suite that cannot
//  import it, with the source asserted below to still say what this models. An
//  untyped reproduction can drift from what it reproduces in a way no assertion
//  here would notice — `call` returning something without `status`, `client`
//  being a bare object with no `auth`. Typing them states the contract the
//  parity assertion is about.
type EdgeCall = () => Promise<{ status: number }>
type RefreshableClient = { auth: { refreshSession: () => Promise<unknown> } } | null

async function callEdgeAuthRetried(
  call: EdgeCall, client: RefreshableClient, _label: string,
): Promise<{ status: number }> {
  const first = await call()
  if (first.status !== 401 || !client) return first
  await client.auth.refreshSession()
  return call()
}

const clientThatRefreshes = () => {
  let refreshes = 0
  return {
    refreshes: () => refreshes,
    auth: { refreshSession: async () => { refreshes++; return { data: { session: { access_token: 't' } } } } },
  }
}

describe('a transient 401 is absorbed, once', () => {
  it('refreshes the session and asks again', async () => {
    const c = clientThatRefreshes()
    let calls = 0
    const r = await callEdgeAuthRetried(async () => {
      calls++
      return calls === 1 ? { status: 401, body: { error: 'Not authenticated' } } : { status: 200, body: { projectId: 'p1' } }
    }, c, 'start-editor-v2')
    expect(r.status).toBe(200)
    expect(calls).toBe(2)
    expect(c.refreshes()).toBe(1)
  })
})

describe('a real authorization defect still fails the run', () => {
  // ⚖️ THIS IS THE PROPERTY THAT KEEPS THE CHECK HONEST. Nothing is lowered,
  // skipped, or accepted unauthenticated — a genuine 401 answers a brand-new
  // token the same way and the run still goes red.
  it('a 401 that survives a fresh token is returned as a 401', async () => {
    const c = clientThatRefreshes()
    let calls = 0
    const r = await callEdgeAuthRetried(async () => {
      calls++
      return { status: 401, body: { error: 'Not authenticated' } }
    }, c, 'start-editor-v2')
    expect(r.status).toBe(401)
    expect(calls).toBe(2)
  })

  // ⚠️ EXACTLY ONE RETRY. A loop would turn a real auth break into a hang.
  it('never asks a third time', async () => {
    const c = clientThatRefreshes()
    let calls = 0
    await callEdgeAuthRetried(async () => { calls++; return { status: 401, body: {} } }, c, 'x')
    expect(calls).toBe(2)
    expect(c.refreshes()).toBe(1)
  })
})

describe('everything that is not a 401 is untouched', () => {
  it.each([[200], [429], [500], [504]])('status %i is returned as-is, with no refresh', async (status) => {
    const c = clientThatRefreshes()
    let calls = 0
    const r = await callEdgeAuthRetried(async () => { calls++; return { status, body: {} } }, c, 'x')
    expect(r.status).toBe(status)
    expect(calls).toBe(1)
    expect(c.refreshes()).toBe(0)
  })
})

describe('the shipped source still says what this models', () => {
  it('the helper exists and retries exactly once', () => {
    expect(AUTH).toMatch(/export async function callEdgeAuthRetried/)
    expect(AUTH).toMatch(/const second = await call\(\)/)
    // no loop — the second 401 is the one that means something
    expect(AUTH.slice(AUTH.indexOf('callEdgeAuthRetried'))).not.toMatch(/for \(|while \(/)
  })

  it('forces a refresh rather than trusting the clock', () => {
    expect(AUTH).toMatch(/export async function freshAuthHeader/)
    expect(AUTH).toMatch(/client\.auth\.refreshSession\(\)/)
  })

  // ⚠️ THE STEP THAT ACTUALLY DIED. A helper nobody calls fixes nothing.
  it('startProject routes through it', () => {
    expect(P5).toMatch(/import \{ authHeader, callEdgeAuthRetried \} from '\.\/authSession\.mjs'/)
    expect(P5).toMatch(/await callEdgeAuthRetried\(/)
  })

  // ⚖️ AND THE 429 RETRY IS UNTOUCHED — it was already right.
  it('leaves the rate-window retry alone', () => {
    expect(P5).toMatch(/if \(r\.status === 429 && attempt < 2\)/)
  })
})
