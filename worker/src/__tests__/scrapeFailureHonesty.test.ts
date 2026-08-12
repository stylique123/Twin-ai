// A SCRAPER THAT CANNOT REACH A PAGE DOES NOT KNOW WHY.
//
// ⚠️ THE DEFECT, EXACTLY. TikTok began requiring impersonation; this image
// installed no backend for it; yt-dlp printed its standard guess — "This user's
// account is either private or has embedding disabled" — and `scrape_dna`
// forwarded that guess to the creator as "If that account is private or empty,
// try a public account". Every affected creator was told their own account was
// the problem, while the cause was one missing dependency here.
//
// ⚖️ AND THE JOB STILL SAID `done`. The failure path deliberately keeps an
// existing voice, which is right — but it made a run that wrote no knowledge
// look identical to a healthy one. `creator_knowledge` sat at 0 rows in
// production alongside 27 voices, reported by nothing.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SCAN = readFileSync(join(REPO, 'worker/src/jobs/scrapeDna.ts'), 'utf8')
const REQS = readFileSync(join(REPO, 'worker/requirements.txt'), 'utf8')
const code = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('#')).join('\n')

describe('the scrape does not blame the creator for our own failure', () => {
  it('an unreadable page never asserts the account is private', () => {
    // The read-failure branch may not repeat yt-dlp's guess. The EMPTY branch
    // still may — there the scrape succeeded and returned nothing, which
    // genuinely can mean private or empty.
    // ⚠️ THE MARKER MUST SURVIVE COMMENT-STRIPPING. A first version bounded the
    // block with a COMMENT line, which `code()` had already removed — indexOf
    // returned -1 and the slice silently covered the wrong text.
    const body = code(SCAN)
    const msg = body.slice(body.indexOf('const detail = err instanceof Error'), body.indexOf('if (!posts.length)'))
    expect(msg).not.toMatch(/private or empty/)
    expect(msg).toMatch(/usually on our side/)
  })

  it('names the impersonation cause when yt-dlp shows it', () => {
    // "Our tooling cannot read this site" and every other cause need opposite
    // responses and looked identical in the logs.
    expect(SCAN).toMatch(/likely_cause: impersonation \? 'yt_dlp_impersonation_unavailable' : 'unknown'/)
  })

  it('an empty scrape is countable, not merely refused', () => {
    // A refusal has to be countable or it is silence with good manners.
    expect(SCAN).toMatch(/event: 'scrape_dna_empty'/)
    expect(SCAN).toMatch(/event: 'scrape_dna_read_failed'/)
  })

  it('the image installs an impersonation backend', () => {
    // ⚠️ THE FIX ITSELF. Without this, TikTok extraction fails on every scan
    // however good the rest of the pipeline is — and moving TikTok to a paid
    // Apify actor would have bought, per scan forever, what one dependency
    // provides once.
    expect(REQS).toMatch(/^curl-cffi>=/m)
  })
})

// ── AN UNSUPPORTED PLATFORM REFUSES RATHER THAN GUESSING ────────────────────
describe('a platform we cannot read is refused, not redirected', () => {
  const MEDIA = readFileSync(join(REPO, 'worker/src/media.ts'), 'utf8')

  it('scrapeProfile has no fallback scraper', () => {
    // ⚠️ THE HAZARD THIS CLOSES. Instagram fell through to the TikTok scraper,
    // so an IG creator's scan asked tiktok.com for their handle. Handles are not
    // unique across platforms: the worst case was never "reads nothing", it was
    // "reads a DIFFERENT PERSON" and synthesises a voice from a stranger's
    // videos with no error anywhere. 14 of 27 production voices are Instagram.
    const fn = code(MEDIA).slice(code(MEDIA).indexOf('export async function scrapeProfile'))
    const body = fn.slice(0, fn.indexOf('function buildPosts'))
    // The last statement must be a refusal, not a scraper call.
    expect(body).toMatch(/throw new UnsupportedPlatformError\(p\)\s*\n\}/)
    // And no unguarded tail call to the TikTok scraper.
    const afterTikTok = body.slice(body.lastIndexOf('tiktokProfileViaApify'))
    expect(afterTikTok).not.toMatch(/return await scrapeTikTokProfile/)
  })

  it('the refusal is typed, so callers can tell it from a transient failure', () => {
    // "We do not support this" and "we tried and failed" need opposite messages
    // and opposite fixes; a string match on an error message would not survive
    // a rewording.
    expect(MEDIA).toMatch(/export class UnsupportedPlatformError extends Error/)
    expect(SCAN).toMatch(/err instanceof UnsupportedPlatformError/)
  })

  it('the creator is told the truth, not asked to retry forever', () => {
    expect(SCAN).toMatch(/We can't scan \$\{platform\} accounts yet/)
    expect(SCAN).toMatch(/event: 'scrape_dna_unsupported_platform'/)
  })
})
