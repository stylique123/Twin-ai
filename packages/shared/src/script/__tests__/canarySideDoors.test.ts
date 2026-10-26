// The canary's trial side doors and the typed-answer read-back (PR #1319),
// as unit cases. Fictional ids only, no network.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { trialSideDoorOpen } from '../canary'
import { angleMaterialUsable } from '../questionUsefulness'

const CANARY = '0b0e0000-0000-4000-8000-00000000c0de'
const OTHER = '0b0e0000-0000-4000-8000-00000000beef'
const HB = '0b0e0000-0000-4000-8000-0000000000aa'
const open = (o: Partial<Parameters<typeof trialSideDoorOpen>[0]>) => trialSideDoorOpen({
  userId: OTHER, heartbeatUserId: HB, isPanel: false, canaryAccountsRaw: CANARY, canaryKillRaw: '', ...o,
})

describe('trialSideDoorOpen', () => {
  it('lets in the heartbeat account, a panel account and the canary only', () => {
    expect(open({ userId: HB })).toBe(true)
    expect(open({ isPanel: true })).toBe(true)
    expect(open({ userId: CANARY })).toBe(true)
    expect(open({ userId: CANARY.toUpperCase() })).toBe(true)
    expect(open({})).toBe(false)
  })

  it('an unset heartbeat id never matches an empty user id', () => {
    expect(open({ userId: '', heartbeatUserId: '' })).toBe(false)
    expect(open({ userId: '', heartbeatUserId: undefined })).toBe(false)
  })

  it('the kill switch closes the door for the canary, not for test accounts', () => {
    for (const k of ['1', 'true', ' TRUE ']) {
      expect(open({ userId: CANARY, canaryKillRaw: k })).toBe(false)
      expect(open({ userId: HB, canaryKillRaw: k })).toBe(true)
    }
    expect(open({ userId: CANARY, canaryKillRaw: '0' })).toBe(true)
  })

  it('no canary by default, and a list of two is refused whole', () => {
    expect(open({ userId: CANARY, canaryAccountsRaw: undefined })).toBe(false)
    expect(open({ userId: CANARY, canaryAccountsRaw: `${CANARY},${OTHER}` })).toBe(false)
    expect(open({ userId: CANARY, canaryAccountsRaw: 'not-a-uuid' })).toBe(false)
  })
})

describe('angleMaterialUsable (typed answers read back)', () => {
  const typed = { basis: 'stated', creator_confirmed_at: '2026-10-26T10:00:00Z', sensitive: false }
  it('keeps confirmed items and her typed, confirmed claims', () => {
    expect(angleMaterialUsable({}, 'confirmed')).toBe(true)
    expect(angleMaterialUsable(typed, 'unconfirmed')).toBe(true)
  })
  it('drops unconfirmed items that she did not state and confirm', () => {
    expect(angleMaterialUsable({ basis: 'inferred', creator_confirmed_at: '2026-10-26T10:00:00Z' }, 'unconfirmed')).toBe(false)
    expect(angleMaterialUsable({ basis: 'stated', creator_confirmed_at: null }, 'unconfirmed')).toBe(false)
    expect(angleMaterialUsable({ basis: 'stated', creator_confirmed_at: '' }, 'unconfirmed')).toBe(false)
    expect(angleMaterialUsable(typed, null)).toBe(false)
    expect(angleMaterialUsable(typed, undefined)).toBe(false)
  })
  it('never feeds a sensitive row', () => {
    expect(angleMaterialUsable({ ...typed, sensitive: true }, 'unconfirmed')).toBe(false)
    expect(angleMaterialUsable({ sensitive: true }, 'confirmed')).toBe(false)
  })
})

describe('server wiring', () => {
  const src = readFileSync(join(__dirname, '..', '..', '..', '..', '..', 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
  it('angle_answer shares the angle_plan door, and no side door keeps the old test-only check', () => {
    const at = src.indexOf("if (specMode === 'angle_plan' || specMode === 'angle_answer')")
    expect(at).toBeGreaterThan(0)
    expect(src.slice(at, at + 200)).toContain('sideDoorOpen()')
    for (const mode of ['voice_card', 'check_line', 'using_item']) {
      const i = src.indexOf(`if (specMode === '${mode}'`)
      expect(src.slice(i, i + 300), mode).not.toMatch(/const testAccount = \(\(Deno\.env\.get\('HEARTBEAT_USER_ID'\)/)
    }
  })
  it('angle_plan reads material through angleMaterialUsable', () => {
    expect(src).toMatch(/angleMaterialUsable\(r, it\.status\)/)
  })
})
