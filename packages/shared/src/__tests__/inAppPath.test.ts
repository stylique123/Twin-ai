// A string from the database is not a route.
//
// `NotificationBell` navigates to `notifications.link`. That column is
// server-written today, so the react-router open-redirect advisory
// (GHSA-wrjc-x8rr-h8h6) has no way in — but that is a fact about the current
// writers, not about the call, and the next edge function to build a link from
// a brand handle or a campaign name will not connect itself to a router
// advisory. These pin the boundary check that survives whichever writer arrives.
//
// Every control character below is written as an ESCAPE SEQUENCE. An earlier
// version of this file pasted the raw bytes in, which turned the source into a
// binary blob to `grep` and made the assertions invisible in review — the exact
// property being defended against, reproduced in the defence.
import { describe, expect, it } from 'vitest'
import { inAppPath, isInAppPath } from '../inAppPath'

describe('an in-app path is allowed through unchanged', () => {
  it('accepts an ordinary route', () => {
    expect(inAppPath('/result/abc')).toBe('/result/abc')
  })

  it('accepts a query and a hash', () => {
    expect(inAppPath('/app?ref=x#top')).toBe('/app?ref=x#top')
  })

  it('trims surrounding whitespace rather than rejecting it', () => {
    // A trailing newline from a SQL heredoc is a formatting accident, not an
    // attack, and refusing it would break a real notification.
    expect(inAppPath('  /calendar  ')).toBe('/calendar')
  })
})

describe('anything that could leave the site is refused', () => {
  it('refuses an absolute URL', () => {
    expect(inAppPath('https://evil.example/steal')).toBeNull()
    expect(inAppPath('http://evil.example')).toBeNull()
  })

  it('refuses a protocol-relative URL', () => {
    // `//evil.example` looks like a path and is not one.
    expect(inAppPath('//evil.example')).toBeNull()
  })

  it('refuses the BACKSLASH form the advisory is about', () => {
    // Some parsers normalise a backslash to a slash, so `/\evil.example`
    // becomes protocol-relative AFTER the router decided it looked internal.
    expect(inAppPath('/\\evil.example')).toBeNull()
    expect(inAppPath('\\\\evil.example')).toBeNull()
  })

  it('refuses a backslash anywhere, not only at the front', () => {
    // A legitimate path in this product never contains one, and allowing it
    // would mean reasoning about which parser normalises it and when — a
    // question with a different answer per browser.
    expect(inAppPath('/result/a\\b')).toBeNull()
  })

  it('refuses a javascript: or data: destination', () => {
    expect(inAppPath('javascript:alert(1)')).toBeNull()
    expect(inAppPath('data:text/html,<b>x')).toBeNull()
  })

  it('refuses anything not starting with a slash', () => {
    expect(inAppPath('result/abc')).toBeNull()
    expect(inAppPath('evil.example')).toBeNull()
  })

  it('refuses embedded control characters', () => {
    // The guard sees one string and the consumer parses another — a newline or
    // a NUL inside a destination is the classic form of that split.
    expect(inAppPath('/result\n/evil')).toBeNull()
    expect(inAppPath('/result\u0000/evil')).toBeNull()
    expect(inAppPath('/result\u007f')).toBeNull()
  })
})

describe('absent is absent, and never a guessed destination', () => {
  it('refuses null, undefined, empty and whitespace', () => {
    expect(inAppPath(null)).toBeNull()
    expect(inAppPath(undefined)).toBeNull()
    expect(inAppPath('')).toBeNull()
    expect(inAppPath('   ')).toBeNull()
  })

  it('refuses a non-string', () => {
    expect(inAppPath(42 as unknown as string)).toBeNull()
    expect(inAppPath({} as unknown as string)).toBeNull()
  })

  it('never returns a REPAIRED path', () => {
    // Sanitising `https://evil.example/x` into `/x` would send the creator
    // somewhere nobody chose. The caller renders a non-clickable notification
    // instead, which is the honest outcome: we do not know where this went.
    for (const bad of ['https://evil.example/x', '//evil.example/x', '/\\evil.example/x']) {
      expect(inAppPath(bad)).toBeNull()
    }
  })

  it('isInAppPath agrees with inAppPath on every case', () => {
    for (const v of ['/ok', '//evil', '/\\evil', '', null, 'https://x.example']) {
      expect(isInAppPath(v)).toBe(inAppPath(v) !== null)
    }
  })
})
