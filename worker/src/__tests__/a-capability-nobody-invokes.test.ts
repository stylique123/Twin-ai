// THE IMAGE HAD 37 IMPERSONATION TARGETS AND ASKED FOR NONE OF THEM.
//
// ⚠️ THIS IS THE CURL-CFFI BUG ONE RUNG FURTHER OUT. That one was: declared,
// installed, importable, and refused. This one is: available, probed, reported
// healthy — and never requested. `--list-impersonate-targets` printed 37,
// `worker_heartbeat.downloader` recorded `tiktok_readable: true`, and every
// actual TikTok download still went out as plain yt-dlp, because the download
// invocation never passed `--impersonate`. The probe was measuring a capability
// nothing used.
//
// ⚖️ SO THE TEST ASSERTS THE INVOCATION, NOT THE INVENTORY. A probe proving the
// target exists is exactly what we already had.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ⚠️ READ AS TEXT, NOT IMPORTED. `media.ts` pulls in `env.ts`, which throws on a
// missing SUPABASE_URL at module load — so importing it here would make this
// test a test of the environment.
const HERE = dirname(fileURLToPath(import.meta.url))
const MEDIA = readFileSync(join(HERE, '..', 'media.ts'), 'utf8')
const ASSESS = readFileSync(join(HERE, '..', 'jobs', 'assessReference.ts'), 'utf8')

describe('the TikTok download actually asks for impersonation', () => {
  it('passes --impersonate on the real yt-dlp audio download', () => {
    const call = MEDIA.slice(MEDIA.indexOf("'-f', 'bestaudio/best'"))
    const args = call.slice(0, call.indexOf('120_000'))
    expect(args).toContain("'--impersonate', IMPERSONATE_TARGET")
  })

  it('asks for a family, not a pinned version', () => {
    // ⚖️ Pinning one target would break the day it moves — which is exactly how
    // the unbounded curl-cffi floor broke us, in the other direction.
    const m = MEDIA.match(/export const IMPERSONATE_TARGET = '([^']+)'/)
    expect(m?.[1]).toBe('chrome')
    expect(m?.[1]).not.toMatch(/\d/)
  })
})

describe('which rung read it is recorded, not inferred', () => {
  it('names all three rungs of the ladder, cheapest first', () => {
    const block = MEDIA.slice(MEDIA.indexOf('export const DOWNLOAD_ROUTES'))
    const rungs = (block.slice(0, block.indexOf('] as const')).match(/'([a-z_]+)',/g) ?? [])
      .map((x) => x.slice(1, -2))
    expect(rungs).toEqual(['local_impersonated', 'residential_proxy', 'apify_actor'])
  })

  it('stamps the free rung when the local download succeeds', () => {
    expect(MEDIA).toMatch(/downloadRoute: 'local_impersonated'/)
  })

  it('persists the route on BOTH the success and the no-speech paths', () => {
    // ⚠️ A silent video still cost whatever its download cost. Omitting the
    // route on no_speech rows would under-count paid routing by an 85-row bucket.
    const stamps = ASSESS.match(/download_route: transcript\.downloadRoute \?\? null/g) ?? []
    expect(stamps).toHaveLength(2)
  })
})

describe('a failure stops looking like a partial success', () => {
  it('clears the transcript columns when the download throws', () => {
    // ⚠️ THIS COST A WRONG CONCLUSION OUT LOUD. An upsert writes only the columns
    // it names, so a failure left the PREVIOUS run's transcript_chars standing
    // beside a fresh error — and three recovered rows were read as "transcripts
    // landed" when nothing had been downloaded at all.
    const branch = ASSESS.slice(ASSESS.indexOf('const why = e instanceof Error'))
    const upsert = branch.slice(0, branch.indexOf("{ onConflict: 'url' }"))
    expect(upsert).toContain('transcript_chars: null')
    expect(upsert).toContain('transcript_source: null')
    expect(upsert).toContain('download_route: null')
  })
})
