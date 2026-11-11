// Guard: a merge once committed conflict markers into index.css and
// tailwind.config.js, which broke the CSS build. Fail fast if it happens again.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (n === 'node_modules' || n === 'dist' || n.startsWith('.')) return []
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css|js|json|html)$/.test(n) ? [p] : []
  })
}

describe('no merge conflict markers', () => {
  it('has none in apps/web', () => {
    const bad = files(WEB).filter((f) => /^(<<<<<<< |>>>>>>> )/m.test(readFileSync(f, 'utf8')))
    expect(bad).toEqual([])
  })
})
