// The canary switch (Fast Path v1 Track B). Fictional ids only.
import { describe, it, expect } from 'vitest'
import { canaryAccounts, canaryKilled, isCanaryAccount, CANARY_MAX_ACCOUNTS } from '../canary'

const OWNER = '11111111-2222-3333-4444-555555555555'
const OTHER = '99999999-8888-7777-6666-555555555555'

describe('canary allowlist', () => {
  it('unset or empty means nobody', () => {
    expect(canaryAccounts(undefined)).toEqual([])
    expect(canaryAccounts('')).toEqual([])
    expect(canaryAccounts(' , ')).toEqual([])
  })
  it('one valid id is accepted, trimmed and lower-cased', () => {
    expect(canaryAccounts(`  ${OWNER.toUpperCase()} `)).toEqual([OWNER])
  })
  it('more than the cap is refused WHOLE, not truncated (widening is the owner\'s call)', () => {
    expect(CANARY_MAX_ACCOUNTS).toBe(1)
    expect(canaryAccounts(`${OWNER},${OTHER}`)).toEqual([])
  })
  it('a malformed id refuses the list', () => {
    expect(canaryAccounts('not-a-uuid')).toEqual([])
    expect(canaryAccounts(`${OWNER}x`)).toEqual([])
  })
})

describe('canary kill switch', () => {
  it('1 or true (any case, trimmed) kills; anything else does not', () => {
    for (const v of ['1', 'true', ' TRUE ', 'True']) expect(canaryKilled(v)).toBe(true)
    for (const v of [undefined, null, '', '0', 'false', 'off', 'yes']) expect(canaryKilled(v)).toBe(false)
  })
})

describe('isCanaryAccount', () => {
  it('only the listed account is the canary', () => {
    expect(isCanaryAccount(OWNER, OWNER, undefined)).toBe(true)
    expect(isCanaryAccount(OTHER, OWNER, undefined)).toBe(false)
    expect(isCanaryAccount('', OWNER, undefined)).toBe(false)
  })
  it('the kill switch turns it off for the listed account too (instant rollback)', () => {
    expect(isCanaryAccount(OWNER, OWNER, '1')).toBe(false)
  })
  it('no allowlist means no canary even for a well-formed id', () => {
    expect(isCanaryAccount(OWNER, undefined, undefined)).toBe(false)
  })
})
