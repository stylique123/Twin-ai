// What a browser can actually record, and what the server is told about it.
//
// Both of these are one-line functions whose absence is a whole broken capture:
// a hardcoded `video/webm` throws on Safari AFTER the creator has picked a
// window to share, and a codec suffix reaching the create RPC fails a perfectly
// good recording as a policy violation.
import { describe, expect, it } from 'vitest'
import { baseClipMime, pickClipMime } from '../capture'

const supports = (...types: string[]) => ({
  isTypeSupported: (t: string) => types.includes(t),
})

describe('picking a type this browser can actually produce', () => {
  it('prefers vp9, then vp8, then bare webm', () => {
    expect(pickClipMime(supports('video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm')))
      .toBe('video/webm;codecs=vp9')
    expect(pickClipMime(supports('video/webm;codecs=vp8', 'video/webm')))
      .toBe('video/webm;codecs=vp8')
    expect(pickClipMime(supports('video/webm'))).toBe('video/webm')
  })

  it('falls back to mp4, which is all Safari records', () => {
    expect(pickClipMime(supports('video/mp4'))).toBe('video/mp4')
  })

  it('never returns a type the browser did not claim', () => {
    // The obvious bug: returning the first candidate regardless of support,
    // which is what a hardcoded type amounts to.
    expect(pickClipMime(supports('video/mp4'))).not.toContain('webm')
  })

  it('returns NULL when nothing is supported', () => {
    // A recorder started on an unsupported type yields an EMPTY blob, which the
    // create RPC then refuses as a size violation — after the creator has
    // performed the whole recording. Saying so first costs them nothing.
    expect(pickClipMime(supports())).toBeNull()
  })
})

describe('the codec suffix never reaches the server', () => {
  it('is stripped', () => {
    // The RPC's CHECK is on `video/webm` / `video/mp4`. A codec is a property
    // of the encoder, not of the file's kind.
    expect(baseClipMime('video/webm;codecs=vp9')).toBe('video/webm')
    expect(baseClipMime('video/webm; codecs="vp8,opus"')).toBe('video/webm')
    expect(baseClipMime('video/mp4')).toBe('video/mp4')
  })

  it('normalizes case and whitespace', () => {
    expect(baseClipMime('  VIDEO/WEBM ; codecs=vp9')).toBe('video/webm')
  })

  it('every type the picker can return survives it as an accepted base type', () => {
    // The two functions have to agree, or the picker chooses something the
    // server refuses. Checked as a property rather than case by case.
    const all = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
    for (const t of all) {
      expect(['video/webm', 'video/mp4']).toContain(baseClipMime(pickClipMime(supports(t))!))
    }
  })
})
