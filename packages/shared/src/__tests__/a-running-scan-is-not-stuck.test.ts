// Security audit #17: a running scan is reaped only after the 40-minute worker
// lease, and its voice is left alone while the scan job is live.
import { it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const MIG = join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..'), 'supabase', 'migrations')
const sql = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(MIG, f), 'utf8')).join('\n')
const latest = (fn: string) => sql.slice(sql.lastIndexOf(`create or replace function public.${fn}(`)).split('end;\n$$;')[0]

it('reaps a running scan by its lock age, not its claim time', () => {
  expect(latest('reap_stuck_scrape_dna')).toMatch(/j\.status = 'running' and coalesce\(j\.locked_at, j\.updated_at\) < now\(\) - interval '40 minutes'/)
})

it('leaves a voice alone while its scan job is queued or running', () => {
  expect(latest('reap_stuck_dna_builds')).toMatch(/not exists \([\s\S]*j\.type = 'scrape_dna'[\s\S]*j\.status in \('queued', 'running'\)/)
})
