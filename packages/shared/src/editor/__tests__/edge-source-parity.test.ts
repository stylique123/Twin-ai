// Source-invariant parity (Constitution §10D): the source-asset edge (Deno) cannot
// import shared at deploy time, so it INLINES the edge-core functions + key sets.
// Shared is the single source of truth; this test proves the edge's inlined bodies
// are byte-identical (whitespace/comment-normalized) to the shared canonical
// definitions, so they can never silently drift. Behavioral proof lives in
// sourceCreate.test.ts (the injectable handler); this guards the copy.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../..')
const captureSrc = readFileSync(resolve(REPO, 'packages/shared/src/editor/capture.ts'), 'utf8')
const sourceCreateSrc = readFileSync(resolve(REPO, 'packages/shared/src/editor/sourceCreate.ts'), 'utf8')
const edgeSrc = readFileSync(resolve(REPO, 'supabase/functions/source-asset/index.ts'), 'utf8')

// Extract a top-level `export [async] function NAME(...) { ... }` up to its column-0
// `}`. Compare CODE only: strip `export`, blank lines, and `//` comment lines so a
// differing inline comment is not treated as drift.
function extractFn(src: string, name: string): string | null {
  const m = src.match(new RegExp(`export (?:async )?function ${name}\\([\\s\\S]*?\\n\\}`))
  if (!m) return null
  return m[0].replace(/^export\s+/, '').split('\n').map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//')).join('\n')
}
// Extract a `[export] const NAME = new Set([...])` declaration's Set contents.
function extractSet(src: string, name: string): string | null {
  const m = src.match(new RegExp(`(?:export )?const ${name} = new Set\\(\\[[^\\]]*\\]\\)`))
  if (!m) return null
  return m[0].replace(/^export\s+/, '').trim()
}

const FUNCS: Array<{ name: string; shared: string }> = [
  { name: 'normalizeSourceMime', shared: captureSrc },
  { name: 'safeSizeBytes', shared: sourceCreateSrc },
  { name: 'buildCreateInput', shared: sourceCreateSrc },
  { name: 'buildCreatePlan', shared: sourceCreateSrc },
  { name: 'createErrorStatus', shared: sourceCreateSrc },
  { name: 'mapCreateError', shared: sourceCreateSrc },
  { name: 'executePreparedCreate', shared: sourceCreateSrc },
  { name: 'runSourceCreate', shared: sourceCreateSrc },
  { name: 'handleSourceAssetRequest', shared: sourceCreateSrc },
]
const SETS = ['CREATE_BODY_KEYS', 'CAPTURE_SNAKE_KEYS', 'SEGMENT_SNAKE_KEYS', 'FINALIZE_BODY_KEYS']

describe('edge ↔ shared source-invariant parity (no drift)', () => {
  it('the edge inlines each edge-core function byte-identically to shared', () => {
    expect(edgeSrc).toContain('EDGE-CORE-BEGIN')
    expect(edgeSrc).toContain('EDGE-CORE-END')
    for (const { name, shared } of FUNCS) {
      const sharedFn = extractFn(shared, name)
      const edgeFn = extractFn(edgeSrc, name)
      expect(sharedFn, `shared ${name} not found`).toBeTruthy()
      expect(edgeFn, `edge ${name} not found`).toBeTruthy()
      expect(edgeFn, `edge ${name} drifted from shared`).toBe(sharedFn)
    }
  })
  it('the edge inlines each frozen key set byte-identically to shared', () => {
    for (const name of SETS) {
      const sharedSet = extractSet(sourceCreateSrc, name)
      const edgeSet = extractSet(edgeSrc, name)
      expect(sharedSet, `shared ${name} not found`).toBeTruthy()
      expect(edgeSet, `edge ${name} not found`).toBeTruthy()
      expect(edgeSet, `edge ${name} drifted from shared`).toBe(sharedSet)
    }
  })
})
