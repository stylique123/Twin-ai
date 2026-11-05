// Owner 5 Nov (lane 1): AUDIENCE_REWRITE is off by default.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'

describe('AUDIENCE_REWRITE', async () => {
  const { audienceRewriteOn } = await import('../nicheBrain/audience.js')
  it('unset or off: no viewer rewrite reaches anyone', () => {
    for (const f of [undefined, '', 'off', 'false', '0']) expect(audienceRewriteOn(f, 'u-1')).toBe(false)
  })
  it('all: everyone; a list: only those ids', () => {
    expect(audienceRewriteOn('all', 'u-1')).toBe(true)
    expect(audienceRewriteOn(' P-1, p-2 ', 'p-2')).toBe(true)
    expect(audienceRewriteOn('p-1,p-2', 'u-1')).toBe(false)
    expect(audienceRewriteOn('p-1', null)).toBe(false)
  })
  it('one switch gates both rewrite loops and both writes to generations', () => {
    const src = readFileSync(new URL('../nicheBrain/audience.ts', import.meta.url), 'utf8')
    expect(src).toContain('const rewriteOn = audienceRewriteOn(process.env.AUDIENCE_REWRITE, g.user_id)')
    expect(src).toContain('while (rewriteOn && rounds < HOOK_ROUNDS')
    expect(src).toContain('while (rewriteOn && lineRounds < SCRIPT_ROUNDS')
    expect(src).toMatch(/if \(rewriteOn && \(reordered \|\|/)
    expect(src).toContain('if (rewriteOn && ordered[0] && want) {')
  })
})
