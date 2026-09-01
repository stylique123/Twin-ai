import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(__dirname, '../lib/supabase.ts'), 'utf8')

/**
 * ⚠️ THE RESUMABLE PATH HAS NEVER PRODUCED A STORED OBJECT IN PRODUCTION (0 of 4);
 * the single-PUT path is 1 of 1. The structural difference is the fingerprint
 * store: tus keys on the blob, so attempt N resumes attempt N-1's upload URL —
 * which was authorized by a signature that is now dead.
 *
 * These assert the FIX, not the symptom. Each fails if the fingerprint is
 * removed or stops carrying the token.
 */
describe('a signed upload cannot resume one minted under another token', () => {
  it('supplies its own fingerprint rather than taking the tus default', () => {
    expect(SRC).toMatch(/\bfingerprint:\s*async\s*\(/)
  })

  it('mixes the signed token into the fingerprint, so a new token never matches an old upload', () => {
    const m = SRC.match(/\bfingerprint:\s*async\s*\([^)]*\)\s*=>\s*(.+)/)
    expect(m).not.toBeNull()
    expect(m![1]).toContain('target.token')
  })

  it('still scopes by the object path, so two different takes never share an entry', () => {
    const m = SRC.match(/\bfingerprint:\s*async\s*\([^)]*\)\s*=>\s*(.+)/)
    expect(m![1]).toContain('target.path')
  })
})
