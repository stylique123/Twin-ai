// Security audit #13: a signed-in user may move a voice building -> ready, or
// failed -> ready only while under the plan's voice limit. That limit lives in
// three places (the trigger, start-dna BRAND_LIMIT, shared PLANS); they must agree.
import { it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { PLANS } from '../brand'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const MIG = join(ROOT, 'supabase', 'migrations')
const sql = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(MIG, f), 'utf8')).join('\n')
const guard = sql.slice(sql.lastIndexOf('create or replace function public.brand_voice_status_guard('))

it('the status guard allows only building -> ready, and failed -> ready under the limit', () => {
  expect(guard).toMatch(/current_user <> 'authenticated'/)
  expect(guard).toMatch(/old\.status = 'building' and new\.status = 'ready'/)
  expect(guard).toMatch(/old\.status = 'failed' and new\.status = 'ready'/)
  expect(guard).toMatch(/raise exception/)
  expect(sql.slice(sql.lastIndexOf('brand_voices_status_guard on public.brand_voices'))).toMatch(/create trigger brand_voices_status_guard before update of status/)
})

it('the trigger, start-dna and PLANS agree on the voice limit', () => {
  const m = /case when v_plan = 'agency' then (\d+) else (\d+) end/.exec(guard)
  expect(m).not.toBeNull()
  const sqlLimit = (plan: string) => Number(plan === 'agency' ? m![1] : m![2])
  const dna = readFileSync(join(ROOT, 'supabase', 'functions', 'start-dna', 'index.ts'), 'utf8')
  const brandLimit = JSON.parse(/const BRAND_LIMIT: Record<string, number> = (\{[^}]*\})/.exec(dna)![1].replace(/(\w+):/g, '"$1":'))
  for (const p of PLANS) {
    expect(sqlLimit(p.id)).toBe(p.brandVoices)
    expect(brandLimit[p.id]).toBe(p.brandVoices)
  }
})
