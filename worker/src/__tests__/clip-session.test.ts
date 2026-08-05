// Fetching a composed clip: what it refuses, and what it verifies against.
//
// The one that matters is the LAST test. A clip is verified against the checksum
// THE PLAN pinned, not the one on the asset row — and those diverge exactly when
// a creator re-records a clip under the same label. If the row's checksum won,
// a render would composite footage the plan never described while the plan hash,
// the graph hash and the manifest all stayed correct. Nothing would look wrong.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const OWNER = '22222222-2222-2222-2222-222222222222'
const CLIP_ASSET = '11111111-2222-3333-4444-555555555555'

let assetRow: Record<string, unknown> | null
let assetError: { message: string } | null
let downloadedTo: string[]
let bytes: string

vi.mock('../db.js', () => ({
  db: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: assetRow, error: assetError }) }),
        }),
      }),
    }),
  },
}))
vi.mock('../storage.js', () => ({
  downloadObject: async (_b: string, _p: string, target: string) => {
    downloadedTo.push(target)
    writeFileSync(target, bytes)
  },
  headObject: async () => ({ etag: 'e', sizeBytes: 1 }),
}))

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

function planWith(sources: Array<Record<string, unknown>>): never | Record<string, unknown> {
  return { composition: { sources, overlays: [] } }
}

beforeEach(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
  bytes = 'the clip bytes'
  downloadedTo = []
  assetError = null
  assetRow = {
    id: CLIP_ASSET, owner_id: OWNER, kind: 'clip', bucket: 'takes',
    storage_path: `${OWNER}/g/clip.webm`, status: 'ready', content_sha256: sha(bytes),
  }
})

async function fetchWith(plan: Record<string, unknown>): Promise<string[]> {
  const { fetchComposedClips } = await import('../jobs/clipSession.js')
  const dir = mkdtempSync(join(tmpdir(), 'clip-session-'))
  return fetchComposedClips(plan as never, OWNER, dir)
}
async function codeOf(plan: Record<string, unknown>): Promise<string> {
  try { await fetchWith(plan) } catch (e) { return (e as { code?: string }).code ?? 'NO_CODE' }
  throw new Error('expected a throw, got none')
}

const source = (over: Record<string, unknown> = {}) => ({
  index: 0, origin: 'screen_capture', assetId: CLIP_ASSET,
  checksum: sha('the clip bytes'), durationMs: 9000, ...over,
})

describe('a plan that composes nothing touches nothing', () => {
  it('performs zero reads and returns no paths', async () => {
    // The ordinary render path must not gain a database round trip for a
    // feature it is not using.
    expect(await fetchWith(planWith([]))).toEqual([])
    expect(downloadedTo).toEqual([])
  })
})

describe('what a composed clip has to be', () => {
  it('fetches one verified path per composed source, in order', async () => {
    const paths = await fetchWith(planWith([source()]))
    expect(paths).toHaveLength(1)
    expect(paths[0]).toMatch(/clip-0-bytes$/)
  })

  it('refuses an asset that is not this owner\'s', async () => {
    // Owner scoping is re-proven from the row at execution time. A plan is
    // validated for shape; it is not evidence that the asset it names belongs
    // to this project, and an asset id is guessable in a way a checksum is not.
    assetRow = null
    expect(await codeOf(planWith([source()]))).toBe('object_missing')
  })

  it('refuses an asset that is not a clip', async () => {
    assetRow = { ...assetRow, kind: 'source' }
    expect(await codeOf(planWith([source()]))).toBe('render_graph_invalid')
  })

  it('refuses a clip that was never measured', async () => {
    // Not-ready is not a reason to wait: it means the plan's duration for this
    // clip came from somewhere other than a measurement.
    assetRow = { ...assetRow, status: 'validating' }
    expect(await codeOf(planWith([source()]))).toBe('render_graph_invalid')
  })

  it('RETRIES rather than refuses when ownership could not be READ', async () => {
    // A database blip is unverified ownership, not disproven ownership.
    // Refusing here would permanently kill a legitimate render.
    assetError = { message: 'connection reset' }
    await expect(fetchWith(planWith([source()]))).rejects.toThrow(/asset read failed/)
  })
})

describe('the checksum that wins is the PLAN\'s', () => {
  it('refuses bytes that do not match what the plan pinned', async () => {
    bytes = 'different bytes entirely'
    // The row still describes the OLD bytes, so only the plan's checksum can
    // catch this.
    expect(await codeOf(planWith([source()]))).toBe('source_bytes_changed')
  })

  it('refuses a re-recorded clip even when the ASSET ROW agrees with the new bytes', async () => {
    // THE CASE THIS FILE EXISTS FOR. A creator re-records "the settings page":
    // the row's checksum moves to the new bytes and the plan's does not. If the
    // row won, this render would composite footage the plan never described —
    // with the plan hash, the graph hash and the manifest all still correct, and
    // nothing anywhere looking wrong.
    bytes = 'the RE-RECORDED clip bytes'
    assetRow = { ...assetRow, content_sha256: sha(bytes) }
    expect(await codeOf(planWith([source({ checksum: sha('the clip bytes') })])))
      .toBe('source_bytes_changed')
  })
})
