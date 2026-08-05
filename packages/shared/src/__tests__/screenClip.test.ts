// The rules this file holds:
//
//   1. A browser that cannot record returns NULL, not a plausible default —
//      starting a recorder on an unsupported type produces an empty blob, and
//      a 0-byte "clip" is worse than an honest refusal.
//   2. The codec suffix never reaches the server: 0107's CHECK is on the bare
//      type, and `video/webm;codecs=vp9` would be refused as a policy violation
//      for a file that is perfectly fine.
//   3. The server's own error vocabulary survives to the screen.
import { describe, expect, it } from 'vitest'
import { baseMime, clipErrorMessage, pickClipMime } from '../screenClip'

const supports = (...types: string[]) => ({
  isTypeSupported: (t: string) => types.includes(t),
})

describe('picking a mime this browser can actually produce', () => {
  it('prefers vp9, then vp8, then bare webm', () => {
    expect(pickClipMime(supports('video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm')))
      .toBe('video/webm;codecs=vp9')
    expect(pickClipMime(supports('video/webm;codecs=vp8', 'video/webm')))
      .toBe('video/webm;codecs=vp8')
    expect(pickClipMime(supports('video/webm'))).toBe('video/webm')
  })

  it('falls back to mp4 for Safari', () => {
    expect(pickClipMime(supports('video/mp4'))).toBe('video/mp4')
  })

  it('returns NULL when nothing is supported', () => {
    // A recorder started on an unsupported type yields an empty blob, which
    // 0107 refuses as `clip_policy_size` — after the creator has performed the
    // whole recording. Better to say so before.
    expect(pickClipMime(supports())).toBeNull()
  })

  it('never returns a type the browser did not claim', () => {
    // The obvious bug: returning the first candidate regardless.
    expect(pickClipMime(supports('video/mp4'))).not.toContain('webm')
  })
})

describe('the codec suffix never reaches the server', () => {
  it('strips it', () => {
    // 0107's CHECK is `mime in ('video/webm','video/mp4')`. Sending the codec
    // parameter would fail a perfectly good recording as a policy violation.
    expect(baseMime('video/webm;codecs=vp9')).toBe('video/webm')
    expect(baseMime('video/webm; codecs="vp8,opus"')).toBe('video/webm')
    expect(baseMime('video/mp4')).toBe('video/mp4')
  })

  it('normalizes case and whitespace', () => {
    expect(baseMime('  VIDEO/WEBM ; codecs=vp9')).toBe('video/webm')
  })
})

describe("the server's words survive to the screen", () => {
  it('translates the codes a creator can act on', () => {
    expect(clipErrorMessage('clip_limit_reached: 12 clips already on this video'))
      .toMatch(/as many clips as one video can hold/i)
    expect(clipErrorMessage('clip_quota_exceeded')).toMatch(/out of storage/i)
    expect(clipErrorMessage('clip_policy_size')).toMatch(/empty or far too long/i)
  })

  it('and keeps an unrecognised one VERBATIM', () => {
    // A friendly replacement for a message nobody anticipated is a lie with
    // better manners — and it hides the thing that would explain the bug.
    expect(clipErrorMessage('some_new_code: 42')).toBe('some_new_code: 42')
  })
})
