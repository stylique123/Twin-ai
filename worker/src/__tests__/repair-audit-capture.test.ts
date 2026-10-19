// ⚖️ SAVE-BEFORE-REPAIR (owner, 19 Oct). On test and panel accounts (trialOn,
// which the edge signals with `hold_asks`) the gate stores each acted line's
// pre-repair text in blueprint.invention_gate.repair_audit: the generation row
// only, never a log. REPAIR_AUDIT_CAPTURE='false' turns it off. Fictional
// fixtures only.
import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest'
import type { Job } from '../db.js'
import type { RecheckDeps, RecheckGeneration } from '../jobs/inventionRecheck.js'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})
afterEach(() => { vi.restoreAllMocks() })

const GEN = 'gen-audit-fixture'
const OWNER = 'owner-audit-fixture'
const PROD = 'prod-lantern'
const INVENTED = 'Lantern Tea sells out every single morning at nine.'

function gen(): RecheckGeneration {
  const lines = ['Here is how I blend Lantern Tea myself.', INVENTED, 'It tastes like toasted rice and plum.', 'Grab a tin of Lantern Tea, link in bio.']
  return {
    id: GEN, user_id: OWNER, reference_note: 'a video about how I blend Lantern Tea',
    blueprint: { script: lines.map((line, n) => ({ section: n === 0 ? 'Hook' : 'Body', line })), shot_list: lines.map((line) => ({ shot: 'x', spoken_text: line })), check_status: 'unchecked', invention_gate: { outcome: 'unchecked', reason: 'queued' } },
  }
}

async function judge(prompt: string) {
  const block = prompt.split('SENTENCES:')[1] ?? ''
  const rows = [...block.matchAll(/^(\d+)\. \([a-z_]+\) (.*)$/gm)]
  return JSON.stringify({ sentences: rows.map((m) => /sells out/.test(m[2]!) ? { i: Number(m[1]), class: 'I', item_ids: [] } : { i: Number(m[1]), class: 'S', item_ids: ['k-blend'] }) })
}

function deps(over: Partial<RecheckDeps> = {}) {
  const saved: Array<Record<string, unknown>> = []
  const d: RecheckDeps = {
    model: 'fake-flash',
    loadGeneration: async () => gen(),
    loadKnowledge: async () => [{ id: 'k-blend', kind: 'fact', text: 'I blend every tin of Lantern Tea myself; it tastes like toasted rice and plum' }],
    loadProducts: async () => [{ id: PROD, name: 'Lantern Tea', knowledge: [], offer: 'Lantern Tea, link in bio' }],
    saveBlueprint: async (_id, bp) => { saved.push(bp) },
    callModel: async (system, prompt) => (/rewrite/i.test(system) ? '{"rewrites":[]}' : judge(prompt)),
    ...over,
  }
  return { d, saved }
}

const job = (ledger: Record<string, unknown>): Job =>
  ({ id: 'job-audit', owner_id: OWNER, type: 'invention_recheck', payload: { generation_id: GEN, owner_id: OWNER, reason: 'queued', ledger: { target_product_id: PROD, ...ledger } }, status: 'running', attempts: 1, max_attempts: 3 })

const audit = (bp: Record<string, unknown>) => (bp.invention_gate as { repair_audit?: Array<Record<string, unknown>> }).repair_audit

describe('repair audit capture', () => {
  it('trialOn (hold_asks): stores the pre-repair text, action, both verdicts, reason and item_ids on the row', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const { d, saved } = deps()
    await runInventionRecheck(job({ hold_asks: true, rule_review: true }), d)
    const a = audit(saved.at(-1)!)
    expect(Array.isArray(a)).toBe(true)
    const hit = a!.find((x) => x.text === INVENTED)
    expect(hit).toBeTruthy()
    expect(['dropped', 'replaced', 'asked', 'refilled']).toContain(hit!.action)
    expect(hit).toHaveProperty('reason')
    expect(hit).toHaveProperty('item_ids')
    expect(hit).toHaveProperty('verdict')
    expect(hit).toHaveProperty('fast_class')
    expect(hit).toHaveProperty('strong_class')
    // The shipped script no longer carries it.
    expect(JSON.stringify(saved.at(-1)!.script)).not.toContain('sells out')
  })

  it('the invention_recheck log line carries counts only, never audit text', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) })
    vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) })
    const { d, saved } = deps()
    await runInventionRecheck(job({ hold_asks: true }), d)
    expect(audit(saved.at(-1)!)?.length).toBeGreaterThan(0)
    const line = logs.find((l) => l.includes('"event":"invention_recheck"'))
    expect(line).toBeTruthy()
    for (const l of logs) {
      expect(l).not.toContain('sells out')
      expect(l).not.toContain('repair_audit')
      expect(l).not.toContain('Lantern Tea')
    }
  })

  it("kill switch: REPAIR_AUDIT_CAPTURE='false' stores no audit on a trial run", async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    for (const flag of ['false', ' FALSE ']) {
      const { d, saved } = deps({ repairAuditFlag: flag })
      await runInventionRecheck(job({ hold_asks: true }), d)
      expect(audit(saved.at(-1)!)).toBeUndefined()
    }
  })

  it('a real creator (no trial flags) is never captured, whatever the flag says', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    for (const flag of [undefined, 'true', '']) {
      const { d, saved } = deps(flag === undefined ? {} : { repairAuditFlag: flag })
      await runInventionRecheck(job({}), d)
      expect(audit(saved.at(-1)!)).toBeUndefined()
    }
  })

  it('the handler reads REPAIR_AUDIT_CAPTURE from the env', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../jobs/inventionRecheck.ts', import.meta.url), 'utf8')
    expect(src).toMatch(/repairAuditFlag: process\.env\.REPAIR_AUDIT_CAPTURE/)
    expect(src).toMatch(/repairAuditCaptureOn\(extra\.hold_asks === true, deps\.repairAuditFlag\)/)
  })
})
