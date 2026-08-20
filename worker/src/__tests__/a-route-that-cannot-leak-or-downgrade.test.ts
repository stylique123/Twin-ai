// THE RUNG THAT COSTS MONEY, AND THE TWO WAYS IT COULD GO QUIETLY WRONG.
//
// ⚠️ ONE: A CREDENTIAL IN A LOG. The residential proxy authenticates in the URL,
// so the naive `--proxy http://user:password@host` string is a password sitting
// in argv, ready for somebody to print "just to debug it". Nothing here ever
// hands that string back to a caller who might log it unredacted.
//
// ⚠️ TWO: A SILENT DOWNGRADE. If the password were missing and the builder
// returned no args, the download would run LOCALLY while the row recorded
// `residential_proxy` — and the one measurement this ladder exists to produce
// ("what fraction needs paid routing?") would be quietly false. Failing loudly
// is the only honest option.
import { describe, expect, it } from 'vitest'
import {
  downloadArgsFor, stickySessionId, redactProxy, parseRoute, routeName,
} from '../downloadRoute'

const PW = 'super-secret-proxy-password'

describe('the free rung asks for nothing', () => {
  it('adds no proxy args at all', () => {
    expect(downloadArgsFor({ kind: 'local_impersonated' }, PW)).toEqual([])
  })
  it('does not even need a password', () => {
    expect(downloadArgsFor({ kind: 'local_impersonated' }, '')).toEqual([])
  })
})

describe('the paid rung', () => {
  const route = { kind: 'residential_proxy' as const, sessionId: 'twin_abc123def456' }

  it('builds --proxy with the RESIDENTIAL group and a sticky session', () => {
    const args = downloadArgsFor(route, PW)
    expect(args[0]).toBe('--proxy')
    expect(args[1]).toContain('groups-RESIDENTIAL,session-twin_abc123def456')
    expect(args[1]).toContain('@proxy.apify.com:8000')
  })

  it('adds NO country targeting — the experiment changes one variable', () => {
    expect(downloadArgsFor(route, PW)[1]).not.toMatch(/country/i)
  })

  it('REFUSES rather than silently running the free route', () => {
    for (const missing of ['', '   ']) {
      expect(() => downloadArgsFor(route, missing)).toThrow(/APIFY_PROXY_PASSWORD/)
    }
  })
})

describe('credentials never reach a log', () => {
  it('redacts the user and password from a proxy URL', () => {
    const url = downloadArgsFor({ kind: 'residential_proxy', sessionId: 'twin_abc123' }, PW)[1]
    const safe = redactProxy(url)
    expect(safe).not.toContain(PW)
    expect(safe).not.toContain('groups-RESIDENTIAL')
    expect(safe).toContain('//***:***@proxy.apify.com:8000')
  })

  it('the session id itself carries no secret and no URL', () => {
    const sid = stickySessionId('https://www.tiktok.com/@someone/video/123')
    expect(sid).not.toContain('tiktok')
    expect(sid).not.toContain('someone')
    expect(sid).toMatch(/^twin_[0-9a-f]{12}$/)
  })
})

describe('sticky sessions', () => {
  it('are stable for one seed and different across seeds', () => {
    expect(stickySessionId('a')).toBe(stickySessionId('a'))
    expect(stickySessionId('a')).not.toBe(stickySessionId('b'))
  })
  it('are bounded and URL-safe', () => {
    const sid = stickySessionId('x'.repeat(5000))
    expect(sid.length).toBeLessThanOrEqual(20)
    expect(sid).toMatch(/^[A-Za-z0-9_]+$/)
  })
})

describe('an unreadable route never costs money', () => {
  it('defaults to the free rung', () => {
    for (const bad of [undefined, null, {}, 'residential_proxy', 42, { kind: 'nonsense' }]) {
      expect(routeName(parseRoute(bad)), JSON.stringify(bad)).toBe('local_impersonated')
    }
  })
  it('refuses a residential route with a bogus session id rather than inventing one', () => {
    for (const sid of [undefined, '', 'twin_NOTHEX', 'session-1', `twin_${'f'.repeat(64)}`]) {
      expect(() => parseRoute({ kind: 'residential_proxy', sessionId: sid })).toThrow(/sessionId/)
    }
  })
  it('accepts a well-formed residential route', () => {
    expect(parseRoute({ kind: 'residential_proxy', sessionId: 'twin_0123456789ab' }))
      .toEqual({ kind: 'residential_proxy', sessionId: 'twin_0123456789ab' })
  })
})
