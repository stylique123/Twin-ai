// A MISSING MIGRATION MUST COST ONE JOB TYPE, NOT THE WORKER.
//
// ⚠️ THE THREE OUTCOMES, RANKED. Missing 0158 could mean:
//   worker crashes            -> everything stops. Worst.
//   worker claims anyway      -> every replication fails, queue says "pending",
//                                discovered six hours later. What we had.
//   worker degrades           -> replication not claimed, incident visible,
//                                assess_reference and renders continue. Wanted.
// These tests pin the third.
import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

const healthy = { status: 'healthy' as const, blocked: {}, checkedAt: 'x' }
const blockedReplication = {
  status: 'degraded' as const,
  checkedAt: 'x',
  blocked: {
    extraction_replication: {
      reason: 'missing_schema_capability' as const,
      migrationHint: '0158',
      missing: 'extraction_parity_replications(...): relation does not exist',
    },
  },
}

describe('one missing capability blocks its owner and nothing else', () => {
  it('removes ONLY the affected job type from the claim list', async () => {
    const { claimableTypes } = await import('../schemaCapabilities.js')
    const all = ['assess_reference', 'extraction_parity', 'extraction_replication', 'editor_v2', 'ingest']
    const claimable = claimableTypes(all, blockedReplication)

    expect(claimable).not.toContain('extraction_replication')
    // ⚠️ THE POINT OF THE WHOLE DESIGN. Renders and assessments are unaffected
    // by a missing replication table and must keep running.
    expect(claimable).toContain('assess_reference')
    expect(claimable).toContain('editor_v2')
    expect(claimable).toContain('ingest')
    expect(claimable).toHaveLength(4)
  })

  it('claims everything when the schema is healthy', async () => {
    const { claimableTypes } = await import('../schemaCapabilities.js')
    const all = ['assess_reference', 'extraction_replication']
    expect(claimableTypes(all, healthy)).toEqual(all)
  })

  it('names the MIGRATION, not just the table — that is what an operator applies', async () => {
    expect(blockedReplication.blocked.extraction_replication.migrationHint).toBe('0158')
  })
})

describe('the incident is reported once, not every few minutes', () => {
  it('reports the first check, healthy or not', async () => {
    const { healthChanged } = await import('../schemaCapabilities.js')
    expect(healthChanged(null, healthy)).toBe(true)
    expect(healthChanged(null, blockedReplication)).toBe(true)
  })

  it('stays silent while the same thing is still broken', async () => {
    const { healthChanged } = await import('../schemaCapabilities.js')
    // ⚖️ A re-check every few minutes must not become a Greek chorus. An
    // incident repeated forever is how a real one goes unnoticed among its own
    // repetitions.
    expect(healthChanged(blockedReplication, { ...blockedReplication, checkedAt: 'later' })).toBe(false)
  })

  it('speaks again when the migration is applied — self-healing without a deploy', async () => {
    const { healthChanged } = await import('../schemaCapabilities.js')
    // The operator applies 0158 by hand; the next re-check must notice and say
    // so, and the job type becomes claimable again with no redeploy.
    expect(healthChanged(blockedReplication, healthy)).toBe(true)
  })

  it('speaks when a DIFFERENT type breaks, even if the count is unchanged', async () => {
    const { healthChanged } = await import('../schemaCapabilities.js')
    const other = {
      ...blockedReplication,
      blocked: { assess_reference: blockedReplication.blocked.extraction_replication },
    }
    // Comparing counts would call this "no change" and swallow a new incident.
    expect(healthChanged(blockedReplication, other)).toBe(true)
  })
})

describe('the registry is TOTAL — no job type may go undeclared', () => {
  it('every registered handler either declares requirements or says why it has none', async () => {
    // ⚠️ THE SAFEGUARD AGAINST THE NEXT ONE. Somebody adds a job type with its
    // own table, forgets to declare its schema, and the whole check silently
    // stops covering it. There is deliberately NO SQL parsing here: a registry
    // that guessed would be a second authority on the schema, drifting quietly.
    const { handlers } = await import('../jobs/index.js')
    const { SCHEMA_REQUIREMENTS, NO_DEDICATED_SCHEMA } = await import('../schemaCapabilities.js')

    const undeclared = Object.keys(handlers).filter(
      (t) => !(t in SCHEMA_REQUIREMENTS) && !(t in NO_DEDICATED_SCHEMA))
    expect(undeclared, `job type(s) with no schema declaration: ${undeclared.join(', ')} — `
      + 'add the capabilities it needs to SCHEMA_REQUIREMENTS, or record it in '
      + 'NO_DEDICATED_SCHEMA with the reason it needs none').toEqual([])
  })

  it('nothing is declared BOTH ways', async () => {
    const { SCHEMA_REQUIREMENTS, NO_DEDICATED_SCHEMA } = await import('../schemaCapabilities.js')
    const both = Object.keys(SCHEMA_REQUIREMENTS).filter((t) => t in NO_DEDICATED_SCHEMA)
    expect(both, `declared both ways: ${both.join(', ')}`).toEqual([])
  })

  it('every NO_DEDICATED_SCHEMA entry carries a real reason, not a placeholder', async () => {
    const { NO_DEDICATED_SCHEMA } = await import('../schemaCapabilities.js')
    for (const [type, why] of Object.entries(NO_DEDICATED_SCHEMA)) {
      expect(why.length, `${type} needs a written reason`).toBeGreaterThan(40)
    }
  })

  it('every declared capability names columns AND a migration', async () => {
    const { SCHEMA_REQUIREMENTS } = await import('../schemaCapabilities.js')
    for (const [type, caps] of Object.entries(SCHEMA_REQUIREMENTS)) {
      expect(caps.length, `${type} declares an empty requirement list`).toBeGreaterThan(0)
      for (const c of caps) {
        // A probe with no columns would pass against an empty table of the right
        // name, which is the failure it exists to catch.
        expect(c.columns.length, `${type}/${c.table} names no columns`).toBeGreaterThan(0)
        expect(c.migration, `${type}/${c.table} names no migration`).toMatch(/^\d{4}$/)
      }
    }
  })
})

describe('capabilities, not filenames', () => {
  it('declares the columns 0158 added, so an older table of the same name still fails', async () => {
    const { SCHEMA_REQUIREMENTS } = await import('../schemaCapabilities.js')
    const cap = SCHEMA_REQUIREMENTS.extraction_replication
      .find((c) => c.table === 'extraction_parity_replications')
    // ⚖️ THE DIFFERENCE BETWEEN A LEDGER AND EVIDENCE. A ledger row says
    // somebody ran a file. These columns say the job can do its work.
    expect(cap?.columns).toContain('attempt_number')
    expect(cap?.columns).toContain('outcome')
  })

  it('declares arms_asymmetric and manifest for the parity trial, which 0156/0157 added', async () => {
    const { SCHEMA_REQUIREMENTS } = await import('../schemaCapabilities.js')
    const cap = SCHEMA_REQUIREMENTS.extraction_parity
      .find((c) => c.table === 'extraction_parity_trials')
    // Without these the upsert still succeeds and silently loses the
    // experiment's identity — the worst kind of missing migration.
    expect(cap?.columns).toContain('arms_asymmetric')
    expect(cap?.columns).toContain('manifest')
  })
})
