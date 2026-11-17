// Security audit #7: a signed-in user must not be able to insert gallery_items
// rows, because each insert queues a paid analysis job (trigger from 0176).
// Guards both halves: the migrations end with the insert path closed, and no
// browser code relies on inserting (so the revoke cannot break the app).
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const MIG = join(ROOT, 'supabase', 'migrations')
const migrations = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()

function lastFileMatching(re: RegExp): string | undefined {
  return [...migrations].reverse().find((f) => re.test(readFileSync(join(MIG, f), 'utf8')))
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '__tests__') return []
    const p = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(p)
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
  })
}

describe('gallery_items insert path', () => {
  it('the last migration to touch the insert policy drops it and revokes insert', () => {
    const created = lastFileMatching(/create policy "gallery own insert"/)
    const dropped = lastFileMatching(/drop policy if exists "gallery own insert"/)
    expect(created).toBeDefined()
    expect(dropped).toBeDefined()
    expect(dropped! > created!).toBe(true)
    expect(readFileSync(join(MIG, dropped!), 'utf8'))
      .toMatch(/revoke insert on public\.gallery_items from anon, authenticated/)
    expect(lastFileMatching(/grant[^;]*insert[^;]*on (table )?(public\.)?gallery_items/)).toBeUndefined()
  })

  it('no browser code inserts into gallery_items', () => {
    const offenders = [join(ROOT, 'apps'), join(ROOT, 'packages', 'shared', 'src')]
      .flatMap(sourceFiles)
      .filter((f) => /from\(\s*['"]gallery_items['"]\s*\)[^;]{0,200}?\.(insert|upsert)\(/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
