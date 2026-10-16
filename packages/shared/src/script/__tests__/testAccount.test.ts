// The fictional creator panel (owner, 13 Oct): test accounts by identity, and
// the invention gate in MEASURE mode for them. Fixtures are FICTIONAL only.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isPanelAccount, gateMeasureOnly, gateRepairTrialOn, gateModeLabel, isMeasuredRun, PANEL_ACCOUNT_TAG } from '../testAccount.js'
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

describe('gateMeasureOnly (repair trial, owner 16 Oct)', () => {
  it('a real creator never measures, whatever the request or the kill switch says', () => {
    for (const requested of [undefined, 'measure', 'repair', true]) {
      for (const repairTrial of [undefined, true, false]) {
        expect(gateMeasureOnly({ isTestAccount: false, isPanel: false, requested, repairTrial })).toBe(false)
      }
    }
  })
  it('a panel account repairs by default and may ask to measure', () => {
    expect(gateMeasureOnly({ isTestAccount: true, isPanel: true, requested: undefined })).toBe(false)
    expect(gateMeasureOnly({ isTestAccount: true, isPanel: true, requested: undefined, repairTrial: true })).toBe(false)
    expect(gateMeasureOnly({ isTestAccount: true, isPanel: true, requested: 'measure' })).toBe(true)
  })
  it('the heartbeat repairs by default and may ask to measure', () => {
    expect(gateMeasureOnly({ isTestAccount: true, isPanel: false, requested: undefined })).toBe(false)
    expect(gateMeasureOnly({ isTestAccount: true, isPanel: false, requested: true })).toBe(false)
    expect(gateMeasureOnly({ isTestAccount: true, isPanel: false, requested: 'measure' })).toBe(true)
    expect(gateMeasureOnly({ isTestAccount: true, isPanel: false, requested: 'repair' })).toBe(false)
  })
  it('the kill switch returns test accounts to measure mode', () => {
    expect(gateMeasureOnly({ isTestAccount: true, isPanel: true, requested: undefined, repairTrial: false })).toBe(true)
    expect(gateMeasureOnly({ isTestAccount: true, isPanel: false, requested: undefined, repairTrial: false })).toBe(true)
    // an explicit repair request still wins
    expect(gateMeasureOnly({ isTestAccount: true, isPanel: true, requested: 'repair', repairTrial: false })).toBe(false)
  })
  it("GATE_REPAIR_TRIAL: only 'false' switches the trial off", () => {
    expect(gateRepairTrialOn(undefined)).toBe(true)
    expect(gateRepairTrialOn('')).toBe(true)
    expect(gateRepairTrialOn('true')).toBe(true)
    expect(gateRepairTrialOn('false')).toBe(false)
    expect(gateRepairTrialOn(' FALSE ')).toBe(false)
  })
  it('the mode label', () => {
    expect(gateModeLabel(true)).toBe('measure')
    expect(gateModeLabel(false)).toBe('repair')
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
    // The gate runs in the worker (#1239); the edge decides measure mode and
    // sends it with the queued job.
    expect(edge).toMatch(/const gateMeasure = gateMeasureOnly\(\{ isTestAccount: isHeartbeat, isPanel, requested:/)
    expect(edge).toMatch(/\.\.\.\(gateMeasure \? \{ measure_only: true \} : \{\}\)/)
    // Kill switch read from the edge env; the mode is recorded on both blueprint paths.
    expect(edge.match(/repairTrial: gateRepairTrialOn\(Deno\.env\.get\('GATE_REPAIR_TRIAL'\)\)/g)?.length).toBe(2)
    expect(edge).toMatch(/bpg\.gate_mode = gateModeLabel\(gateMeasure\)/)
    expect(edge).toMatch(/rbp\.gate_mode = gateModeLabel\(gateMeasure\)/)
    const worker = readFileSync(new URL('../../../../../worker/src/jobs/inventionRecheck.ts', import.meta.url), 'utf8')
    expect(worker).toMatch(/const measureOnly = extra\.measure_only === true/)
  })
})

// Owner panel conditions: panel accounts are unbillable and shut out of
// referrals, checkout, social connections, counts and the cost ledger.
describe('panel account guards (wiring)', () => {
  const read = (p: string) => readFileSync(join(REPO, p), 'utf8')
  const edge = read('supabase/functions/generate-blueprint/index.ts')
  it('generation never spends or refunds for a panel account and records credits_spent 0', () => {
    expect(edge).toMatch(/const \{ error: spendErr \} = isPanel \? \{ error: null \} : await admin\.rpc\('spend_credits'/)
    expect(edge).toMatch(/let refunded = false\n[\s\S]{0,200}if \(isPanel\) refunded = true\n/)
    expect(edge).toMatch(/const unbillable = isPanel\s*\? 'panel_test_account'/)
    expect(edge).toMatch(/credits_spent: unbillable \? 0 : BLUEPRINT_COST/)
  })
  for (const [fn, why] of [['referral', 'create or redeem referrals'], ['billing', 'start checkout'], ['social', 'connect social accounts']] as const) {
    it(`${fn}: a panel account cannot ${why}`, () => {
      const src = read(`supabase/functions/${fn}/index.ts`)
      expect(src).toMatch(/import \{ isPanelAccount \} from '\.\.\/_shared\/testAccount\.ts'/)
      expect(src).toMatch(/if \(isPanelAccount\(user\)\) return json\(\{ error: 'Not available for test accounts', code: 'TEST_ACCOUNT' \}, 403\)/)
    })
  }
  it('each refusal sits before the action it blocks', () => {
    const ref = read('supabase/functions/referral/index.ts')
    expect(ref.indexOf('isPanelAccount(user)')).toBeLessThan(ref.indexOf("body.action === 'code'"))
    const bill = read('supabase/functions/billing/index.ts')
    expect(bill.indexOf('isPanelAccount(user)')).toBeLessThan(bill.indexOf('provider.checkout('))
    const social = read('supabase/functions/social/index.ts')
    expect(social.indexOf('isPanelAccount(user)')).toBeLessThan(social.indexOf("if (action === 'start')"))
  })
  it('owner-console counts real generations only', () => {
    const oc = read('supabase/functions/owner-console/index.ts')
    expect(oc).toMatch(/table === 'generations' \? base\.eq\('is_heartbeat', false\) : base/)
    expect(oc).toContain("const scriptsCount = await countOf('generations')")
    expect(oc).toMatch(/\.eq\('is_heartbeat', false\)\s*\.not\('script_intent', 'is', null\)/)
  })
  it('admin-metrics rollups and worklist exclude tagged test accounts', () => {
    const am = read('supabase/functions/admin-metrics/index.ts')
    expect(am).toMatch(/admin\.rpc\('test_account_ids'\)/)
    expect(am).toMatch(/filter\(\(r\) => !testOwners\.has/)
    const mig = read('supabase/migrations/0288_metrics_exclude_panel_test_accounts.sql')
    expect(mig).toMatch(/raw_app_meta_data->>'twin_test_account'/)
    for (const f of ['metrics_overview', 'activation_funnel', 'retention_curve', 'founder_metrics']) expect(mig).toContain(f)
  })
  it('lessons skip is_heartbeat generations', () => {
    expect(read('worker/src/nicheBrain/lessons.ts')).toMatch(/select\('is_heartbeat'\)/)
  })
  it('the worker cost ledger tags panel owners as test traffic', () => {
    expect(read('worker/src/aiUsage.ts')).toMatch(/twin_test_account === 'fictional_panel'/)
    expect(read('worker/src/index.ts')).toMatch(/isPanelOwner\(db as never, j\.owner_id\)/)
  })
  it('script-batch is manual, main-only, owner-only', () => {
    for (const wf of ['script-batch.yml']) {
      const y = read(`.github/workflows/${wf}`)
      expect(y).toMatch(/^on:\n {2}workflow_dispatch:/m)
      expect(y).not.toMatch(/^\s*(pull_request|pull_request_target|push|schedule):/m)
      expect(y).toMatch(/\[ "\$REF" != "refs\/heads\/main" \]/)
      expect(y).toMatch(/\[ "\$ACTOR" != "\$OWNER" \]/)
      expect(y).not.toMatch(/set -x|printenv|toJSON\(secrets\)/)
    }
  })
})
