// EVERY WRITER TO `creator_knowledge`, PINNED — AND NONE OF THEM IS THE WRITER.
//
// ⚠️ THE QUESTION THIS ANSWERS, FROM A REAL REPORT. "Autumn Collection" kept
// appearing in one creator's scripts (a5416d6d, 4681cffe), and it IS stored in
// `creator_knowledge` (row f26eb603: kind 'product', source 'caption', text
// "Autumn Collection scrunchie bandanas", created 2026-09-22 12:46 by the DNA
// scan). The suspicion was a loop: a script invents a name, the name is
// persisted as knowledge, the next script cites it as grounded. Audited: no such
// path exists. The row came from the scan's reading of her captions; the fix for
// that is in goalFidelity.ts (inferred product rows are unconfirmed).
//
// ⚖️ THIS TEST KEEPS THE AUDIT TRUE. It scans every TypeScript source for a
// write to `creator_knowledge` (insert / upsert / update / delete on
// `.from('creator_knowledge')`, and the `merge_creator_knowledge` RPC) and pins
// the complete list with the sources each writer may emit. A new writer — above
// all, one in `generate-blueprint` persisting writer or blueprint output —
// fails here until someone decides, in this file, that it is allowed.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(__dirname, '..', '..', '..', '..')
const DIRS = ['apps/web/src', 'packages/shared/src', 'supabase/functions', 'worker/src', 'scripts']

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[] = []
  try { entries = readdirSync(dir) } catch { return out }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist' || e === '__tests__' || e === 'generated') continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|mjs)$/.test(e) && !/\.test\.(ts|tsx|mjs)$/.test(e)) out.push(p)
  }
  return out
}

const codeLines = (t: string): string[] => t.split('\n').map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l))

/** file -> set of write operations found on creator_knowledge. */
function findWriters(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>()
  const add = (f: string, op: string) => {
    const k = relative(ROOT, f)
    if (!found.has(k)) found.set(k, new Set())
    found.get(k)!.add(op)
  }
  for (const d of DIRS) {
    for (const f of walk(join(ROOT, d))) {
      if (f.includes('/scripts/ci/')) continue // guards that quote the call as test data
      const raw = readFileSync(f, 'utf8')
      if (!raw.includes('creator_knowledge')) continue
      const lines = codeLines(raw)
      lines.forEach((l, i) => {
        if (/\.rpc\(\s*['"]merge_creator_knowledge['"]/.test(l)) add(f, 'rpc:merge_creator_knowledge')
        if (!/\.from\(\s*['"]creator_knowledge['"]\s*\)/.test(l)) return
        const window = lines.slice(i, i + 4).join('\n')
        const m = window.match(/\.from\(\s*['"]creator_knowledge['"]\s*\)\s*\.(insert|upsert|update|delete)\(/)
        if (m) add(f, m[1]!)
      })
    }
  }
  return found
}

// ⚖️ THE COMPLETE, DECIDED LIST. Each entry: what it writes and why it is not
// writer output.
const ALLOWED: Record<string, { ops: string[]; sources: string[]; why: string }> = {
  'apps/web/src/lib/creatorAnswers.ts': {
    ops: ['insert', 'update'],
    sources: ['asked'],
    why: 'A creator\'s own typed answer (question card / typed material); update only stamps creator_confirmed_at.',
  },
  'supabase/functions/answer-beat-ask/index.ts': {
    ops: ['insert'],
    sources: ['asked'],
    why: 'The creator\'s typed answer to a beat ask.',
  },
  'worker/src/knowledgeInsert.ts': {
    ops: ['rpc:merge_creator_knowledge', 'insert', 'update'],
    sources: ['caption', 'transcript'],
    why: 'The DNA scan / voice / remine jobs: a model reading HER posts, never a generated script.',
  },
}

describe('creator_knowledge writers', () => {
  const found = findWriters()

  it('the set of writers is exactly the decided list', () => {
    expect([...found.keys()].sort()).toEqual(Object.keys(ALLOWED).sort())
  })

  it('each writer performs only its decided operations', () => {
    for (const [file, ops] of found) {
      for (const op of ops) expect(ALLOWED[file]?.ops, `${file} does ${op}`).toContain(op)
    }
  })

  it('generate-blueprint never persists writer or blueprint output as knowledge', () => {
    const src = readFileSync(join(ROOT, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
    const code = codeLines(src).join('\n')
    expect(code).not.toMatch(/\.from\(\s*['"]creator_knowledge['"]\s*\)\s*\.(insert|upsert|update|delete)\(/)
    expect(code).not.toMatch(/merge_creator_knowledge/)
    // Its only write is the spend ledger (used_count / last_used_at via 0215).
    expect(code).toMatch(/rpc\('record_knowledge_use'/)
  })

  it('the typed-answer writers emit only `asked`, and the scan emits only caption/transcript', () => {
    const answers = readFileSync(join(ROOT, 'supabase/functions/answer-beat-ask/index.ts'), 'utf8')
    expect(answers).toMatch(/source:\s*'asked'/)
    const scan = [
      'worker/src/jobs/scrapeDna.ts', 'worker/src/jobs/voice.ts', 'worker/src/jobs/remineKnowledge.ts',
    ].map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n')
    const emitted = new Set([...scan.matchAll(/(?:^|[\s{,])(?:__)?source:\s*'([a-z_]+)'/gm)].map((m) => m[1]))
    for (const s of emitted) expect(ALLOWED['worker/src/knowledgeInsert.ts']!.sources).toContain(s)
  })
})
