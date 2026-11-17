// Security audit #1: the LATEST definition of each invite function must check
// the inviter's plan, and a teammate must be able to leave. A later migration
// that re-creates either function without the check fails here.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const MIG = join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..'), 'supabase', 'migrations')
const sql = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(MIG, f), 'utf8')).join('\n')

function latestBody(fn: string): string {
  const start = sql.lastIndexOf(`create or replace function public.${fn}(`)
  expect(start).toBeGreaterThan(-1)
  return sql.slice(start, sql.indexOf('end $$;', start))
}

describe('workspace invites', () => {
  it('only a Studio/Agency account can mint an invite', () => {
    expect(latestBody('create_workspace_invite')).toMatch(/id = auth\.uid\(\) and plan in \('studio', 'agency'\)/)
  })

  it('an invite from a non-team account cannot be accepted', () => {
    expect(latestBody('accept_workspace_invite')).toMatch(/id = v_owner and plan in \('studio', 'agency'\)/)
  })

  it('a teammate can remove her own membership', () => {
    expect(sql).toMatch(/create policy "wm_member_leave" on public\.workspace_members for delete using \(auth\.uid\(\) = member_id\)/)
  })
})
