// WHICH PLATFORMS THE WORKER OWNS — pinned against the edge source that ships.
//
// ⚠️ THE DEFECT BEING CLOSED. `build_dna` is advanced ONLY by a polling browser
// tab. Close it, lose the connection, or hit the 60/min poll cap and the voice
// sits in `building` until a reaper marks it failed 600s later — the infinite
// spinner `0018_dna_reaper.sql` names in its own header. The worker's
// `scrape_dna` finishes whether or not anyone is watching, AND does strictly
// more: packaging metrics, wrong-account detection, caption knowledge, and it
// enqueues the `build_voice` upgrade itself.
//
// ⚖️ YOUTUBE MOVES FIRST, INSTAGRAM DELIBERATELY LATER. YouTube is 9 of 27
// production voices, currently succeeding 9/9, and its thumbnails are not signed
// to the scraping IP the way Meta's are — so it exercises the new route without
// also leaning on the residential-proxy retry Instagram depends on.
//
// This reads the SHIPPED edge source rather than re-implementing the rule: a
// paraphrase here would pass while production did something else, which is the
// failure `blueprintSubstanceParity` exists to prevent one level up.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/start-dna/index.ts'), 'utf8')

/** Rebuild the routing decision FROM the shipped default, so this test cannot
 *  drift from the string that actually runs. */
function defaultPlatforms(): Set<string> {
  const m = EDGE.match(/Deno\.env\.get\('WORKER_DNA_PLATFORMS'\) \?\? '([^']*)'/)
  expect(m).not.toBeNull()
  return new Set(m![1].split(',').map((p) => p.trim().toLowerCase()).filter(Boolean))
}

describe('start-dna sends the right platforms to the worker', () => {
  it('routes tiktok and youtube to the worker by default', () => {
    const p = defaultPlatforms()
    expect(p.has('tiktok')).toBe(true)
    expect(p.has('youtube')).toBe(true)
  })

  it('does NOT route instagram yet — that is a separate, deliberate flip', () => {
    // ⚠️ IF THIS EVER FAILS, CHECK THE PROXY RETRY FIRST. Instagram cover URLs are
    // signed to the IP that scraped them, so the worker needs the residential
    // proxy port (#352) to avoid silently losing every IG brand palette. Adding
    // 'instagram' here is safe only once that has been exercised in production.
    expect(defaultPlatforms().has('instagram')).toBe(false)
  })

  it('decides by MEMBERSHIP, not by a hardcoded platform name', () => {
    // The old code was `if (platform === 'tiktok')`. A second hardcoded compare
    // would be a second place to forget when the next platform moves.
    expect(EDGE).toMatch(/if \(workerPlatforms\.has\(platform\)\)/)
    expect(EDGE).not.toMatch(/if \(platform === 'tiktok'\) \{/)
  })

  it('an EMPTY or malformed override falls back to the default, never to nothing', () => {
    // ⚠️ THE QUIET FAILURE. An empty list would send every platform down the
    // browser path and look exactly like "the flip did not work" — no error, no
    // log, just the old behaviour back. `?? default` covers unset; the filter
    // drops blanks so `WORKER_DNA_PLATFORMS=,,` cannot yield an empty set by
    // accident. A deliberate revert is `WORKER_DNA_PLATFORMS=tiktok`.
    expect(EDGE).toMatch(/\?\? 'tiktok,youtube'/)
    expect(EDGE).toMatch(/\.filter\(Boolean\)/)
  })

  it('the worker job is QUEUED so something can claim it', () => {
    // ⚠️ `build_dna` is inserted as `running`, which is why nothing claims it —
    // it was never meant for the queue. A worker job inserted as `running` would
    // be invisible to `claim_job` until the visibility timeout expired.
    const seam = EDGE.slice(EDGE.indexOf('if (workerPlatforms.has(platform))'))
    const job = seam.slice(0, seam.indexOf('.select('))
    expect(job).toMatch(/type: 'scrape_dna'/)
    expect(job).toMatch(/status: 'queued'/)
    expect(job).toMatch(/max_attempts: 3/)
  })
})
