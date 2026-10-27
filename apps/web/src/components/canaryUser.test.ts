// The canary's screens gate (Fast Path v1 Track B). Fictional ids only.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { trialUser, canaryUser } from './ProductDetailsByKind'

const OWNER = '11111111-2222-3333-4444-555555555555'
const OTHER = '99999999-8888-7777-6666-555555555555'
afterEach(() => vi.unstubAllEnvs())

describe('canaryUser', () => {
  it('unset means nobody', () => {
    vi.stubEnv('VITE_CANARY_ACCOUNT_ID', '')
    expect(canaryUser(OWNER)).toBe(false)
  })
  it('only the named account', () => {
    vi.stubEnv('VITE_CANARY_ACCOUNT_ID', OWNER)
    expect(canaryUser(OWNER)).toBe(true)
    expect(canaryUser(OTHER)).toBe(false)
    expect(canaryUser(null)).toBe(false)
  })
  it('VITE_CANARY_KILL hides the screens', () => {
    vi.stubEnv('VITE_CANARY_ACCOUNT_ID', OWNER)
    vi.stubEnv('VITE_CANARY_KILL', '1')
    expect(canaryUser(OWNER)).toBe(false)
  })
  it('trialUser = the trial account OR the canary; nobody else', () => {
    vi.stubEnv('VITE_TRIAL_USER_ID', OTHER)
    vi.stubEnv('VITE_CANARY_ACCOUNT_ID', OWNER)
    expect(trialUser(OTHER)).toBe(true)
    expect(trialUser(OWNER)).toBe(true)
    expect(trialUser('someone-else')).toBe(false)
  })
})
