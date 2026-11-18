// Security audit #13: a signed-in user may only move a voice from building to
// ready (the manual form). Marking it failed would free a plan slot.
import { it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const MIG = join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..'), 'supabase', 'migrations')
const sql = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(MIG, f), 'utf8')).join('\n')

it('the status guard trigger exists and allows only building -> ready for users', () => {
  const body = sql.slice(sql.lastIndexOf('create or replace function public.brand_voice_status_guard('))
  expect(body).toMatch(/current_user = 'authenticated'/)
  expect(body).toMatch(/not \(old\.status = 'building' and new\.status = 'ready'\)/)
  expect(sql.slice(sql.lastIndexOf('brand_voices_status_guard on public.brand_voices'))).toMatch(/create trigger brand_voices_status_guard before update of status/)
})
