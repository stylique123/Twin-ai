// scripts/ops/deleteCreator.mjs: dry run by default, no delete without --confirm
// plus a typed creator id. Fictional ids and a mock client only.
import { describe, it, expect } from 'vitest'
// @ts-expect-error plain .mjs ops script
import { parseArgs, typedIdMatches, deletionPlan, runDeletion } from '../../../../scripts/ops/deleteCreator.mjs'

const ID = '00000000-0000-4000-8000-00000000c0de'

function mockAdmin(opts: { reportRows?: number; exists?: boolean } = {}) {
  const calls: string[] = []
  const q = (table: string) => {
    const b: any = {
      select: () => b,
      eq: () => Promise.resolve({ data: [{ id: 'gen-fictional-1' }], error: null }),
      in: (col: string) => {
        if (b._del) { calls.push(`delete ${table}.${col}`); return Promise.resolve({ count: 1, error: null }) }
        const report = (table === 'workspace_invites' && col === 'accepted_by') || table === 'visual_pilot_events'
        return Promise.resolve({ count: report ? (opts.reportRows ?? 0) : 2, error: null })
      },
      delete: () => { b._del = true; return b },
    }
    return b
  }
  const admin = {
    from: q,
    auth: { admin: {
      getUserById: async () => ({ data: { user: opts.exists === false ? null : { id: ID } }, error: null }),
      deleteUser: async () => { calls.push('deleteUser'); return { error: null } },
    } },
    storage: {
      listBuckets: async () => ({ data: [{ id: 'takes' }], error: null }),
      from: () => ({
        list: async () => ({ data: [{ name: 'a.mp4' }], error: null }),
        remove: async (p: string[]) => { calls.push('remove'); return { data: p, error: null } },
      }),
    },
  }
  return { admin, calls }
}

describe('deleteCreator args', () => {
  it('dry run is the default', () => {
    expect(parseArgs([`--creator=${ID}`]).dryRun).toBe(true)
    expect(parseArgs([`--creator=${ID}`, '--dry-run=false']).dryRun).toBe(true)
    expect(parseArgs([`--creator=${ID}`, '--confirm']).dryRun).toBe(false)
  })
  it('requires a uuid', () => {
    expect(() => parseArgs([])).toThrow()
    expect(() => parseArgs(['--creator=bob'])).toThrow()
  })
  it('typed id must match', () => {
    expect(typedIdMatches(ID, ` ${ID.toUpperCase()} `)).toBe(true)
    expect(typedIdMatches(ID, '')).toBe(false)
    expect(typedIdMatches(ID, undefined)).toBe(false)
  })
  it('plan: profiles deleted last, report entries never deleted', () => {
    const p = deletionPlan()
    expect(p.deletes.at(-1).table).toBe('profiles')
    expect(p.deletes.findIndex((t: any) => t.table === 'script_batch_results')).toBeLessThan(p.deletes.findIndex((t: any) => t.table === 'generations'))
    expect(p.reports.length).toBeGreaterThan(0)
  })
})

describe('deleteCreator run (mock)', () => {
  it('dry run deletes nothing', async () => {
    const { admin, calls } = mockAdmin()
    const r = await runDeletion({ admin, creatorId: ID, dryRun: true })
    expect(calls).toEqual([])
    expect(r.log.at(-1)).toBe('dry run: nothing deleted')
  })
  it('confirm without typed id refuses', async () => {
    const { admin, calls } = mockAdmin()
    const r = await runDeletion({ admin, creatorId: ID, dryRun: false, ask: async () => 'wrong' })
    expect(r.refused).toBe('typed id mismatch')
    expect(calls).toEqual([])
  })
  it('report-only rows block a real run', async () => {
    const { admin, calls } = mockAdmin({ reportRows: 1 })
    const r = await runDeletion({ admin, creatorId: ID, dryRun: false, typedId: ID })
    expect(r.refused).toMatch(/report-only/)
    expect(calls).toEqual([])
  })
  it('unknown creator refuses', async () => {
    const { admin } = mockAdmin({ exists: false })
    expect((await runDeletion({ admin, creatorId: ID, dryRun: false, typedId: ID })).refused).toBe('creator not found')
  })
  it('confirm + typed id deletes rows, storage, then the auth user last', async () => {
    const { admin, calls } = mockAdmin()
    const r = await runDeletion({ admin, creatorId: ID, dryRun: false, ask: async () => ID })
    expect(r.refused).toBeUndefined()
    expect(calls.at(-1)).toBe('deleteUser')
    expect(calls).toContain('remove')
    expect(calls.filter((c) => c.startsWith('delete ')).at(-1)).toBe('delete profiles.id')
  })
})
