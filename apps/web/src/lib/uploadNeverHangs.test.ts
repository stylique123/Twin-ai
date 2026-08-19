// A PROMISE THAT NEVER SETTLES IS WORSE THAN ONE THAT REJECTS.
//
// ⚠️ TWO REAL TAKES ARE STUCK IN PRODUCTION IN EXACTLY THIS STATE. 59.8MB and
// 123.7MB, status `uploading` since 2026-08-09, with NO object in storage. The
// only take that ever reached storage was 5.8MB — and it was then rejected by
// the WebM duration bug. Three attempts, three failures, zero accepted takes
// ever.
//
// ⚖️ THE MECHANISM. `uploadSignedWithProgress` handled `onload` and `onerror`
// only. XHR's default timeout is 0 (never), and a timeout or an abort fires
// NEITHER of those — so the promise hung. `finalizeSourceUpload` was never
// reached, the row stayed `uploading`, and `UploadOnce` clears its slot only in
// `.catch()`, so a promise that never rejects also permanently disables the
// retry button. The creator watched a dead progress bar with no way forward.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { uploadTimeoutMs } from './supabase'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = readFileSync(join(HERE, 'supabase.ts'), 'utf8')

describe('every terminal path settles the promise', () => {
  it('handles timeout and abort, not just load and error', () => {
    for (const h of ['xhr.onload', 'xhr.onerror', 'xhr.ontimeout', 'xhr.onabort']) {
      expect(SRC, h).toContain(h)
    }
  })

  it('sets an explicit timeout, because the XHR default is never', () => {
    expect(SRC).toMatch(/xhr\.timeout = uploadTimeoutMs\(blob\.size\)/)
  })

  it('rejects rather than resolving on timeout, so the fallback path can run', () => {
    // ⚖️ A rejection falls through to the supabase-js upload below AND lets
    // `UploadOnce` clear its slot. Resolving would report a success that never
    // happened and leave the asset stuck at `uploading` anyway.
    const t = SRC.slice(SRC.indexOf('xhr.ontimeout'))
    expect(t.slice(0, 120)).toMatch(/reject\(/)
    const a = SRC.slice(SRC.indexOf('xhr.onabort'))
    expect(a.slice(0, 120)).toMatch(/reject\(/)
  })
})

describe('the timeout scales with the file, because a fixed one is wrong at both ends', () => {
  it('gives a small take a short leash', () => {
    // ⚠️ The 5.8MB take that DID upload. It must not be able to hang for an hour.
    expect(uploadTimeoutMs(5_825_821)).toBeLessThan(5 * 60_000)
  })

  it('gives the two stuck takes real headroom rather than killing them early', () => {
    // 59.8MB and 123.7MB — generous enough that a slow connection finishes.
    expect(uploadTimeoutMs(59_789_260)).toBeGreaterThan(8 * 60_000)
    expect(uploadTimeoutMs(123_679_858)).toBeGreaterThan(15 * 60_000)
  })

  it('is monotonic — a bigger file never gets less time', () => {
    let prev = 0
    for (const mb of [0, 1, 5, 25, 60, 124, 200]) {
      const t = uploadTimeoutMs(mb * 1024 * 1024)
      expect(t).toBeGreaterThanOrEqual(prev)
      prev = t
    }
  })

  it('caps, so no single upload can hold the slot indefinitely', () => {
    expect(uploadTimeoutMs(10 * 1024 * 1024 * 1024)).toBe(30 * 60_000)
  })

  it('survives nonsense sizes rather than producing NaN', () => {
    // ⚠️ `xhr.timeout = NaN` is silently coerced to 0, which is "never" — the
    // exact bug this fixes, reintroduced through the back door.
    for (const bad of [NaN, -1, Infinity]) {
      const t = uploadTimeoutMs(bad as number)
      expect(Number.isFinite(t)).toBe(true)
      expect(t).toBeGreaterThan(0)
    }
  })
})
