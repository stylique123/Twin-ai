// Release flags (owner rule): at the default registry every component behaves
// exactly as today's `trialOn` does, for real and test accounts alike.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPONENTS, DEFAULT_REGISTRY, stageFor, componentOn, bucketOf, type Component, type FlagRegistry } from '../releaseFlags'

// Today's rule in generate-blueprint: trialOn = isHeartbeat (heartbeat or panel),
// switched off for one request when that test account sends trial_off: true.
function trialOnToday(isTestAccount: boolean, trialOffRequested: boolean): boolean {
  let t = isTestAccount
  if (isTestAccount && trialOffRequested) t = false
  return t
}

const cases = [
  { name: 'real creator', isTestAccount: false, trialOff: false },
  { name: 'real creator sending trial_off (ignored)', isTestAccount: false, trialOff: true },
  { name: 'test account', isTestAccount: true, trialOff: false },
  { name: 'test account with trial_off', isTestAccount: true, trialOff: true },
]

describe('default registry = today\'s trialOn', () => {
  it('every component starts at S0, 0%, not killed', () => {
    for (const c of COMPONENTS) expect(DEFAULT_REGISTRY[c]).toEqual({ stage: 'S0', rolloutPct: 0, killed: false })
  })
  for (const k of cases) {
    it(`${k.name}: identical to trialOn for every component`, () => {
      const today = trialOnToday(k.isTestAccount, k.trialOff)
      // The edge derives trialOff the same way: only a test account can switch off.
      const account = { userId: 'u-fictional-1', isTestAccount: k.isTestAccount, trialOff: k.isTestAccount && !today }
      for (const c of COMPONENTS) {
        expect(componentOn(c, account)).toBe(today)
        expect(stageFor(c, account)).toBe(today ? 'new' : 'old')
      }
    })
  }
  it('no real creator is ever shadowed or served at the default, across many users', () => {
    for (let i = 0; i < 500; i++) for (const c of COMPONENTS) expect(stageFor(c, { userId: `u${i}`, isTestAccount: false, isCanary: true })).toBe('old')
  })
})

const at = (c: Component, stage: 'S0' | 'S1' | 'S2' | 'S3', rolloutPct = 0, killed = false): FlagRegistry =>
  ({ ...DEFAULT_REGISTRY, [c]: { stage, rolloutPct, killed } })

describe('later stages (not enabled anywhere; behaviour pinned for when they are)', () => {
  const real = { userId: 'u-real', isTestAccount: false }
  it('S1 shadows real creators, test accounts still served', () => {
    expect(stageFor('spine', real, at('spine', 'S1'))).toBe('shadow')
    expect(stageFor('spine', { userId: 't', isTestAccount: true }, at('spine', 'S1'))).toBe('new')
  })
  it('S2 serves canaries only', () => {
    expect(stageFor('spine', { ...real, isCanary: true }, at('spine', 'S2'))).toBe('new')
    expect(stageFor('spine', real, at('spine', 'S2'))).toBe('shadow')
  })
  it('S3 serves about the rollout share, monotonic as it grows', () => {
    for (const pct of [5, 25, 50, 100]) {
      const n = Array.from({ length: 2000 }, (_, i) => componentOn('templates', { userId: `u${i}`, isTestAccount: false }, at('templates', 'S3', pct))).filter(Boolean).length
      expect(Math.abs(n / 2000 - pct / 100)).toBeLessThan(0.04)
    }
    for (let i = 0; i < 200; i++) {
      const b = bucketOf('templates', `u${i}`)
      expect(b).toBeGreaterThanOrEqual(0); expect(b).toBeLessThan(100)
    }
  })
  it('kill switch serves the old path to everyone, test accounts included', () => {
    const reg = at('hook_engine', 'S3', 100, true)
    expect(stageFor('hook_engine', real, reg)).toBe('old')
    expect(stageFor('hook_engine', { userId: 't', isTestAccount: true }, reg)).toBe('old')
  })
  it('a malformed entry falls back to S0', () => {
    const bad = { ...DEFAULT_REGISTRY, planner: { stage: 'S9', rolloutPct: NaN, killed: 'yes' } } as unknown as FlagRegistry
    expect(stageFor('planner', real, bad)).toBe('old')
  })
})

describe('edge wiring', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(here, '../../../../../supabase/functions/generate-blueprint/index.ts'), 'utf8')
  it('every component is routed through newOn', () => {
    for (const c of COMPONENTS) expect(src).toContain(`newOn('${c}')`)
  })
  it('the edge never passes a registry (default S0 only until a gate is passed)', () => {
    expect(src).toMatch(/componentOn\(c, releaseAccount\)\n/)
  })
})
