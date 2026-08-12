// THE PATTERN EXISTS TWICE, AND THE ONE THAT RUNS IS THE EDGE'S.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const SHARED = readFileSync(join(REPO, 'packages/shared/src/knowledgeResolver.ts'), 'utf8')

const lift = (src: string) =>
  src.match(/const PROGRESS_CHECK =\s*\n\s*(\/.+\/i)/)?.[1]
  ?? (() => { throw new Error('could not lift PROGRESS_CHECK — fix the marker, do not retype the pattern') })()

describe('edge ↔ shared progress-check parity', () => {
  it('the pattern is character-identical', () => {
    expect(lift(EDGE)).toBe(lift(SHARED))
  })

  it('the edge applies the SAME second condition — the beat must carry nothing', () => {
    // ⚖️ Without it the guard would condemn a re-hook that does real work, and a
    // guard that deletes good beats to fix bad ones gets switched off.
    expect(EDGE).toMatch(/PROGRESS_CHECK\.test\(line\) && \(sub === 'none' \|\| sub === ''\)/)
  })

  it('counts rather than rewrites, and reports the count', () => {
    expect(EDGE).toMatch(/progress_checks: progressChecks/)
    const block = EDGE.slice(EDGE.indexOf('let progressChecks = 0'), EDGE.indexOf("event: 'beat_substance'"))
    // ⚠️ `\.line =` ALSO MATCHES `r?.line === 'string'`. The same one-character
    // trap caught the routing-shadow guard earlier today; the lookahead is what
    // separates an assignment from a comparison.
    expect(block).not.toMatch(/\.line\s*=[^=]|splice|\.filter\(/)
  })
})
