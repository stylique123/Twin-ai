// Security audit #4: the latest read policy on reference_content_profiles must
// scope rows to URLs the caller can already see, never `using (true)`.
import { it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const MIG = join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..'), 'supabase', 'migrations')
const sql = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(MIG, f), 'utf8')).join('\n')

it('reference profiles are readable only through a URL the caller can see', () => {
  const last = sql.slice(sql.lastIndexOf('create policy reference_content_profiles_read'))
  const policy = last.slice(0, last.indexOf(');') + 2)
  expect(policy).not.toMatch(/using \(true\)/)
  for (const source of ['gallery_items', 'scraped_posts', 'generations', 'jobs']) expect(policy).toContain(`public.${source}`)
})
