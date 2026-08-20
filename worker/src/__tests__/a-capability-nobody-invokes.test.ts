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

  it('stamps the route that ACTUALLY ran, not a hard-coded one', () => {
    // ⚠️ THIS ASSERTION CHANGED WITH THE LADDER. It used to pin the literal
    // 'local_impersonated', which was right when there was one rung. Now that a
    // paid rung exists, a hard-coded stamp would be the worst possible bug: every
    // row would claim the free route however it was actually fetched, and the
    // economics question ("what fraction needs paid routing?") would read 100%
    // local forever.
    expect(MEDIA).toMatch(/downloadRoute: routeName\(route\)/)
    expect(MEDIA).not.toMatch(/downloadRoute: '[a-z_]+'/)
  })

  it('defaults the route to the free rung when a caller supplies none', () => {
    expect(MEDIA).toMatch(/route: DownloadRoute = \{ kind: 'local_impersonated' \}/)
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

// A FLOOR PLUS A CACHED LAYER IS AN ACCIDENTAL PIN.
//
// ⚠️ 2026-08-20: THE RUNNING WORKER WAS ON yt-dlp 2026.07.04 WHILE 2026.08.19
// HAD BEEN OUT FOR HOURS. requirements.txt said `yt-dlp>=2025.1.15` — a floor,
// which reads like "always newest" — but Docker keys the pip layer on that
// file's contents, so pip only re-resolves when the file changes. Between edits
// the image is frozen at whatever was newest on the last edit. Finding this out
// required reading a Docker build log for the word CACHED.
//
// ⚖️ SO THE RUNNING WORKER MUST SAY WHAT IT IS. Same lesson as curl-cffi one
// rung further out: the declaration and the running image can disagree, and only
// the running image is the truth.
describe('the probe reports what is actually installed', () => {
  const PROBE = readFileSync(join(HERE, '..', 'downloaderProbe.ts'), 'utf8')
  const INDEX = readFileSync(join(HERE, '..', 'index.ts'), 'utf8')

  it('reads both versions from the binaries, not from requirements.txt', () => {
    expect(PROBE).toMatch(/yt-dlp', \['--version'\]/)
    expect(PROBE).toMatch(/import curl_cffi;print\(curl_cffi\.__version__\)/)
  })

  it('writes them to the heartbeat ROW, not only the log line', () => {
    // ⚠️ The row is the one everybody can read — nobody has a shell on that box.
    const write = INDEX.slice(INDEX.indexOf('recordDownloaderCapability'))
    expect(write).toMatch(/yt_dlp_version: probe\.ytDlpVersion/)
    expect(write).toMatch(/curl_cffi_version: probe\.curlCffiVersion/)
  })

  it('treats a missing version as null rather than failing the probe', () => {
    // ⚖️ Diagnostics must not be able to take a worker down. A probe that
    // refused to boot because it could not read a version string would be worse
    // than the ambiguity it was written to remove.
    expect(PROBE).toMatch(/catch \{ return null \}/)
  })

  it('requires a yt-dlp floor new enough to carry the blockbuster headers', () => {
    // ⚠️ 2026.08.19 adds `_generate_blockbuster_headers()` on the TikTok webpage
    // request — the exact call that failed on all six canaries. Dropping below
    // it silently reinstates the failure.
    const REQ = readFileSync(join(HERE, '..', '..', 'requirements.txt'), 'utf8')
    const m = REQ.match(/^yt-dlp>=(\d{4})\.(\d{1,2})\.(\d{1,2})/m)
    expect(m, 'yt-dlp floor not found').toBeTruthy()
    const [y, mo, d] = [Number(m![1]), Number(m![2]), Number(m![3])]
    expect(Date.UTC(y, mo - 1, d)).toBeGreaterThanOrEqual(Date.UTC(2026, 7, 19))
  })
})
