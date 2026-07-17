// Editor v2 Phase 1 — source-asset contract tests.
import { describe, it, expect } from 'vitest'
import { UploadOnce } from '../api.js'
import { sourceAssetPath, SOURCE_MIN_BYTES, SOURCE_MAX_BYTES } from '../contracts.js'

describe('UploadOnce — autosave/confirm/navigation share ONE upload', () => {
  it('concurrent callers get the same promise; the operation runs once', async () => {
    const once = new UploadOnce<string>()
    let runs = 0
    const start = () => new Promise<string>((r) => { runs++; setTimeout(() => r('path-a'), 5) })
    const [a, b, c] = await Promise.all([once.run(start), once.run(start), once.run(start)])
    expect(runs).toBe(1)
    expect(a).toBe('path-a')
    expect(b).toBe('path-a')
    expect(c).toBe('path-a')
  })

  it('success is sticky — a later caller reuses the result, no second object', async () => {
    const once = new UploadOnce<string>()
    let runs = 0
    await once.run(async () => { runs++; return 'path-a' })
    const again = await once.run(async () => { runs++; return 'path-b' })
    expect(runs).toBe(1)
    expect(again).toBe('path-a')
  })

  it('a FAILED attempt clears the slot so retry can run (and reuses one op again)', async () => {
    const once = new UploadOnce<string>()
    let runs = 0
    await expect(once.run(async () => { runs++; throw new Error('net down') })).rejects.toThrow('net down')
    const ok = await once.run(async () => { runs++; return 'path-a' })
    expect(runs).toBe(2)
    expect(ok).toBe('path-a')
  })

  it('reset() starts a NEW operation (a re-recorded take is a new asset)', async () => {
    const once = new UploadOnce<string>()
    let runs = 0
    await once.run(async () => { runs++; return 'take-1' })
    once.reset()
    const second = await once.run(async () => { runs++; return 'take-2' })
    expect(runs).toBe(2)
    expect(second).toBe('take-2')
  })
})

describe('source asset path + bounds', () => {
  it('is stable and owner-prefixed (takes-bucket INSERT policy requires it)', () => {
    const p = sourceAssetPath('owner-1', 'gen-2', 'asset-3', 'video/webm')
    expect(p).toBe('owner-1/gen-2/asset-3.webm')
    // Same inputs → same path: retries re-upload the SAME object, never a
    // timestamped duplicate.
    expect(sourceAssetPath('owner-1', 'gen-2', 'asset-3', 'video/webm')).toBe(p)
    expect(sourceAssetPath('owner-1', 'gen-2', 'asset-3', 'video/mp4')).toBe('owner-1/gen-2/asset-3.mp4')
  })

  it('bounds are sane', () => {
    expect(SOURCE_MIN_BYTES).toBeGreaterThan(0)
    expect(SOURCE_MAX_BYTES).toBe(600 * 1024 * 1024)
  })
})
