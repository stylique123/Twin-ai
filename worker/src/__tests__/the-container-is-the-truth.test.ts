// A DECLARED DEPENDENCY IS NOT AN INSTALLED ONE.
//
// ⚠️ `curl-cffi` IS PINNED IN requirements.txt WITH A PARAGRAPH EXPLAINING WHY.
// Every TikTok download in a forced re-run of 40 videos still printed "no
// impersonate target is available", and 38 of those 40 failed. The repository
// was correct and the container was not, and nothing in this codebase could
// tell the two apart.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { probeDownloader, readTargets } from '../downloaderProbe'

const HERE = dirname(fileURLToPath(import.meta.url))
const INDEX = readFileSync(join(HERE, '..', 'index.ts'), 'utf8')
const REQS = readFileSync(join(HERE, '..', '..', 'requirements.txt'), 'utf8')

describe('the probe asks the binary, not the repository', () => {
  it('runs and answers, whatever this machine happens to have', async () => {
    // ⚖️ NO ASSERTION ON THE RESULT ITSELF. This test box is not the worker
    // image, so pinning "targets > 0" here would be testing the CI runner and
    // calling it production. What matters is that the question gets ASKED and
    // an answer comes back rather than an exception.
    const probe = await probeDownloader()
    expect(typeof probe.ytDlp).toBe('boolean')
    expect(typeof probe.impersonateTargets).toBe('number')
    expect(probe.tiktokReadable).toBe(probe.impersonateTargets > 0)
    expect(probe.detail.length).toBeGreaterThan(10)
  })

  it('never throws, because a probe that crashes the boot is worse than the gap', async () => {
    await expect(probeDownloader()).resolves.toBeDefined()
  })

  it('and says what to do when there are none', async () => {
    // ⚠️ TWO CAUSES, TWO MESSAGES — AND THIS TEST CONFLATED THEM ON ITS FIRST
    // RUN. `tiktokReadable` is false both when yt-dlp is ABSENT (this CI runner)
    // and when yt-dlp is present with ZERO targets (the worker image). Only the
    // second is a curl-cffi problem, and asserting curl-cffi for both is the
    // same defect this whole session has been removing: one message for two
    // causes that need opposite responses.
    const probe = await probeDownloader()
    if (probe.ytDlp && !probe.tiktokReadable) {
      // THE IMAGE CASE. The message names the dependency and the file, because
      // "impersonation unavailable" sends somebody reading source.
      expect(probe.detail).toMatch(/curl-cffi/)
      expect(probe.detail).toMatch(/TikTok/)
    }
    if (!probe.ytDlp) {
      // THE ABSENT CASE. Naming curl-cffi here would send an operator to fix a
      // dependency of a binary that is not installed.
      expect(probe.detail).toMatch(/yt-dlp could not be run/)
      expect(probe.detail).not.toMatch(/curl-cffi/)
    }
  })
})

describe('it runs at boot, beside the capability report', () => {
  it('is called from main', () => {
    expect(INDEX).toMatch(/probeDownloader\(\)/)
  })

  it('warns rather than refusing', () => {
    // ⚖️ A WORKER WITH NO IMPERSONATION STILL transcribes, renders, and reads
    // Instagram and YouTube. Crashing on boot would turn a degraded TikTok path
    // into a total outage — the reasoning `capabilities.ts` already makes for a
    // missing API key.
    expect(INDEX).toMatch(/probe\.tiktokReadable \? 'info' : 'warn'/)
    const call = INDEX.slice(INDEX.indexOf('probeDownloader().then'))
    expect(call.slice(0, 700)).not.toMatch(/process\.exit|throw /)
  })
})

describe('the dependency the probe exists to check is still declared', () => {
  it('curl-cffi is in requirements.txt', () => {
    // ⚠️ IF THIS EVER FAILS, THE PROBE'S "not effective in this image" MESSAGE
    // BECOMES WRONG — it would be absent by intent rather than broken by
    // accident, and it would send an operator hunting the wrong problem.
    expect(REQS).toMatch(/^curl-cffi/m)
  })
})

// ── THE PROBE HAD THE BUG IT WAS WRITTEN TO CATCH ────────────────────────────
//
// ⚠️ `--list-impersonate-targets` LISTS WHAT yt-dlp KNOWS ABOUT, NOT WHAT IT CAN
// USE. Captured verbatim from a container with curl-cffi absent, every row is
// marked "(unavailable)" — and the original probe counted four of them and
// reported "4 impersonation targets available". It would have declared the
// TikTok path healthy during the exact re-run where 38 of 40 downloads printed
// "no impersonate target is available".
//
// ⚖️ WHICH IS WHY THE PARSER IS NOW A PURE FUNCTION. A parsing bug behind a
// `spawn` is only reachable on a box that reproduces it, so it survived being
// written by the same person who wrote the paragraph explaining the very
// distinction it missed. These fixtures make it reachable everywhere.
describe('readTargets counts what works, not what is listed', () => {
  const UNAVAILABLE = `[info] Available impersonate targets
Client    OS   Source
--------------------------------------------
Tor       -    curl_cffi>=0.11 (unavailable)
Edge      -    curl_cffi (unavailable)
Firefox   -    curl_cffi>=0.10 (unavailable)
Safari    -    curl_cffi (unavailable)
Chrome    -    curl_cffi (unavailable)
`

  const WORKING = `[info] Available impersonate targets
Client    OS       Source
--------------------------------------------
chrome    windows  curl_cffi
chrome    macos    curl_cffi
edge      windows  curl_cffi
safari    macos    curl_cffi
`

  it('counts ZERO usable when every listed target says (unavailable)', () => {
    // THE REGRESSION. The old parser returned 4 here.
    expect(readTargets(UNAVAILABLE)).toEqual({ usable: 0, listedButUnusable: 5 })
  })

  it('counts real targets when they are genuinely available', () => {
    expect(readTargets(WORKING).usable).toBe(4)
    expect(readTargets(WORKING).listedButUnusable).toBe(0)
  })

  it('distinguishes "listed but unusable" from "none listed at all"', () => {
    // ⚠️ TWO ZEROS, TWO CAUSES, TWO FIXES. All-unavailable is a missing
    // curl-cffi in the image; nothing listed is a yt-dlp that cannot impersonate
    // at all. An operator sent to the wrong one wastes the outage.
    expect(readTargets('[info] Available impersonate targets\nClient  OS  Source\n'))
      .toEqual({ usable: 0, listedButUnusable: 0 })
  })

  it('never counts the header or the separator rule as a target', () => {
    expect(readTargets(WORKING).usable + readTargets(WORKING).listedButUnusable).toBe(4)
  })

  it('is not confused by case, because the table has used both', () => {
    expect(readTargets('Chrome  -  curl_cffi\nchrome  -  curl_cffi\n').usable).toBe(2)
  })
})
