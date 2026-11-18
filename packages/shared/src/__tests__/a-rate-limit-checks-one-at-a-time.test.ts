// Security audit #6: the latest check_rate_limit must lock (user, action) before
// counting, or simultaneous requests all pass (50 of 50 with a limit of 5, locally).
import { it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const MIG = join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..'), 'supabase', 'migrations')
const sql = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(MIG, f), 'utf8')).join('\n')

it('check_rate_limit locks before it counts', () => {
  const body = sql.slice(sql.lastIndexOf('create or replace function public.check_rate_limit('))
  const lock = body.indexOf('pg_advisory_xact_lock(')
  expect(lock).toBeGreaterThan(-1)
  expect(lock).toBeLessThan(body.indexOf('select count(*) into cnt'))
})
