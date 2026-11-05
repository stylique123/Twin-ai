// Lane 1 (owner 5 Nov): THE STALE SCRIPT ARRAY. `declared` is bound to
// templated.bp.script; sanitizeBlueprintLinks then deep-clones into `blueprint`,
// which is what is saved. The personal-use gate, the voice gate, pacing, the
// repetition repair and the final audit all edit or read `declared` AFTER that
// clone. This test runs the real clone, then whatever the edge does right after
// it, then a late repair through `declared`, and asserts the SAVED script has it.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { sanitizeBlueprintLinks } from '../../../../../supabase/functions/_shared/outputLinks.ts'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

/** The statements the edge runs between the clone and the first late repair. */
function afterClone(): string {
  const at = EDGE.indexOf('const { blueprint, removals: linkRemovals } = sanitizeBlueprintLinks(')
  const end = EDGE.indexOf('// ── THE PERSONAL-USE GATE', at)
  const block = EDGE.slice(at, end)
  // Only a statement that re-points `declared` matters here.
  return block.split('\n').filter((l) => /^\s*declared = /.test(l)).join('\n')
}

describe('a late repair reaches the saved script', () => {
  it('the personal-use gate rewrites a line through `declared`; the saved blueprint has the rewrite', () => {
    const templated = { bp: { script: [{ line: 'Hook.' }, { line: 'I use Harbor Blend every morning.' }, { line: 'Close.' }] } }
    let declared: unknown = templated.bp.script
    const { blueprint } = sanitizeBlueprintLinks(templated.bp, { hosts: [] } as never)
    // eslint-disable-next-line no-new-func
    declared = new Function('blueprint', 'declared', `${afterClone().replace(/ as \{[^}]*\}/g, '')}\nreturn declared`)(blueprint, declared)
    // The gate, as the edge writes it.
    const gateBeats = Array.isArray(declared) ? declared as Array<{ line?: unknown }> : []
    gateBeats[1]!.line = 'Harbor Blend is roasted every morning.'
    ;(declared as unknown[]).splice(2, 1)
    expect((blueprint as { script: Array<{ line: string }> }).script.map((b) => b.line)).toEqual(['Hook.', 'Harbor Blend is roasted every morning.'])
  })
  it('every read of `declared` after the clone sees the saved array', () => {
    const at = EDGE.indexOf('const { blueprint, removals: linkRemovals } = sanitizeBlueprintLinks(')
    const next = EDGE.indexOf('\n', EDGE.indexOf('linkAllow,', at))
    expect(afterClone()).toMatch(/declared = \(blueprint as \{ script\?: unknown \}\)\.script/)
    expect(EDGE.indexOf('declared = (blueprint as { script?: unknown }).script', at)).toBeGreaterThan(next)
  })
})
