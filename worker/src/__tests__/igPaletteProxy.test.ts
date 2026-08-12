// THE INSTAGRAM PALETTE COMES BACK EMPTY WITHOUT THIS, AND NOTHING SAYS SO.
//
// ⚠️ THE DEFECT, AND WHY IT IS BEING PORTED RATHER THAN DISCOVERED AGAIN.
// Instagram and Facebook image CDNs SIGN their thumbnail URLs to the IP that
// scraped them. The worker scrapes Instagram through Apify, so the URLs are
// signed to Apify's egress and a direct fetch from the worker's datacenter IP
// gets a 403. Every cover is skipped, `fetchInlineImages` returns `[]`, and the
// synthesis silently falls back to caption-only palette inference — a
// regression with no error line anywhere.
//
// `dna-poll` already hit this and fixed it with a residential-proxy retry. This
// test exists so that routing Instagram to the worker cannot land without the
// same fix, and so a later "simplification" that drops the retry fails loudly.
//
// ⚖️ SCOPE. This pins the ROUTING RULE — direct first, proxy only for the CDNs
// that need it, and never let one bad thumbnail break a build. It does not
// assert that Apify's proxy works; that is their service, not our contract.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = readFileSync(join(HERE, '..', 'jobs', 'scrapeDna.ts'), 'utf8')

describe('the worker retries IG thumbnails through the residential proxy', () => {
  it('recognises the three Meta CDN hosts that sign to an IP', () => {
    const m = SRC.match(/const IG_CDN = (\/.+\/i)/)
    expect(m).not.toBeNull()
    // Rebuilt from the shipped source rather than retyped — a copy here could
    // drift from the one that runs, which is the whole failure mode.
    const re = new RegExp(m![1].slice(1, -2), 'i')
    for (const host of [
      'https://scontent-lhr8-1.cdninstagram.com/v/t51/abc.jpg',
      'https://video.fbcdn.net/v/t42/xyz.jpg',
      'https://scontent.xx.fbcdn.net/v/t51/1.jpg',
    ]) expect(re.test(host)).toBe(true)
    // Must NOT divert non-Meta CDNs through a paid residential proxy.
    for (const host of [
      'https://i.ytimg.com/vi/abc/hqdefault.jpg',
      'https://p16-sign.tiktokcdn-us.com/obj/abc',
    ]) expect(re.test(host)).toBe(false)
  })

  it('tries the DIRECT fetch first, and only then the proxy', () => {
    // ⚖️ ORDER MATTERS FOR COST. The residential proxy is billed per GB, and
    // most covers are readable directly. Reaching for it first would pay on
    // every thumbnail to fix the minority that need it.
    const body = SRC.slice(SRC.indexOf('async function fetchInlineImages'))
    const direct = body.indexOf('await fetchOneImage(url)')
    const viaProxy = body.indexOf('fetchOneImage(url, proxy)')
    expect(direct).toBeGreaterThan(-1)
    expect(viaProxy).toBeGreaterThan(direct)
    // The retry is guarded by BOTH "the direct attempt failed" and "this is a
    // Meta CDN" — dropping either turns a targeted retry into a blanket one.
    expect(body).toMatch(/if \(!img && proxy && IG_CDN\.test\(url\)\)/)
  })

  it('treats a missing proxy password as "no proxy", never as a failure', () => {
    // ⚠️ UNCONFIGURED IS NOT BROKEN. An account without the proxy password must
    // still build DNA — with a caption-only palette — rather than failing scans.
    expect(SRC).toMatch(/if \(!env\.apifyProxyPassword\) return null/)
  })

  it('never lets one unreadable thumbnail fail the whole build', () => {
    const one = SRC.slice(SRC.indexOf('async function fetchOneImage'))
    expect(one.slice(0, one.indexOf('\n}\n'))).toMatch(/catch \{[\s\S]*return null/)
  })

  it('closes the proxy agent, because the worker is long-lived', () => {
    // ⚠️ THE EDGE COULD SKIP THIS AND THE WORKER CANNOT. `dna-poll` is a
    // per-request runtime that is torn down anyway; this process runs for days
    // and claims job after job, so an agent left open per job leaks sockets
    // until the container dies.
    expect(SRC).toMatch(/finally \{[\s\S]*proxy\?\.close\(\)/)
  })

  it('skips a body too large to be a thumbnail', () => {
    expect(SRC).toMatch(/buf\.byteLength > 3_000_000/)
  })
})
