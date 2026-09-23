// ⚠️ 2026-09-23: `callModel` returns a JSON STRING; the claim-leak and
// phrase-overlap repairs read `.rewrites` off it directly, so no rewrite ever
// applied. Both must go through `parseRepairRewrites`.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const EDGE = readFileSync(new URL('../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url), 'utf8')
describe('repair rewrites are parsed before use', () => {
  it('no repair reads .rewrites off the raw model string', () => {
    expect(EDGE).not.toMatch(/fixed as \{ rewrites\?/)
    expect(EDGE.match(/parseRepairRewrites\(fixed\)/g)?.length).toBe(2)
  })
  it('the parser handles a string and never throws', () => {
    const fn = EDGE.slice(EDGE.indexOf('function parseRepairRewrites'), EDGE.indexOf('async function callModel('))
    expect(fn).toMatch(/typeof raw === 'string' \? JSON\.parse\(raw\) : raw/)
    expect(fn).toMatch(/catch \{ return \[\] \}/)
  })
})
