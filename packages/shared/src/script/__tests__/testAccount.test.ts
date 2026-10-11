// The fictional creator panel (owner, 13 Oct): test accounts by identity, and
// the invention gate in MEASURE mode for them. Fixtures are FICTIONAL only.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isPanelAccount, gateMeasureOnly, isMeasuredRun, PANEL_ACCOUNT_TAG } from '../testAccount.js'
import { buildLedger, runInventionGate, type GateBlueprint } from '../inventionGate.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..', '..', '..', '..')

describe('isPanelAccount', () => {
  it('is true only for the service-set app_metadata tag', () => {
    expect(isPanelAccount({ app_metadata: { twin_test_account: PANEL_ACCOUNT_TAG } })).toBe(true)
    expect(isPanelAccount({ app_metadata: { twin_test_account: 'yes' } })).toBe(false)
    expect(isPanelAccount({ app_metadata: {} })).toBe(false)
    expect(isPanelAccount({})).toBe(false)
    expect(isPanelAccount(null)).toBe(false)
  })
  it('never reads user_metadata (which the user can write)', () => {
    expect(isPanelAccount({ user_metadata: { twin_test_account: PANEL_ACCOUNT_TAG } } as { app_metadata?: unknown })).toBe(false)
  })
})

describe('gateMeasureOnly', () => {
  it('a real creator never measures, whatever the request says', () => {
    for (const requested of [undefined, 'measure', 'repair', true]) {
      expect(gateMeasureOnly({ isTestAccount: false, isPanel: false, requested })).toBe(false)
    }
  })
  it('a panel account measures by default and may ask for repair', () => {
    expect(gateMeasureOnly({ isTestAccount: true, isPanel: true, requested: undefined })).toBe(true)
    expect(gateMeasureOnly({ isTestAccount: true, isPanel: true, requested: 'repair' })).toBe(false)
  })
  it('the heartbeat repairs by default and may ask to measure', () => {
    expect(gateMeasureOnly({ isTestAccount: true, isPanel: false, requested: undefined })).toBe(false)
    expect(gateMeasureOnly({ isTestAccount: true, isPanel: false, requested: 'measure' })).toBe(true)
    expect(gateMeasureOnly({ isTestAccount: true, isPanel: false, requested: true })).toBe(false)
  })
})

describe('measure mode end to end (fake judge)', () => {
  const ledger = buildLedger({ knowledge: [{ id: 'k-roast', kind: 'fact', text: 'I roast Harbor Blend on Tuesday mornings' }], now: 0 })
  const bp: GateBlueprint = { script: [{ line: 'I roast Harbor Blend on Tuesday mornings.' }, { line: 'We sold ten thousand bags last month.' }] }
  const judge = async () => JSON.stringify({ verdicts: [
    { i: 0, cls: 'S', item_ids: ['k-roast'], claim_types: [], reason: 'stated' },
    { i: 1, cls: 'I', item_ids: [], claim_types: ['number'], reason: 'invented' },
  ] })
  it('classifies, records, never rewrites, and counts as a measured run', async () => {
    let rewrites = 0
    const r = await runInventionGate({ blueprint: bp, ledger, measureOnly: true }, { judge, rewrite: async () => { rewrites++; return '{}' } })
    expect(rewrites).toBe(0)
    expect(r.blueprint).toBe(bp)
    expect(r.record.outcome).toBe('measure_only')
    expect(r.record.sentences.length).toBe(2)
    expect(r.record.repaired).toEqual({ replaced: 0, asked: 0, dropped: 0 })
    expect(isMeasuredRun(r.record)).toBe(true)
  })
  it('a judge failure is not a measured run (the durable re-check still owns it)', async () => {
    const r = await runInventionGate({ blueprint: bp, ledger, measureOnly: true }, { judge: async () => { throw new Error('boom') }, rewrite: async () => '{}' })
    expect(isMeasuredRun(r.record)).toBe(false)
  })
  it('a timeout is not a measured run', () => {
    expect(isMeasuredRun({ outcome: 'timeout', timed_out: true })).toBe(false)
    expect(isMeasuredRun({ outcome: 'measure_only', timed_out: true })).toBe(false)
    expect(isMeasuredRun(null)).toBe(false)
  })
})

describe('edge wiring', () => {
  const edge = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
  it('the edge copy is the shared file', () => {
    expect(readFileSync(join(REPO, 'supabase/functions/_shared/testAccount.ts'), 'utf8'))
      .toBe(readFileSync(join(HERE, '..', 'testAccount.ts'), 'utf8'))
  })
  it('panel accounts are flagged is_heartbeat by identity', () => {
    expect(edge).toMatch(/const isPanel = isPanelAccount\(user\)/)
    expect(edge).toMatch(/const isHeartbeat = \(heartbeatUserId !== '' && user\.id === heartbeatUserId\) \|\| isPanel/)
  })
  it('the gate reads measureOnly from the test-account rule, never the bare body', () => {
    expect(edge).toMatch(/measureOnly: gateMeasureOnly\(\{ isTestAccount: isHeartbeat, isPanel, requested:/)
    expect(edge).toMatch(/if \(isMeasuredRun\(gate\.record\)\)/)
  })
})
