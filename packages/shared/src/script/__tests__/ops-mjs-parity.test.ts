import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'

// The scripts/lib .mjs copies (for Node 20 ops self-tests) must be exactly the
// generated form of their shared source. Same rule as generate_ops_mjs_copies.mjs --check.
const ROOT = new URL('../../../../../', import.meta.url)
const COPIES = [
  ['packages/shared/src/script/realisticPanel.ts', 'scripts/lib/realisticPanel.mjs'],
  ['packages/shared/src/script/painMap.ts', 'scripts/lib/painMap.mjs'],
] as const

describe('scripts/lib .mjs copies match their shared source', () => {
  for (const [from, to] of COPIES) {
    it(to, () => {
      const src = readFileSync(new URL(from, ROOT), 'utf8')
      expect(src).not.toMatch(/^\s*import\s/m)
      const { code } = transformSync(src, { loader: 'ts', format: 'esm', target: 'node20' })
      const want = `// GENERATED from ${from} by scripts/ci/generate_ops_mjs_copies.mjs. Do not edit.\n${code}`
      expect(readFileSync(new URL(to, ROOT), 'utf8')).toBe(want)
    })
  }
})
