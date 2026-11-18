// Security audit #14: both posts write policies must check what the post points at,
// not only who owns the row, or a post can publish another creator's video.
import { it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const MIG = join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..'), 'supabase', 'migrations')
const sql = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(MIG, f), 'utf8')).join('\n')

it.each(['create policy "posts own insert"', 'create policy "workspace posts update"'])('%s checks the post\'s references', (start) => {
  const policy = sql.slice(sql.lastIndexOf(start)).split(';')[0]
  expect(policy).toContain('public.post_refs_belong_to_owner(owner_id, media_path, generation_id, edit_project_id, output_asset_id)')
})
