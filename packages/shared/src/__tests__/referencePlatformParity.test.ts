// THE PLATFORM WAS WRITTEN ON THE URL AND WE ASKED THE CALLER FOR IT ANYWAY.
//
// ⚠️ MEASURED IN PRODUCTION. 44 of 51 reference transcripts stored a NULL
// platform; 34 of those carry "youtube" in the source URL. `ingest-reference`
// read only `body.platform`, and the client never sent one — so the studio
// showed the creator a chip reading "unknown" beside a youtube.com link, on
// almost every generation.
//
// ⚖️ A DERIVABLE FACT MUST NOT BE A PARAMETER. Anything a caller can omit, some
// caller will omit. Deriving it in the edge repairs every existing client
// without shipping one.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import {
  platformFromUrl, isSupportedReference, resolveReferencePlatform, REFERENCE_PLATFORMS,
} from '../referencePlatform'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'ingest-reference', 'index.ts'), 'utf8')

/** ⚖️ EXECUTED, NOT PATTERN-MATCHED — a host rule that differs by one character
 *  is exactly the drift a text comparison waves through. */
function loadInline(): (url: string, claimed?: string | null) => string | null {
  const start = EDGE.indexOf('  const platform = (() => {')
  // ⚠️ STOP BEFORE THE IIFE'S TRAILING `()`. Including it invokes the arrow
  // immediately with no arguments, so the first draft captured the RESULT
  // (null) and called it — "inline is not a function".
  const end = EDGE.indexOf('})()', start) + 2
  expect(start).toBeGreaterThan(-1)
  const body = EDGE.slice(start, end)
    .replace('  const platform = (() => {', 'return ((url, bodyPlatform) => {')
    .replace('body.platform', 'bodyPlatform')
  const js = transformSync(body, { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(js)() as (url: string, claimed?: string | null) => string | null
}

const inline = loadInline()

const CASES: Array<[string, string | null]> = [
  ['https://youtube.com/shorts/RNRjGXC9lCs?si=8Nd', 'youtube'],
  ['https://www.youtube.com/watch?v=abc', 'youtube'],
  ['https://m.youtube.com/shorts/x', 'youtube'],
  ['https://youtu.be/abc123', 'youtube'],
  ['https://www.tiktok.com/@user/video/123', 'tiktok'],
  ['https://m.tiktok.com/v/123', 'tiktok'],
  ['https://www.instagram.com/reel/abc/', 'instagram'],
  // ⚠️ THE SSRF CASE. A substring test accepts this; a host test refuses it.
  ['https://evil.example.com/?q=youtube.com', null],
  ['https://nottiktok.com/video/1', null],
  ['https://youtube.com.evil.co/x', null],
  ['not a url at all', null],
  ['', null],
  ['   ', null],
]

describe('the platform is read off the link', () => {
  it('classifies every real shape the creators paste', () => {
    for (const [url, want] of CASES) {
      expect(platformFromUrl(url), url).toBe(want)
    }
  })

  it('matches on the HOST, never as a substring', () => {
    // ⚠️ THE ALLOW-LIST IS AN SSRF BOUNDARY. `endsWith('.' + d)` admits
    // www.youtube.com and refuses youtube.com.evil.co.
    expect(platformFromUrl('https://evil.example.com/?q=youtube.com')).toBeNull()
    expect(platformFromUrl('https://youtube.com.evil.co/x')).toBeNull()
    expect(platformFromUrl('https://www.youtube.com/x')).toBe('youtube')
  })

  it('never throws on creator-pasted text', () => {
    for (const bad of ['', '   ', 'hello', 'http://', '://x', null, undefined]) {
      expect(() => platformFromUrl(bad as string)).not.toThrow()
    }
  })

  it('supported is DEFINED as "resolved to a platform"', () => {
    // ⚖️ There were two host lists and only one was consulted. Defining support
    // in terms of the platform makes them unable to disagree.
    for (const [url, want] of CASES) {
      expect(isSupportedReference(url), url).toBe(want !== null)
    }
  })
})

describe('the URL beats a contradicting claim', () => {
  it('ignores a caller that says the wrong thing', () => {
    // ⚠️ Storing the claim would put a platform on a row the link refutes.
    expect(resolveReferencePlatform('https://youtube.com/shorts/x', 'tiktok')).toBe('youtube')
  })

  it('falls back to the claim only when the URL yields nothing', () => {
    expect(resolveReferencePlatform('https://example.com/x', 'other')).toBe('other')
    expect(resolveReferencePlatform('https://example.com/x', 'tiktok')).toBe('tiktok')
  })

  it('returns NULL rather than guessing "other"', () => {
    // ⚖️ "We could not tell" and "the creator said it is something else" are
    // different facts, and only the second is an answer.
    expect(resolveReferencePlatform('https://example.com/x', null)).toBeNull()
    expect(resolveReferencePlatform('https://example.com/x', 'nonsense')).toBeNull()
  })
})

describe('edge ↔ shared parity, executed', () => {
  it('agrees on every case, with and without a claim', () => {
    for (const [url] of CASES) {
      for (const claimed of [undefined, null, 'tiktok', 'youtube', 'other', 'nonsense', '']) {
        expect(inline(url, claimed), `${url} / ${claimed}`)
          .toBe(resolveReferencePlatform(url, claimed))
      }
    }
  })

  it('the edge no longer trusts the body alone', () => {
    // ⚠️ THE EXACT LINE THIS EXISTS FOR.
    expect(EDGE).not.toMatch(/const platform = \['tiktok', 'instagram', 'youtube', 'other'\]\.includes\(body\.platform \?\? ''\)/)
    expect(EDGE).toMatch(/new URL\(url\)\.hostname\.toLowerCase\(\)/)
  })

  it('covers every platform the shared list names', () => {
    for (const p of REFERENCE_PLATFORMS) {
      expect(CASES.some(([, want]) => want === p), p).toBe(true)
    }
  })
})
