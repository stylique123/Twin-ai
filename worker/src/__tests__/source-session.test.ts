import { afterEach, describe, expect, it, vi } from 'vitest'

process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'

import { createHash } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PermanentJobError } from '../errors.js'
import type { AssetRow } from '../jobs/editorInspect.js'

const { VerifiedSourceSession } = await import('../jobs/sourceSession.js')

const BYTES = Buffer.from('phase-6 source bytes')
const SHA = createHash('sha256').update(BYTES).digest('hex')

const asset = (over: Partial<AssetRow> = {}): AssetRow & { content_sha256: string } => ({
  id: 'a1', owner_id: 'o1', generation_id: 'g1', bucket: 'takes', storage_path: 'o1/g1/a1.mp4',
  status: 'ready', kind: 'source', content_sha256: SHA, duration_ms: 1000, width: 1080, height: 1920,
  rotation: 0, has_audio: true, validation_version: 1, metadata: {},
  ...over,
} as AssetRow & { content_sha256: string })

interface FetchLog { method: string; url: string }

function stubFetch(opts: { etag?: string; size?: number; body?: Buffer; headOk?: boolean } = {}): FetchLog[] {
  const log: FetchLog[] = []
  const body = opts.body ?? BYTES
  vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    log.push({ method, url: String(url) })
    if (method === 'HEAD') {
      if (opts.headOk === false) return new Response(null, { status: 404 })
      return new Response(null, {
        status: 200,
        headers: { 'content-length': String(opts.size ?? body.length), etag: opts.etag ?? '"tag-1"' },
      })
    }
    return new Response(new Uint8Array(body), { status: 200, headers: { 'content-length': String(body.length) } })
  })
  return log
}

afterEach(() => vi.unstubAllGlobals())

const newDir = () => mkdtempSync(join(tmpdir(), 'phase6-session-'))

describe('VerifiedSourceSession', () => {
  it('localPath downloads AT MOST ONCE per attempt, sha-verified (memoized)', async () => {
    const log = stubFetch()
    const s = new VerifiedSourceSession(asset(), {}, newDir())
    const p1 = await s.localPath()
    const p2 = await s.localPath()
    expect(p1).toBe(p2)
    expect(log.filter((l) => l.method === 'GET')).toHaveLength(1)
    expect(s.downloadsPerformed).toBe(1)
    expect(s.metrics.hashVerifications).toBe(1)
  })

  it('concurrent callers share the single download', async () => {
    const log = stubFetch()
    const s = new VerifiedSourceSession(asset(), {}, newDir())
    const [p1, p2] = await Promise.all([s.localPath(), s.localPath()])
    expect(p1).toBe(p2)
    expect(log.filter((l) => l.method === 'GET')).toHaveLength(1)
  })

  it('a byte mismatch is the PERMANENT source_bytes_changed', async () => {
    stubFetch({ body: Buffer.from('tampered bytes') })
    const s = new VerifiedSourceSession(asset(), {}, newDir())
    let err: unknown
    try { await s.localPath() } catch (e) { err = e }
    expect(err).toBeInstanceOf(PermanentJobError)
    expect((err as PermanentJobError).code).toBe('source_bytes_changed')
  })

  it('reconcileRemote: etag drift => source_bytes_changed; size drift => source_bytes_changed; missing => object_missing', async () => {
    stubFetch({ etag: '"tag-2"' })
    const meta = { finalized_etag: '"tag-1"', finalized_bytes: BYTES.length }
    let err: unknown
    try { await new VerifiedSourceSession(asset(), meta, newDir()).reconcileRemote('t') } catch (e) { err = e }
    expect((err as PermanentJobError).code).toBe('source_bytes_changed')

    vi.unstubAllGlobals()
    stubFetch({ etag: '"tag-1"', size: BYTES.length + 5 })
    err = undefined
    try { await new VerifiedSourceSession(asset(), meta, newDir()).reconcileRemote('t') } catch (e) { err = e }
    expect((err as PermanentJobError).code).toBe('source_bytes_changed')

    vi.unstubAllGlobals()
    stubFetch({ headOk: false })
    err = undefined
    try { await new VerifiedSourceSession(asset(), meta, newDir()).reconcileRemote('t') } catch (e) { err = e }
    expect((err as PermanentJobError).code).toBe('object_missing')
  })

  it('reconcileRemote passes on a matching finalize reference and counts headChecks', async () => {
    stubFetch({ etag: '"tag-1"' })
    const s = new VerifiedSourceSession(asset(), { finalized_etag: '"tag-1"', finalized_bytes: BYTES.length }, newDir())
    const r1 = await s.reconcileRemote('t')
    await s.reconcileRemote('t')
    expect(r1.etag).toBe('"tag-1"')
    expect(s.metrics.headChecks).toBe(2)
    expect(s.downloadsPerformed).toBe(0) // reconciliation never downloads
  })

  it('dispose(): byte access afterwards is a programming error; dispose is idempotent', async () => {
    stubFetch()
    const s = new VerifiedSourceSession(asset(), {}, newDir())
    s.dispose()
    s.dispose() // idempotent
    expect(() => s.localPath()).toThrow(/after dispose/)
    await expect(s.reconcileRemote('t')).rejects.toThrow(/after dispose/)
  })
})
