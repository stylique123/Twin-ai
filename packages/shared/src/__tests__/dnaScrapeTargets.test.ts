// WHAT THE DNA SCAN ACTUALLY ASKS FOR.
//
// A public YouTube channel full of Shorts was reported as "we couldn't read any
// public posts from @you". The account was public and the scrape succeeded. It
// returned zero items because the only URL requested was `/videos`, and YouTube
// does not list Shorts there — they live on their own tab.
//
// The scan was therefore blindest at exactly the creator this product exists
// for: TwinAI writes short-form, so a Shorts-only channel is the typical case.
//
// `supabase/functions/_shared/dna.ts` is Deno and cannot be imported here (the
// same constraint `generate-blueprint` lives under, and `referenceAnalysis.test.ts`
// sets the precedent of reading the source instead). These assertions are about
// the request the scan makes, which is the thing that regressed.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../..')
const dna = readFileSync(resolve(REPO, 'supabase/functions/_shared/dna.ts'), 'utf8')

describe('the YouTube scan asks for the tab the creator actually posts on', () => {
  it('requests /shorts', () => {
    // The regression this file exists for. Without it, a Shorts-only channel
    // reads as an empty account.
    expect(dna).toContain('/shorts')
  })

  it('still requests /videos', () => {
    // Dropping long-form to fix short-form would just move the blind spot.
    expect(dna).toContain('/videos')
  })

  it('asks for Shorts FIRST', () => {
    // `maxResults` caps the run. When the cap binds, a short-form product
    // should keep the short-form half, so the long-form tail is what falls off.
    expect(dna.indexOf('/shorts')).toBeLessThan(dna.indexOf('/videos'))
  })
})

describe('a pasted channel URL resolves to the handle, not the tab', () => {
  it('prefers the @segment over the last path segment', () => {
    // YouTube's UI hands out `.../@name/shorts` and `.../@name/videos`, so the
    // last segment is usually the TAB. Scanning a handle called `shorts`
    // reports "no public posts" — true, and completely misleading.
    expect(dna).toMatch(/segs\.find\(\(s\) => s\.startsWith\('@'\)\)/)
  })

  it('still falls back to the last segment', () => {
    // `instagram.com/name/` carries no @, and must keep working.
    expect(dna).toMatch(/at \?\? segs\.pop\(\)/)
  })

  it('does not go back to popping blindly', () => {
    // The exact line that produced the bug.
    expect(dna).not.toMatch(/const seg = u\.pathname\.split\('\/'\)\.filter\(Boolean\)\.pop\(\)/)
  })
})
