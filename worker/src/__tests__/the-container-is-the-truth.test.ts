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
import { probeDownloader } from '../downloaderProbe'

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
