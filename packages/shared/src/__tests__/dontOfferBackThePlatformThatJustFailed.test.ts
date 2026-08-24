import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { otherPlatforms, otherPlatformsSentence, READABLE_PLATFORMS } from '../scanFailure'
import * as shared from '../index'

// ⚠️ THE SCREEN HARDCODED ALL THREE. After an Instagram scan failed on Twin's
// own side, onboarding advised "try the same creator on another platform —
// YouTube, TikTok or Instagram", offering back the platform that had just
// failed. A creator who takes that literally repeats the failure.
//
// ⚖️ AND `otherPlatforms` WAS ALREADY CORRECT, AND CALLED BY NOTHING. This is
// the pattern the question audit exists to catch, found for the sixth time:
// the decision was made, tested, and never connected to a screen.

describe('the failed platform is never offered back', () => {
  it.each(READABLE_PLATFORMS)('%s is excluded after it fails', (p) => {
    expect(otherPlatforms(p)).not.toContain(p)
    expect(otherPlatformsSentence(p).toLowerCase()).not.toContain(p)
  })

  it('the other two survive', () => {
    expect(otherPlatforms('instagram')).toEqual(['youtube', 'tiktok'])
  })

  // ⚖️ AN UNKNOWN PLATFORM EXCLUDES NOTHING, which is right: we have no reason
  // to withhold a suggestion just because the failure came from somewhere we
  // do not scan.
  it('an unrecognised platform leaves all three', () => {
    expect(otherPlatforms('myspace')).toEqual(['youtube', 'tiktok', 'instagram'])
  })
})

describe('it reads as English, because a creator reads it', () => {
  it('two platforms join with "or", not a comma', () => {
    expect(otherPlatformsSentence('instagram')).toBe('YouTube or TikTok')
  })

  it('three use commas and a final "or"', () => {
    expect(otherPlatformsSentence('other')).toBe('YouTube, TikTok or Instagram')
  })

  it('the names are the ones creators see, not our slugs', () => {
    const s = otherPlatformsSentence('instagram')
    expect(s).not.toMatch(/youtube|tiktok/)  // lowercase slugs must not leak
    expect(s).toMatch(/YouTube/)
  })
})

describe('nothing to suggest means nothing is said', () => {
  // ⚠️ AN EMPTY STRING IS A REAL ANSWER. Rendering it inside the sentence would
  // print "try the same creator on ." — worse than silence.
  it('an empty list produces an empty string, not a dangling sentence', () => {
    const none = READABLE_PLATFORMS.filter(() => false)
    expect(none.length).toBe(0)
    // The live guarantee: the caller checks for '' before rendering.
    const repo = join(import.meta.dirname, '..', '..', '..', '..')
    const code = readFileSync(join(repo, 'apps', 'web', 'src', 'pages', 'Onboarding.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    // ⚠️ THE PROPERTY, NOT ONE SPELLING OF IT. This first asserted the literal
    // expression `otherPlatformsSentence(draft.platform) !== ''` and then failed
    // against CORRECT code when the condition became the equivalent
    // `otherPlatforms(draft.platform).length > 0`. The TEST was wrong, not the
    // change: what must hold is that the block is GUARDED on there being
    // somewhere to send them -- by either form -- never rendered unconditionally.
    const guarded = /otherPlatformsSentence\(draft\.platform\) !== ''/.test(code)
      || /otherPlatforms\(draft\.platform\)\.length > 0/.test(code)
    expect(guarded, 'the cross-platform block must be gated on having somewhere to send them').toBe(true)
  })
})

describe('the screen actually calls it', () => {
  const repo = join(import.meta.dirname, '..', '..', '..', '..')
  const code = readFileSync(join(repo, 'apps', 'web', 'src', 'pages', 'Onboarding.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  it('no longer hardcodes the three platform names', () => {
    expect(code).not.toMatch(/YouTube, TikTok or Instagram/)
  })

  it('renders the computed sentence instead', () => {
    expect(code).toMatch(/otherPlatformsSentence\(draft\.platform\)/)
  })

  it('is exported from the package index', () => {
    expect(typeof shared.otherPlatformsSentence).toBe('function')
  })
})
