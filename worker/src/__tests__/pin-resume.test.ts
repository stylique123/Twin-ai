import { describe, expect, it } from 'vitest'

process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
process.env.GEMINI_API_KEY ||= 'stub'

const { assertPinnedWorkerIdentity } = await import('../jobs/editorV2.js')
const { PermanentJobError } = await import('../errors.js')

// §3.2 resume semantics: the stored pin is the frozen truth. Worker-identity
// divergence fails closed; user-mutable divergence (brand) never enters the check.
const base = () => ({
  schemaVersion: 1, manifestEpoch: 2,
  componentVersions: { inspection: 'inspect-1', speech: 'speech-6', visual: 'visual-2', audio: 'audio-1', hook: 'hook-1' },
  componentDigests: { visual: 'a'.repeat(64), audio: 'b'.repeat(64), hook: 'c'.repeat(64) },
  modelArtifacts: { speech: { artifactSha256: 'd'.repeat(64) }, faceDetector: { artifactSha256: 'e'.repeat(64) } },
  build: { workerCommit: 'f'.repeat(40), dockerfileSha256: '1'.repeat(64), dependencyLockSha256: '2'.repeat(64) },
  rules: { rulesVersion: 'analysis-rules-1', boundsSha256: '3'.repeat(64) },
  ffmpeg: { versionBannerSha256: '4'.repeat(64) },
  captureManifestSha: '5'.repeat(64),
  features: { autoFillerRemoval: false },
  brandSnapshot: { schemaVersion: 3, visual: { colorsSource: 'auto', primaryHex: '#112233' } },
  brandSnapshotSha: '6'.repeat(64),
})

describe('pin resume: assertPinnedWorkerIdentity', () => {
  it('identical worker identity passes even when BRAND diverged (frozen truth wins)', () => {
    const stored = base()
    const local = { ...base(), brandSnapshot: { schemaVersion: 3, visual: { colorsSource: 'none', primaryHex: null } }, brandSnapshotSha: '7'.repeat(64) }
    expect(() => assertPinnedWorkerIdentity(stored, local)).not.toThrow()
  })

  it('a different worker build fails closed as manifest_mismatch (versions never mixed)', () => {
    const stored = base()
    const local = { ...base(), build: { ...base().build, workerCommit: '0'.repeat(40) } }
    let err: unknown
    try { assertPinnedWorkerIdentity(stored, local) } catch (e) { err = e }
    expect(err).toBeInstanceOf(PermanentJobError)
    expect((err as PermanentJobError).code).toBe('manifest_mismatch')
  })

  it('a different component digest fails closed', () => {
    const local = { ...base(), componentDigests: { ...base().componentDigests, visual: '9'.repeat(64) } }
    expect(() => assertPinnedWorkerIdentity(base(), local)).toThrow(/componentDigests/)
  })

  it('a TRANSIENT null ffmpeg banner on resume does NOT fail a matching build', () => {
    const local = { ...base(), ffmpeg: { versionBannerSha256: null } }
    expect(() => assertPinnedWorkerIdentity(base(), local)).not.toThrow()
  })

  it('a RESOLVED but different ffmpeg banner still fails closed', () => {
    const local = { ...base(), ffmpeg: { versionBannerSha256: '8'.repeat(64) } }
    expect(() => assertPinnedWorkerIdentity(base(), local)).toThrow(/ffmpeg/)
  })

  it('captureManifestSha divergence fails closed (immutable input — divergence means corruption)', () => {
    const local = { ...base(), captureManifestSha: '9'.repeat(64) }
    expect(() => assertPinnedWorkerIdentity(base(), local)).toThrow(/captureManifestSha/)
  })
})
