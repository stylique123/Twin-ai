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
